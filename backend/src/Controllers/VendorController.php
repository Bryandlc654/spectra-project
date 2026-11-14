<?php

namespace App\Controllers;

use App\Database;
use App\Support\AuditLogger;
use App\Support\Auth;
use App\Support\Cache;
use App\Support\Response;
use App\Support\Xlsx;
use PDO;

/**
 * Proveedores con flujo de aprobación:
 *
 *  - Las empresas (company_admin / user) registran sus proveedores, uno a uno o
 *    importando un Excel/CSV con la plantilla oficial. Entran como "pending".
 *  - Spectra (super_admin, admin, finance) los revisa: aprueba o rechaza con motivo.
 *  - Los aprobados forman el CATÁLOGO GLOBAL, visible para todas las empresas.
 *
 * Rutas (también bajo /api/procurement/vendors):
 *   GET    /api/vendors?scope=catalog|mine|review|all&status=&q=&page=&limit=
 *   POST   /api/vendors
 *   GET    /api/vendors/template          -> plantilla .xlsx
 *   POST   /api/vendors/import            -> multipart "file" (.xlsx o .csv)
 *   GET    /api/vendors/{id}
 *   PUT    /api/vendors/{id}
 *   DELETE /api/vendors/{id}
 *   POST   /api/vendors/{id}/review       -> { decision: approve|reject, reason }
 */
class VendorController
{
    private PDO $pdo;

    private const REVIEWER_ROLES = ['super_admin', 'admin', 'finance'];
    private const COMPANY_ROLES = ['company_admin', 'user', '', 'none'];
    private const MAX_IMPORT_ROWS = 500;
    private const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

