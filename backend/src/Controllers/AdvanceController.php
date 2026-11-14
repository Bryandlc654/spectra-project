<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

/**
 * Adelantos de sueldo.
 *
 * Flujo:
 *   1. El FREELANCER solicita el adelanto                     -> pending
 *   2. El COMPANY ADMIN de su empresa lo aprueba o rechaza     -> approved | rejected
 *   3. SPECTRA (super_admin/admin/finance) lo gestiona:
 *        approved  -> disbursed (desembolsado) | rejected
 *        disbursed -> paid (recuperado) | overdue (vencido)
 *        overdue   -> paid
 *   El freelancer puede cancelar mientras siga en pending.
 */
class AdvanceController
{
    private const STATUSES = ['pending', 'approved', 'rejected', 'disbursed', 'paid', 'overdue', 'cancelled'];
    private const SPECTRA_ROLES = ['super_admin', 'admin', 'finance'];
    private const SPECTRA_READ_ROLES = ['super_admin', 'admin', 'finance', 'support'];
    private const FREELANCER_ROLES = ['freelancer', 'freelance'];

    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->ensureExtensions();
    }

    private function ensureExtensions(): void
    {
        if (\App\Support\Cache::get('salary_advance_extensions_v1') === null) {
            try {
                $columns = [
                    'company_id' => "ALTER TABLE salary_advances ADD COLUMN company_id CHAR(36) NULL AFTER user_id",
                    'decision_by_user_id' => "ALTER TABLE salary_advances ADD COLUMN decision_by_user_id CHAR(36) NULL AFTER status",
                    'decision_notes' => "ALTER TABLE salary_advances ADD COLUMN decision_notes TEXT NULL AFTER decision_by_user_id",
                    'decision_at' => "ALTER TABLE salary_advances ADD COLUMN decision_at DATETIME NULL AFTER decision_notes",
                ];
                $this->addMissingColumns($columns);

                $this->pdo->exec("
                    UPDATE salary_advances sa
                    JOIN (
                        SELECT user_id, MIN(company_id) AS company_id
                        FROM company_users
                        GROUP BY user_id
                    ) cu ON cu.user_id = sa.user_id
                    SET sa.company_id = cu.company_id
                    WHERE sa.company_id IS NULL
                ");

                \App\Support\Cache::set('salary_advance_extensions_v1', time(), 86400 * 365);
            } catch (\Throwable $e) {
                error_log('[Advances] Extension migration failed: ' . $e->getMessage());
            }
        }

        // v2: flujo en dos etapas (empresa aprueba, Spectra gestiona)
        if (\App\Support\Cache::get('salary_advance_workflow_v2') === null) {
            try {
                $this->pdo->exec("
                    ALTER TABLE salary_advances MODIFY COLUMN status
                    ENUM('pending','approved','rejected','disbursed','paid','overdue','cancelled') DEFAULT 'pending'
                ");
                $this->addMissingColumns([
                    'company_decision_by' => "ALTER TABLE salary_advances ADD COLUMN company_decision_by CHAR(36) NULL",
                    'company_decision_at' => "ALTER TABLE salary_advances ADD COLUMN company_decision_at DATETIME NULL",
                    'company_decision_notes' => "ALTER TABLE salary_advances ADD COLUMN company_decision_notes TEXT NULL",
                    'spectra_managed_by' => "ALTER TABLE salary_advances ADD COLUMN spectra_managed_by CHAR(36) NULL",
                    'spectra_notes' => "ALTER TABLE salary_advances ADD COLUMN spectra_notes TEXT NULL",
                    'disbursed_at' => "ALTER TABLE salary_advances ADD COLUMN disbursed_at DATETIME NULL",
                    'disbursement_ref' => "ALTER TABLE salary_advances ADD COLUMN disbursement_ref VARCHAR(100) NULL",
                    'repaid_at' => "ALTER TABLE salary_advances ADD COLUMN repaid_at DATETIME NULL",
                ]);
                \App\Support\Cache::set('salary_advance_workflow_v2', time(), 86400 * 365);
            } catch (\Throwable $e) {
                error_log('[Advances] Workflow migration failed: ' . $e->getMessage());
            }
        }
    }

    private function addMissingColumns(array $columns): void
    {
        foreach ($columns as $column => $sql) {
            if (!$this->columnExists('salary_advances', $column)) {
                try {
                    $this->pdo->exec($sql);
                } catch (\Throwable $e) { }
            }
        }
    }

    private function columnExists(string $table, string $column): bool
    {
        $stmt = $this->pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $this->pdo->quote($column));
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS salary_advances (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_repayment_amount DECIMAL(15, 2) GENERATED ALWAYS AS (amount + fee) STORED,
                repayment_date DATE NOT NULL,
                status ENUM('pending','approved','rejected','disbursed','paid','overdue','cancelled') DEFAULT 'pending',
                reason TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS advance_repayments (
                id CHAR(36) PRIMARY KEY,
                advance_id CHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                method VARCHAR(50) DEFAULT 'manual', -- deduction, manual, bank_transfer
                transaction_ref VARCHAR(100) NULL,
                FOREIGN KEY (advance_id) REFERENCES salary_advances(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/advances[/{id}]
        $id = $segments[2] ?? null;

        if ($id) {
            if ($method === 'GET') {
                $this->show($id);
            } elseif ($method === 'PUT' || $method === 'PATCH') {
                $this->update($id);
            } else {
                Response::error('Method not allowed', 405);
            }
            return;
        }

        if ($method === 'GET') {
            $this->index();
        } elseif ($method === 'POST') {
            $this->store();
        } else {
            Response::error('Method not allowed', 405);
        }
    }

    // ---------------------------------------------------------------------
    // Lectura
    // ---------------------------------------------------------------------

    private function index(): void
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';
        $isSpectra = in_array($role, self::SPECTRA_READ_ROLES, true);
        $companyId = $this->resolveCompanyId($user, $_GET['company_id'] ?? null);
        $isCompanyAdmin = !$isSpectra && $this->isCompanyAdminOf($user, $companyId);

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $where = [];
        $params = [];

        if ($isSpectra) {
            if (!empty($_GET['company_id'])) {
                $where[] = 'sa.company_id = :company_id';
                $params[':company_id'] = (string)$_GET['company_id'];
            }
        } elseif ($isCompanyAdmin) {
            $where[] = 'sa.company_id = :company_id';
            $params[':company_id'] = $companyId;
        } else {
            $where[] = 'sa.user_id = :user_id';
            $params[':user_id'] = $user['id'];
        }

        $status = trim((string)($_GET['status'] ?? ''));
        if ($status !== '' && in_array($status, self::STATUSES, true)) {
            $where[] = 'sa.status = :status';
            $params[':status'] = $status;
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = "
            SELECT sa.*, u.full_name AS user_name, u.email AS user_email, c.legal_name AS company_name,
                   cd.full_name AS company_decision_by_name, sm.full_name AS spectra_managed_by_name
            FROM salary_advances sa
            LEFT JOIN users u ON u.id = sa.user_id
            LEFT JOIN companies c ON c.id = sa.company_id
            LEFT JOIN users cd ON cd.id = sa.company_decision_by
            LEFT JOIN users sm ON sm.id = sa.spectra_managed_by
            $whereClause
            ORDER BY sa.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM salary_advances sa $whereClause");
        foreach ($params as $key => $value) {
            $countStmt->bindValue($key, $value);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $items,
            'viewer' => $isSpectra ? 'spectra' : ($isCompanyAdmin ? 'company_admin' : 'requester'),
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => (int)ceil($total / $limit),
            ],
        ]);
    }

    private function show(string $id): void
    {
        $user = Auth::user();
        $item = $this->fetchAdvance($id);

        if (!$item) {
            Response::error('Adelanto no encontrado', 404);
            return;
        }
        if (!$this->canAccessAdvance($user, $item)) {
            Response::error('No autorizado', 403);
            return;
        }

        Response::json(['data' => $item]);
    }

    // ---------------------------------------------------------------------
    // Paso 1: el freelancer solicita
    // ---------------------------------------------------------------------

    private function store(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', self::FREELANCER_ROLES, true)) {
            Response::error('Solo los freelancers pueden solicitar adelantos de sueldo', 403);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true) ?: [];

        $amount = (float)($data['amount'] ?? 0);
        if ($amount <= 0) {
            Response::error('El monto debe ser mayor a cero', 422);
            return;
        }

        $repaymentDate = trim((string)($data['repayment_date'] ?? ''));
        $d = \DateTime::createFromFormat('Y-m-d', $repaymentDate);
        if (!$d || $d->format('Y-m-d') !== $repaymentDate) {
            Response::error('Fecha de descuento inválida (formato AAAA-MM-DD)', 422);
            return;
        }
        if ($repaymentDate <= date('Y-m-d')) {
            Response::error('La fecha de descuento debe ser posterior a hoy', 422);
            return;
        }

        $companyId = $this->resolveFreelancerCompany($user, isset($data['company_id']) ? (string)$data['company_id'] : null);
        if (!$companyId) {
            Response::error('No tienes un contrato activo con una empresa para solicitar el adelanto', 422);
            return;
        }

        // Una sola solicitud abierta por freelancer y empresa
        $stmt = $this->pdo->prepare("
            SELECT COUNT(*) FROM salary_advances
            WHERE user_id = :uid AND company_id = :cid AND status IN ('pending', 'approved')
        ");
        $stmt->execute([':uid' => $user['id'], ':cid' => $companyId]);
        if ((int)$stmt->fetchColumn() > 0) {
            Response::error('Ya tienes una solicitud de adelanto en curso con esta empresa', 409);
            return;
        }

        $fee = round($amount * 0.02, 2);
        $id = $this->uuid();
        $reason = trim((string)($data['reason'] ?? ''));

        $stmt = $this->pdo->prepare("
            INSERT INTO salary_advances (id, user_id, company_id, amount, fee, repayment_date, status, reason)
            VALUES (:id, :uid, :cid, :amount, :fee, :date, 'pending', :reason)
        ");
        $stmt->execute([
            ':id' => $id,
            ':uid' => $user['id'],
            ':cid' => $companyId,
            ':amount' => $amount,
            ':fee' => $fee,
            ':date' => $repaymentDate,
            ':reason' => $reason !== '' ? mb_substr($reason, 0, 1000) : null,
        ]);

        $this->audit('salary_advance.requested', $id, ['company_id' => $companyId, 'amount' => $amount]);
        $requester = $user['full_name'] ?? $user['email'] ?? 'Un freelancer';
        $this->notifyCompanyAdmins(
            $companyId,
            'Nueva solicitud de adelanto',
            "{$requester} solicitó un adelanto de sueldo por " . number_format($amount, 2) . '. Revísalo para aprobarlo o rechazarlo.'
        );

        Response::json(['message' => 'Solicitud de adelanto enviada a tu empresa', 'id' => $id], 201);
    }

    // ---------------------------------------------------------------------
    // Pasos 2 y 3: empresa aprueba, Spectra gestiona
    // ---------------------------------------------------------------------

    private function update(string $id): void
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';

        $advance = $this->fetchAdvance($id);
        if (!$advance) {
            Response::error('Adelanto no encontrado', 404);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $target = (string)($data['status'] ?? '');
        $current = (string)$advance['status'];
        $notes = trim((string)($data['notes'] ?? $data['decision_notes'] ?? ''));
        $notes = $notes !== '' ? mb_substr($notes, 0, 2000) : null;

        $isSpectra = in_array($role, self::SPECTRA_ROLES, true);
        $isOwner = ($advance['user_id'] ?? null) === ($user['id'] ?? null);
        $isCompanyAdmin = !$isSpectra && !empty($advance['company_id'])
            && $this->isCompanyAdminOf($user, (string)$advance['company_id']);

        // Transiciones permitidas por actor
        $companyTransitions = ['pending' => ['approved', 'rejected']];
        $spectraTransitions = [
            'approved' => ['disbursed', 'rejected'],
            'disbursed' => ['paid', 'overdue'],
            'overdue' => ['paid'],
        ];
        $ownerTransitions = ['pending' => ['cancelled']];

        if ($isCompanyAdmin && in_array($target, $companyTransitions[$current] ?? [], true)) {
            $actor = 'company';
        } elseif ($isSpectra && in_array($target, $spectraTransitions[$current] ?? [], true)) {
            $actor = 'spectra';
        } elseif ($isOwner && in_array($target, $ownerTransitions[$current] ?? [], true)) {
            $actor = 'owner';
        } else {
            if (!$isCompanyAdmin && !$isSpectra && !$isOwner) {
                Response::error('No autorizado', 403);
                return;
            }
            Response::error($this->transitionHint($current, $isCompanyAdmin, $isSpectra), 422);
            return;
        }

        if ($target === 'rejected' && $notes === null) {
            Response::error('Indica el motivo del rechazo', 422);
            return;
        }

        $sets = ['status = :status', 'decision_by_user_id = :uid', 'decision_notes = :notes', 'decision_at = NOW()'];
        $params = [':status' => $target, ':uid' => $user['id'], ':notes' => $notes, ':id' => $id, ':current' => $current];

        // Con ATTR_EMULATE_PREPARES=false no se puede repetir un placeholder
        if ($actor === 'company') {
            $sets[] = 'company_decision_by = :uid_company';
            $sets[] = 'company_decision_at = NOW()';
            $sets[] = 'company_decision_notes = :notes_company';
            $params[':uid_company'] = $user['id'];
            $params[':notes_company'] = $notes;
        } elseif ($actor === 'spectra') {
            $sets[] = 'spectra_managed_by = :uid_spectra';
            $params[':uid_spectra'] = $user['id'];
            if ($notes !== null) {
                $sets[] = 'spectra_notes = :notes_spectra';
                $params[':notes_spectra'] = $notes;
            }
            if ($target === 'disbursed') {
                $sets[] = 'disbursed_at = NOW()';
                $ref = trim((string)($data['disbursement_ref'] ?? ''));
                $sets[] = 'disbursement_ref = :ref';
                $params[':ref'] = $ref !== '' ? mb_substr($ref, 0, 100) : null;
            }
            if ($target === 'paid') {
                $sets[] = 'repaid_at = NOW()';
            }
        }

        // `status = :current` evita carreras entre dos aprobadores simultáneos
        $stmt = $this->pdo->prepare("UPDATE salary_advances SET " . implode(', ', $sets) . " WHERE id = :id AND status = :current");
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            Response::error('El adelanto cambió de estado mientras lo revisabas. Recarga la página.', 409);
            return;
        }

        if ($target === 'paid') {
            try {
                $this->pdo->prepare("
                    INSERT INTO advance_repayments (id, advance_id, amount, method, transaction_ref)
                    VALUES (:id, :aid, :amount, :method, :ref)
                ")->execute([
                    ':id' => $this->uuid(),
                    ':aid' => $id,
                    ':amount' => (float)$advance['amount'] + (float)$advance['fee'],
                    ':method' => in_array($data['repayment_method'] ?? '', ['deduction', 'manual', 'bank_transfer'], true) ? $data['repayment_method'] : 'deduction',
                    ':ref' => !empty($data['repayment_ref']) ? mb_substr((string)$data['repayment_ref'], 0, 100) : null,
                ]);
            } catch (\Throwable $e) {
                error_log('[Advances] repayment insert failed: ' . $e->getMessage());
            }
        }

        $this->audit('salary_advance.' . $target, $id, ['from' => $current, 'actor' => $actor, 'notes' => $notes]);
        $this->notifyTransition($advance, $target, $notes);

        $messages = [
            'approved' => 'Adelanto aprobado. Spectra se encargará del desembolso.',
            'rejected' => 'Adelanto rechazado',
            'disbursed' => 'Adelanto marcado como desembolsado',
            'paid' => 'Adelanto marcado como recuperado',
            'overdue' => 'Adelanto marcado como vencido',
            'cancelled' => 'Solicitud cancelada',
        ];
        Response::json(['message' => $messages[$target] ?? 'Adelanto actualizado', 'status' => $target]);
    }

    private function transitionHint(string $current, bool $isCompanyAdmin, bool $isSpectra): string
    {
        if ($isSpectra && $current === 'pending') {
            return 'La empresa del freelancer debe aprobar el adelanto antes de que Spectra lo gestione';
        }
        if ($isCompanyAdmin && in_array($current, ['approved', 'disbursed', 'overdue'], true)) {
            return 'Este adelanto ya fue aprobado; ahora lo gestiona Spectra';
        }
        return 'Cambio de estado no permitido desde "' . $current . '"';
    }

    // ---------------------------------------------------------------------
    // Notificaciones
    // ---------------------------------------------------------------------

    private function notifyTransition(array $advance, string $target, ?string $notes): void
    {
        $amount = number_format((float)$advance['amount'], 2);
        $suffix = $notes ? " Motivo: {$notes}" : '';
        $uid = (string)$advance['user_id'];
        $cid = (string)($advance['company_id'] ?? '');

        switch ($target) {
            case 'approved':
                $this->notify($uid, $cid, 'success', 'Adelanto aprobado por tu empresa', "Tu adelanto por {$amount} fue aprobado. Spectra procesará el desembolso.");
                $this->notifySpectra($cid, 'Adelanto pendiente de desembolso', "La empresa aprobó un adelanto por {$amount}. Gestiona el desembolso.");
                break;
            case 'rejected':
                $this->notify($uid, $cid, 'error', 'Adelanto rechazado', "Tu solicitud de adelanto por {$amount} fue rechazada.{$suffix}");
                break;
            case 'disbursed':
                $this->notify($uid, $cid, 'success', 'Adelanto desembolsado', "Spectra desembolsó tu adelanto por {$amount}.");
                $this->notifyCompanyAdmins($cid, 'Adelanto desembolsado', "Spectra desembolsó un adelanto por {$amount} aprobado por tu empresa.");
                break;
            case 'overdue':
                $this->notify($uid, $cid, 'warning', 'Adelanto vencido', "Tu adelanto por {$amount} está vencido.");
                break;
            case 'paid':
                $this->notify($uid, $cid, 'info', 'Adelanto saldado', "Tu adelanto por {$amount} quedó saldado.");
                break;
            case 'cancelled':
                $this->notifyCompanyAdmins($cid, 'Solicitud de adelanto cancelada', "El freelancer canceló su solicitud de adelanto por {$amount}.");
                break;
        }
    }

    private function notify(string $userId, string $companyId, string $type, string $title, string $message): void
    {
        if ($userId === '') return;
        try {
            $this->pdo->prepare("
                INSERT INTO notifications (id, user_id, company_id, type, title, message, link, is_read, created_at)
                VALUES (:id, :uid, :cid, :type, :title, :msg, '/dashboard/profile/advances', 0, NOW())
            ")->execute([
                ':id' => $this->uuid(),
                ':uid' => $userId,
                ':cid' => $companyId !== '' ? $companyId : null,
                ':type' => $type,
                ':title' => $title,
                ':msg' => $message,
            ]);
        } catch (\Throwable $e) {
            error_log('[Advances] notify failed: ' . $e->getMessage());
        }
    }

    private function notifyCompanyAdmins(string $companyId, string $title, string $message): void
    {
        if ($companyId === '') return;
        try {
            $stmt = $this->pdo->prepare("
                SELECT DISTINCT u.id
                FROM company_users cu
                JOIN users u ON u.id = cu.user_id
                LEFT JOIN user_roles ur ON ur.company_user_id = cu.id
                LEFT JOIN roles r ON r.id = ur.role_id
                WHERE cu.company_id = :cid
                  AND cu.status = 'active'
                  AND (u.platform_role = 'company_admin' OR LOWER(r.name) IN ('admin', 'company admin', 'company_admin'))
            ");
            $stmt->execute([':cid' => $companyId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $adminId) {
                $this->notify((string)$adminId, $companyId, 'info', $title, $message);
            }
        } catch (\Throwable $e) {
            error_log('[Advances] notifyCompanyAdmins failed: ' . $e->getMessage());
        }
    }

    private function notifySpectra(string $companyId, string $title, string $message): void
    {
        try {
            $stmt = $this->pdo->query("
                SELECT id FROM users
                WHERE platform_role IN ('super_admin', 'admin', 'finance') AND status = 'active'
                LIMIT 50
            ");
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $staffId) {
                $this->notify((string)$staffId, $companyId, 'info', $title, $message);
            }
        } catch (\Throwable $e) {
            error_log('[Advances] notifySpectra failed: ' . $e->getMessage());
        }
    }

    private function audit(string $action, string $id, array $meta): void
    {
        try {
            (new \App\Support\AuditLogger())->log($action, 'salary_advance', $id, $meta);
        } catch (\Throwable $e) { }
    }

    // ---------------------------------------------------------------------
    // Permisos y resolución de empresa
    // ---------------------------------------------------------------------

    private function fetchAdvance(string $id): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT sa.*, u.full_name AS user_name, u.email AS user_email, c.legal_name AS company_name
            FROM salary_advances sa
            LEFT JOIN users u ON u.id = sa.user_id
            LEFT JOIN companies c ON c.id = sa.company_id
            WHERE sa.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * Empresa a la que el freelancer pide el adelanto: debe tener un contrato
     * activo con ella. Si indica company_id se valida; si no, se usa la del
     * contrato activo más reciente (o su empresa de sesión si tiene contrato).
     */
    private function resolveFreelancerCompany(array $user, ?string $requested): ?string
    {
        $uid = (string)($user['id'] ?? '');
        if ($uid === '') return null;

        try {
            if ($requested) {
                $stmt = $this->pdo->prepare("
                    SELECT company_id FROM contracts
                    WHERE freelancer_id = :uid AND company_id = :cid AND status = 'active'
                    LIMIT 1
                ");
                $stmt->execute([':uid' => $uid, ':cid' => $requested]);
                $cid = $stmt->fetchColumn();
                return $cid ? (string)$cid : null;
            }

            $stmt = $this->pdo->prepare("
                SELECT company_id FROM contracts
                WHERE freelancer_id = :uid AND status = 'active'
                ORDER BY (company_id = :sess) DESC, start_date DESC
                LIMIT 1
            ");
            $stmt->execute([':uid' => $uid, ':sess' => (string)($user['company_id'] ?? '')]);
            $cid = $stmt->fetchColumn();
            return $cid ? (string)$cid : null;
        } catch (\Throwable $e) {
            error_log('[Advances] resolveFreelancerCompany failed: ' . $e->getMessage());
            return null;
        }
    }

    private function resolveCompanyId(array $user, ?string $requestedCompanyId = null): ?string
    {
        $role = $user['platform_role'] ?? '';
        if ($requestedCompanyId && in_array($role, self::SPECTRA_READ_ROLES, true)) {
            return $requestedCompanyId;
        }

        if (!empty($user['company_id'])) {
            return (string)$user['company_id'];
        }

        if (empty($user['id'])) return null;

        $stmt = $this->pdo->prepare("
            SELECT company_id
            FROM company_users
            WHERE user_id = :uid AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        ");
        $stmt->execute([':uid' => $user['id']]);
        $companyId = $stmt->fetchColumn();

        return $companyId ? (string)$companyId : null;
    }

    /**
     * ¿Es el usuario administrador de ESA empresa? (no de cualquiera)
     */
    private function isCompanyAdminOf(array $user, ?string $companyId): bool
    {
        if (!$companyId || empty($user['id'])) return false;

        try {
            $stmt = $this->pdo->prepare("
                SELECT 1
                FROM company_users cu
                JOIN users u ON u.id = cu.user_id
                LEFT JOIN user_roles ur ON ur.company_user_id = cu.id
                LEFT JOIN roles r ON r.id = ur.role_id
                WHERE cu.user_id = :uid
                  AND cu.company_id = :cid
                  AND cu.status = 'active'
                  AND (u.platform_role = 'company_admin' OR LOWER(r.name) IN ('admin', 'company admin', 'company_admin'))
                LIMIT 1
            ");
            $stmt->execute([':uid' => $user['id'], ':cid' => $companyId]);
            return (bool)$stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function canAccessAdvance(array $user, array $advance): bool
    {
        if (($advance['user_id'] ?? null) === ($user['id'] ?? null)) return true;
        if (in_array($user['platform_role'] ?? '', self::SPECTRA_READ_ROLES, true)) return true;
        return !empty($advance['company_id']) && $this->isCompanyAdminOf($user, (string)$advance['company_id']);
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