    /** Columnas de la plantilla: clave interna => cabecera visible */
    private const TEMPLATE_COLUMNS = [
        'name' => 'Razón social *',
        'tax_id' => 'RUC / Tax ID',
        'category' => 'Categoría',
        'contact_name' => 'Persona de contacto',
        'email' => 'Email',
        'phone' => 'Teléfono',
        'country' => 'País (código ISO2)',
        'website' => 'Sitio web',
        'address' => 'Dirección',
    ];

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->ensureApprovalColumns();
    }

    // ------------------------------------------------------------------
    // Esquema
    // ------------------------------------------------------------------

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS vendors (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                name VARCHAR(200) NOT NULL,
                tax_id VARCHAR(50),
                contact_name VARCHAR(100),
                email VARCHAR(190),
                phone VARCHAR(50),
                address TEXT,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    /** Columnas del flujo de aprobación (idempotente; se comprueba una vez y se cachea). */
    private function ensureApprovalColumns(): void
    {
        if (Cache::get('vendors_approval_schema_v1') === '1') return;
        try {
            $cols = array_column($this->pdo->query("SHOW COLUMNS FROM vendors")->fetchAll(PDO::FETCH_ASSOC), 'Field');
            $add = [
                'contact_name' => "ADD COLUMN contact_name VARCHAR(100) NULL",
                'address' => "ADD COLUMN address TEXT NULL",
                'category' => "ADD COLUMN category VARCHAR(100) NULL",
                'country_iso2' => "ADD COLUMN country_iso2 CHAR(2) NULL",
                'website' => "ADD COLUMN website VARCHAR(255) NULL",
                'approval_status' => "ADD COLUMN approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'",
                'rejection_reason' => "ADD COLUMN rejection_reason TEXT NULL",
                'submitted_by' => "ADD COLUMN submitted_by CHAR(36) NULL",
                'reviewed_by' => "ADD COLUMN reviewed_by CHAR(36) NULL",
                'reviewed_at' => "ADD COLUMN reviewed_at DATETIME NULL",
                'updated_at' => "ADD COLUMN updated_at DATETIME NULL",
            ];
            foreach ($add as $col => $ddl) {
                if (!in_array($col, $cols, true)) $this->pdo->exec("ALTER TABLE vendors $ddl");
            }
            $idx = array_column($this->pdo->query("SHOW INDEX FROM vendors")->fetchAll(PDO::FETCH_ASSOC), 'Key_name');
            if (!in_array('idx_vendors_approval', $idx, true)) {
                $this->pdo->exec("CREATE INDEX idx_vendors_approval ON vendors (approval_status, name)");
            }
            if (!in_array('idx_vendors_tax', $idx, true)) {
                $this->pdo->exec("CREATE INDEX idx_vendors_tax ON vendors (tax_id)");
            }
            Cache::set('vendors_approval_schema_v1', '1', 86400 * 30);
        } catch (\Throwable $e) {
            error_log('[Spectra] vendors schema: ' . $e->getMessage());
        }
    }

    // ------------------------------------------------------------------
    // Enrutado y permisos
    // ------------------------------------------------------------------

    public function handle(array $segments, string $method): void
    {
        $role = (string)(Auth::user()['platform_role'] ?? '');
        if (!$this->isReviewer() && !$this->isCompanyUser()) {
            Response::error('Acceso denegado', 403);
            return;
        }

        $id = $segments[2] ?? null;
        $action = $segments[3] ?? null;

        if ($id === 'template' && $method === 'GET') { $this->template(); return; }
        if ($id === 'import' && $method === 'POST') { $this->import(); return; }

        if ($id) {
            if ($action === 'review' && $method === 'POST') { $this->review($id); return; }
            if ($action) { Response::error('Ruta no encontrada', 404); return; }
            if ($method === 'GET') { $this->show($id); return; }
            if ($method === 'PUT' || $method === 'PATCH') { $this->update($id); return; }
            if ($method === 'DELETE') { $this->delete($id); return; }
            Response::error('Método no permitido', 405);
            return;
        }

        if ($method === 'GET') { $this->index(); return; }
        if ($method === 'POST') { $this->store(); return; }
        Response::error('Método no permitido', 405);
    }

    private function role(): string
    {
        return (string)(Auth::user()['platform_role'] ?? '');
    }

    private function isReviewer(): bool
    {
        return in_array($this->role(), self::REVIEWER_ROLES, true);
    }

    private function isCompanyUser(): bool
    {
        return in_array($this->role(), self::COMPANY_ROLES, true) && $this->myCompanyId() !== null;
    }

    /** Empresa del usuario (nunca se acepta desde la petición). */
    private function myCompanyId(): ?string
    {
        static $cached = false;
        if ($cached !== false) return $cached;
        $uid = Auth::userId();
        $stmt = $this->pdo->prepare("
            SELECT cu.company_id FROM company_users cu
            JOIN companies c ON c.id = cu.company_id AND c.deleted_at IS NULL
            WHERE cu.user_id = :uid AND cu.deleted_at IS NULL
            ORDER BY cu.created_at ASC LIMIT 1
        ");
        $stmt->execute([':uid' => $uid]);
        $cached = $stmt->fetchColumn() ?: null;
        return $cached;
    }

    private function findVendor(string $id): ?array
    {
        $stmt = $this->pdo->prepare("SELECT v.*, c.legal_name AS company_name FROM vendors v LEFT JOIN companies c ON c.id = v.company_id WHERE v.id = :id");
        $stmt->execute([':id' => $id]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /** Lo que una empresa puede ver de un proveedor ajeno del catálogo. */
    private function publicView(array $v): array
    {
        return array_intersect_key($v, array_flip([
            'id', 'name', 'tax_id', 'category', 'contact_name', 'email', 'phone', 'address',
            'country_iso2', 'website', 'approval_status', 'status', 'created_at',
        ]));
    }

    // ------------------------------------------------------------------
    // Listado
    // ------------------------------------------------------------------

    private function index(): void
    {
        $scope = (string)($_GET['scope'] ?? 'catalog');
        $q = trim((string)($_GET['q'] ?? ''));
        $statusFilter = (string)($_GET['status'] ?? '');
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;

        $where = [];
        $params = [];

        if ($scope === 'mine') {
            if (!$this->isCompanyUser()) { Response::error('Solo disponible para empresas', 403); return; }
            $where[] = 'v.company_id = :cid';
            $params[':cid'] = $this->myCompanyId();
        } elseif ($scope === 'review' || $scope === 'all') {
            if (!$this->isReviewer()) { Response::error('Acceso denegado', 403); return; }
            if ($scope === 'review') $where[] = "v.approval_status = 'pending'";
        } else { // catalog
            $scope = 'catalog';
            $where[] = "v.approval_status = 'approved'";
            $where[] = "v.status = 'active'";
        }

        if (in_array($statusFilter, ['pending', 'approved', 'rejected'], true) && $scope !== 'catalog') {
            $where[] = 'v.approval_status = :st';
            $params[':st'] = $statusFilter;
        }
        if ($q !== '') {
            $where[] = '(v.name LIKE :q1 OR v.tax_id LIKE :q2 OR v.category LIKE :q3 OR v.email LIKE :q4)';
            $params[':q1'] = $params[':q2'] = $params[':q3'] = $params[':q4'] = '%' . $q . '%';
        }

        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $count = $this->pdo->prepare("SELECT COUNT(*) FROM vendors v $whereSql");
        $count->execute($params);
        $total = (int)$count->fetchColumn();

        $order = $scope === 'review' ? 'v.created_at ASC' : 'v.name ASC';
        $stmt = $this->pdo->prepare("
            SELECT v.*, c.legal_name AS company_name, u.full_name AS submitted_by_name
            FROM vendors v
            LEFT JOIN companies c ON c.id = v.company_id
            LEFT JOIN users u ON u.id = v.submitted_by
            $whereSql
            ORDER BY $order
            LIMIT :limit OFFSET :offset
        ");
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if ($scope === 'catalog' && !$this->isReviewer()) {
            $rows = array_map(fn($r) => $this->publicView($r), $rows);
        }

        Response::json([
            'data' => $rows,
            'scope' => $scope,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => (int)max(1, ceil($total / $limit)),
            ],
        ]);
    }

    private function show(string $id): void
    {
        $v = $this->findVendor($id);
        if (!$v) { Response::error('Proveedor no encontrado', 404); return; }
        if ($this->isReviewer()) { Response::json(['data' => $v]); return; }
        if ($v['company_id'] === $this->myCompanyId()) { Response::json(['data' => $v]); return; }
        if ($v['approval_status'] === 'approved' && $v['status'] === 'active') { Response::json(['data' => $this->publicView($v)]); return; }
        Response::error('Proveedor no encontrado', 404);
    }

    // ------------------------------------------------------------------
    // Alta, edición y baja
    // ------------------------------------------------------------------

    /** Normaliza y valida un registro. Devuelve [datos, errores]. */
    private function validate(array $in): array
    {
        $d = [
            'name' => trim((string)($in['name'] ?? '')),
            'tax_id' => preg_replace('/\s+/', '', (string)($in['tax_id'] ?? '')),
            'category' => trim((string)($in['category'] ?? '')),
            'contact_name' => trim((string)($in['contact_name'] ?? '')),
            'email' => strtolower(trim((string)($in['email'] ?? ''))),
            'phone' => trim((string)($in['phone'] ?? '')),
            'country_iso2' => strtoupper(trim((string)($in['country_iso2'] ?? ($in['country'] ?? '')))),
            'website' => trim((string)($in['website'] ?? '')),
            'address' => trim((string)($in['address'] ?? '')),
        ];
        $errors = [];
        if ($d['name'] === '') $errors[] = 'La razón social es obligatoria';
        if (mb_strlen($d['name']) > 200) $errors[] = 'La razón social supera 200 caracteres';
        if ($d['tax_id'] !== '' && !preg_match('/^[A-Za-z0-9.\-\/]{3,50}$/', $d['tax_id'])) $errors[] = 'RUC / Tax ID no válido';
        if ($d['email'] !== '' && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'Email no válido';
        if ($d['phone'] !== '' && !preg_match('/^[0-9+()\-\s.]{5,40}$/', $d['phone'])) $errors[] = 'Teléfono no válido';
        if ($d['website'] !== '') {
            if (!preg_match('#^https?://#i', $d['website'])) $d['website'] = 'https://' . $d['website'];
            if (!filter_var($d['website'], FILTER_VALIDATE_URL)) $errors[] = 'Sitio web no válido';
        }
        if ($d['country_iso2'] !== '') {
            $st = $this->pdo->prepare("SELECT 1 FROM countries WHERE iso2 = :c LIMIT 1");
            $st->execute([':c' => $d['country_iso2']]);
            if (!$st->fetchColumn()) $errors[] = 'País no válido (usa el código ISO2, p. ej. PE)';
        }
        foreach (['category' => 100, 'contact_name' => 100, 'address' => 500] as $k => $max) {
            if (mb_strlen($d[$k]) > $max) $errors[] = "El campo $k es demasiado largo";
        }
        foreach ($d as $k => $v) if ($v === '') $d[$k] = null;
        return [$d, $errors];
    }

    /** ¿Ya existe ese RUC en el catálogo aprobado o en la propia empresa? */
    private function duplicateReason(?string $taxId, ?string $companyId, ?string $exceptId = null): ?string
    {
        if (!$taxId) return null;
        $st = $this->pdo->prepare("SELECT company_id, approval_status FROM vendors WHERE tax_id = :t AND (:ex IS NULL OR id <> :ex2)");
        $st->execute([':t' => $taxId, ':ex' => $exceptId, ':ex2' => $exceptId]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if ($r['approval_status'] === 'approved') return 'Ya existe un proveedor aprobado con ese RUC en el catálogo';
            if ($companyId && $r['company_id'] === $companyId && $r['approval_status'] === 'pending') return 'Tu empresa ya envió un proveedor con ese RUC (pendiente de revisión)';
        }
        return null;
    }

    /** Inserta un proveedor. Revisores => aprobado directo; empresas => pendiente. */
    private function insertVendor(array $d): string
    {
        $id = $this->uuid();
        $reviewer = $this->isReviewer();
        $companyId = $reviewer ? ($this->myCompanyId() ?? $this->platformOwnerCompany()) : $this->myCompanyId();
        $stmt = $this->pdo->prepare("
            INSERT INTO vendors (id, company_id, name, tax_id, category, contact_name, email, phone, country_iso2, website, address,
                                 status, approval_status, submitted_by, reviewed_by, reviewed_at, created_at, updated_at)
            VALUES (:id, :cid, :name, :tax, :cat, :contact, :email, :phone, :country, :web, :addr,
                    'active', :appr, :sub, :rev, :revat, NOW(), NOW())
        ");
        $stmt->execute([
            ':id' => $id, ':cid' => $companyId, ':name' => $d['name'], ':tax' => $d['tax_id'], ':cat' => $d['category'],
            ':contact' => $d['contact_name'], ':email' => $d['email'], ':phone' => $d['phone'], ':country' => $d['country_iso2'],
            ':web' => $d['website'], ':addr' => $d['address'],
            ':appr' => $reviewer ? 'approved' : 'pending',
            ':sub' => Auth::userId(),
            ':rev' => $reviewer ? Auth::userId() : null,
            ':revat' => $reviewer ? date('Y-m-d H:i:s') : null,
        ]);
        return $id;
    }

    /** vendors.company_id es obligatorio: para altas del staff sin empresa se usa la primera empresa activa. */
    private function platformOwnerCompany(): string
    {
        $cid = $this->pdo->query("SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1")->fetchColumn();
        if (!$cid) throw new \RuntimeException('No hay empresas activas para asociar el proveedor');
        return (string)$cid;
    }

    private function store(): void
    {
        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) { Response::error('Cuerpo JSON no válido', 400); return; }
        [$d, $errors] = $this->validate($in);
        if ($errors) { Response::error(implode('. ', $errors), 422); return; }
        if ($dup = $this->duplicateReason($d['tax_id'], $this->myCompanyId())) { Response::error($dup, 409); return; }

        $id = $this->insertVendor($d);
        $this->audit($this->isReviewer() ? 'vendor.created_approved' : 'vendor.submitted', $id, ['name' => $d['name'], 'tax_id' => $d['tax_id']]);
        Response::json([
            'message' => $this->isReviewer() ? 'Proveedor creado y aprobado' : 'Proveedor enviado a revisión de Spectra',
            'data' => $this->findVendor($id),
        ], 201);
    }

    private function update(string $id): void
    {
        $v = $this->findVendor($id);
        if (!$v) { Response::error('Proveedor no encontrado', 404); return; }
        $reviewer = $this->isReviewer();
        if (!$reviewer && $v['company_id'] !== $this->myCompanyId()) { Response::error('Proveedor no encontrado', 404); return; }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) { Response::error('Cuerpo JSON no válido', 400); return; }
        [$d, $errors] = $this->validate(array_merge($v, $in));
        if ($errors) { Response::error(implode('. ', $errors), 422); return; }
        if ($dup = $this->duplicateReason($d['tax_id'], $v['company_id'], $id)) { Response::error($dup, 409); return; }

        // Si una empresa modifica un proveedor ya revisado, vuelve a revisión.
        $newStatus = $reviewer ? $v['approval_status'] : 'pending';
        $status = in_array(($in['status'] ?? $v['status']), ['active', 'inactive'], true) ? ($in['status'] ?? $v['status']) : $v['status'];
        if (!$reviewer) $status = $v['status'];

        $stmt = $this->pdo->prepare("
            UPDATE vendors SET name = :name, tax_id = :tax, category = :cat, contact_name = :contact, email = :email,
                phone = :phone, country_iso2 = :country, website = :web, address = :addr, status = :status,
                approval_status = :appr, rejection_reason = IF(:appr2 = 'pending', NULL, rejection_reason),
                reviewed_by = IF(:appr3 = 'pending', NULL, reviewed_by), reviewed_at = IF(:appr4 = 'pending', NULL, reviewed_at),
                updated_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([
            ':name' => $d['name'], ':tax' => $d['tax_id'], ':cat' => $d['category'], ':contact' => $d['contact_name'],
            ':email' => $d['email'], ':phone' => $d['phone'], ':country' => $d['country_iso2'], ':web' => $d['website'],
            ':addr' => $d['address'], ':status' => $status, ':appr' => $newStatus, ':appr2' => $newStatus,
            ':appr3' => $newStatus, ':appr4' => $newStatus, ':id' => $id,
        ]);
        $this->audit('vendor.updated', $id, ['resubmitted' => !$reviewer && $v['approval_status'] !== 'pending']);
        Response::json([
            'message' => (!$reviewer && $v['approval_status'] === 'approved') ? 'Cambios enviados: el proveedor vuelve a revisión' : 'Proveedor actualizado',
            'data' => $this->findVendor($id),
        ]);
    }

    private function delete(string $id): void
    {
        $v = $this->findVendor($id);
        if (!$v) { Response::error('Proveedor no encontrado', 404); return; }
        if (!$this->isReviewer()) {
            if ($v['company_id'] !== $this->myCompanyId()) { Response::error('Proveedor no encontrado', 404); return; }
            if ($v['approval_status'] === 'approved') {
                Response::error('Un proveedor aprobado forma parte del catálogo global; solicita su baja a Spectra', 409);
                return;
            }
        }
        $this->pdo->prepare("DELETE FROM vendors WHERE id = :id")->execute([':id' => $id]);
        $this->audit('vendor.deleted', $id, ['name' => $v['name'], 'tax_id' => $v['tax_id']]);
        Response::json(['message' => 'Proveedor eliminado']);
    }

    // ------------------------------------------------------------------
    // Revisión (Spectra)
    // ------------------------------------------------------------------

    private function review(string $id): void
    {
        if (!$this->isReviewer()) { Response::error('Solo Spectra puede revisar proveedores', 403); return; }
        $v = $this->findVendor($id);
        if (!$v) { Response::error('Proveedor no encontrado', 404); return; }

        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        $decision = (string)($in['decision'] ?? '');
        $reason = trim((string)($in['reason'] ?? ''));
        if (!in_array($decision, ['approve', 'reject'], true)) { Response::error('Decisión no válida (approve o reject)', 422); return; }
        if ($decision === 'reject' && $reason === '') { Response::error('Indica el motivo del rechazo', 422); return; }
        if ($decision === 'approve' && ($dup = $this->duplicateReason($v['tax_id'], null, $id)) && str_contains($dup, 'aprobado')) {
            Response::error($dup, 409);
            return;
        }

        $status = $decision === 'approve' ? 'approved' : 'rejected';
        $stmt = $this->pdo->prepare("
            UPDATE vendors SET approval_status = :st, rejection_reason = :reason, reviewed_by = :rev, reviewed_at = NOW(), updated_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([':st' => $status, ':reason' => $decision === 'reject' ? $reason : null, ':rev' => Auth::userId(), ':id' => $id]);
        $this->audit('vendor.' . $status, $id, ['name' => $v['name'], 'reason' => $reason ?: null], $v['company_id']);
        Response::json(['message' => $status === 'approved' ? 'Proveedor aprobado: ya figura en el catálogo' : 'Proveedor rechazado', 'data' => $this->findVendor($id)]);
    }

    // ------------------------------------------------------------------
    // Plantilla Excel e importación
    // ------------------------------------------------------------------

    private function template(): void
    {
        $headers = array_values(self::TEMPLATE_COLUMNS);
        $example = ['Servicios Generales del Sur S.A.C.', '20601234567', 'Limpieza y mantenimiento', 'María Pérez', 'ventas@ejemplo.com', '+51 999 888 777', 'PE', 'www.ejemplo.com', 'Av. Principal 123, Lima'];

        $countries = $this->pdo->query("SELECT iso2, name FROM countries ORDER BY name")->fetchAll(PDO::FETCH_ASSOC);
        $instructions = [
            ['Cómo completar la plantilla de proveedores'],
            [''],
            ['1. Completa una fila por proveedor en la hoja "Proveedores", a partir de la fila 2.'],
            ['2. Borra la fila de ejemplo antes de importar (o reemplázala por un proveedor real).'],
            ['3. "Razón social" es obligatoria. El resto de columnas es opcional pero recomendable.'],
            ['4. RUC / Tax ID: solo números, letras, puntos o guiones. No repitas proveedores ya aprobados.'],
            ['5. País: usa el código ISO2 de la lista inferior (por ejemplo PE para Perú).'],
            ['6. No cambies el nombre ni el orden de las columnas.'],
            ['7. Máximo ' . self::MAX_IMPORT_ROWS . ' proveedores por archivo. Formatos aceptados: .xlsx o .csv.'],
            ['8. Los proveedores importados quedan "Pendientes" hasta que Spectra los apruebe.'],
            [''],
            ['Códigos de país válidos'],
        ];
        foreach ($countries as $c) $instructions[] = [$c['iso2'] . ' - ' . $c['name']];

        $bin = Xlsx::build([
            ['name' => 'Proveedores', 'rows' => [$headers, $example], 'widths' => [36, 16, 24, 24, 28, 18, 18, 26, 36]],
            ['name' => 'Instrucciones', 'rows' => $instructions, 'widths' => [95], 'header' => true],
        ]);

        // La respuesta por defecto es JSON: se sustituyen las cabeceras
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="plantilla_proveedores_spectra.xlsx"');
        header('Content-Length: ' . strlen($bin));
        header('Cache-Control: no-store');
        echo $bin;
    }

    private function import(): void
    {
        $file = $_FILES['file'] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { Response::error('Adjunta el archivo Excel (.xlsx) o CSV', 422); return; }
        if ((int)$file['size'] > self::MAX_IMPORT_BYTES) { Response::error('El archivo supera 2 MB', 422); return; }

        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        try {
            if ($ext === 'xlsx') {
                $rows = Xlsx::readRows($file['tmp_name'], self::MAX_IMPORT_ROWS + 50);
            } elseif ($ext === 'csv') {
                $rows = Xlsx::readCsvRows($file['tmp_name'], self::MAX_IMPORT_ROWS + 50);
            } else {
                Response::error('Formato no admitido. Usa la plantilla .xlsx (o un .csv)', 422);
                return;
            }
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
            return;
        }

        if (!$rows) { Response::error('El archivo está vacío', 422); return; }

        // Mapear cabeceras (tolerante a mayúsculas, acentos y asteriscos)
        $norm = fn($s) => trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string)$s) ?: (string)$s)));
        $aliases = [];
        foreach (self::TEMPLATE_COLUMNS as $key => $label) $aliases[$norm($label)] = $key;
        $aliases += ['razon social' => 'name', 'nombre' => 'name', 'ruc' => 'tax_id', 'tax id' => 'tax_id', 'pais' => 'country', 'pais iso2' => 'country', 'contacto' => 'contact_name', 'telefono' => 'phone', 'web' => 'website', 'direccion' => 'address', 'categoria' => 'category'];
        $map = [];
        foreach ($rows[0] as $i => $h) {
            $k = $aliases[$norm($h)] ?? null;
            if ($k) $map[$i] = $k;
        }
        if (!in_array('name', $map, true)) {
            Response::error('No se encontró la columna "Razón social". Descarga y usa la plantilla oficial.', 422);
            return;
        }

        $dataRows = array_slice($rows, 1);
        if (count($dataRows) > self::MAX_IMPORT_ROWS) { Response::error('Máximo ' . self::MAX_IMPORT_ROWS . ' proveedores por archivo', 422); return; }

        $created = 0;
        $errors = [];
        $seenTax = [];
        $exampleName = 'servicios generales del sur s a c';
        foreach ($dataRows as $i => $row) {
            $rowNum = $i + 2;
            $rec = [];
            foreach ($map as $col => $key) $rec[$key] = $row[$col] ?? '';
            if (implode('', array_map('trim', $rec)) === '') continue; // fila vacía
            if ($norm($rec['name'] ?? '') === $exampleName) { $errors[] = ['row' => $rowNum, 'name' => $rec['name'], 'message' => 'Es la fila de ejemplo de la plantilla: se omitió']; continue; }

            [$d, $errs] = $this->validate($rec);
            if (!$errs && $d['tax_id']) {
                if (isset($seenTax[$d['tax_id']])) $errs[] = 'RUC repetido en el archivo (fila ' . $seenTax[$d['tax_id']] . ')';
                elseif ($dup = $this->duplicateReason($d['tax_id'], $this->myCompanyId())) $errs[] = $dup;
            }
            if ($errs) { $errors[] = ['row' => $rowNum, 'name' => $rec['name'] ?? '', 'message' => implode('. ', $errs)]; continue; }
            if ($d['tax_id']) $seenTax[$d['tax_id']] = $rowNum;
            $this->insertVendor($d);
            $created++;
        }

        $this->audit('vendor.imported', null, ['created' => $created, 'errors' => count($errors), 'file' => (string)$file['name']]);
        Response::json([
            'message' => $created > 0
                ? ($this->isReviewer() ? "$created proveedores importados y aprobados" : "$created proveedores enviados a revisión de Spectra")
                : 'No se importó ningún proveedor',
            'created' => $created,
            'errors' => $errors,
        ], $created > 0 ? 201 : 422);
    }

    // ------------------------------------------------------------------

    private function audit(string $action, ?string $id, array $details = [], ?string $companyId = null): void
    {
        try {
            (new AuditLogger())->log($action, 'vendor', $id, $details, $companyId ?? $this->myCompanyId());
        } catch (\Throwable $e) {
        }
    }

    private function uuid(): string
    {
        $d = random_bytes(16);
        $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
        $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
    }
}
