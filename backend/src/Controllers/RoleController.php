<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use PDO;
use App\Support\Auth;

class RoleController
{
    private PDO $pdo;

    // Defined Templates
    private const TEMPLATES = [
        'admin_company' => [
            'name' => 'Admin Empresa',
            'description' => 'Acceso total a la empresa',
            'permissions' => ['*'] 
        ],
        'hr' => [
            'name' => 'HR',
            'description' => 'Gestión de personas, contratos y tiempos',
            'permissions' => [
                'users.read', 'users.write', 
                'contracts.read', 'contracts.write', 
                'timesheets.read', 'timesheets.approve',
                'payroll.read', 'payroll.write',
                'benefits.read', 'benefits.write',
                'time_off.read', 'time_off.write'
            ]
        ],
        'finance' => [
            'name' => 'Finanzas',
            'description' => 'Facturación, pagos y billeteras',
            'permissions' => [
                'invoices.read', 'invoices.write',
                'payouts.read', 'payouts.write',
                'wallets.read', 'wallets.write',
                'requisitions.read', 'requisitions.approve',
                'expenses.read', 'expenses.approve',
                'payroll.read'
            ]
        ],
        'legal' => [
            'name' => 'Legal',
            'description' => 'Contratos y cumplimiento',
            'permissions' => [
                'contracts.read', 'contracts.write',
                'legal.approve',
                'compliance.read', 'compliance.write'
            ]
        ],
        'procurement' => [
            'name' => 'Compras',
            'description' => 'Proveedores y requisiciones',
            'permissions' => [
                'vendors.read', 'vendors.write',
                'requisitions.read', 'requisitions.write'
            ]
        ],
        'it_admin' => [
            'name' => 'IT Admin',
            'description' => 'Equipamiento e integraciones',
            'permissions' => [
                'equipment.read', 'equipment.write',
                'integrations.read', 'integrations.write'
            ]
        ]
    ];

    private const STANDARD_PERMISSIONS = [
        // Users & Org
        ['code' => 'users.read', 'module' => 'users', 'description' => 'Ver lista de empleados y miembros'],
        ['code' => 'users.write', 'module' => 'users', 'description' => 'Crear, editar y eliminar empleados'],
        ['code' => 'roles.read', 'module' => 'roles', 'description' => 'Ver roles y permisos'],
        ['code' => 'roles.write', 'module' => 'roles', 'description' => 'Gestionar roles y permisos'],
        
        // Contracts
        ['code' => 'contracts.read', 'module' => 'contracts', 'description' => 'Ver contratos'],
        ['code' => 'contracts.write', 'module' => 'contracts', 'description' => 'Crear y firmar contratos'],
        
        // Finance
        ['code' => 'invoices.read', 'module' => 'finance', 'description' => 'Ver facturas'],
        ['code' => 'invoices.write', 'module' => 'finance', 'description' => 'Crear y pagar facturas'],
        ['code' => 'wallets.read', 'module' => 'finance', 'description' => 'Ver saldo y movimientos'],
        ['code' => 'wallets.write', 'module' => 'finance', 'description' => 'Realizar depósitos y retiros'],
        ['code' => 'payouts.read', 'module' => 'finance', 'description' => 'Ver nóminas pagadas'],
        ['code' => 'payouts.write', 'module' => 'finance', 'description' => 'Ejecutar pagos de nómina'],
        
        // Procurement
        ['code' => 'vendors.read', 'module' => 'procurement', 'description' => 'Ver proveedores'],
        ['code' => 'vendors.write', 'module' => 'procurement', 'description' => 'Gestionar proveedores'],
        ['code' => 'requisitions.read', 'module' => 'procurement', 'description' => 'Ver solicitudes de compra'],
        ['code' => 'requisitions.write', 'module' => 'procurement', 'description' => 'Crear solicitudes de compra'],
        ['code' => 'requisitions.approve', 'module' => 'procurement', 'description' => 'Aprobar solicitudes de compra'],
        
        // Expenses
        ['code' => 'expenses.read', 'module' => 'expenses', 'description' => 'Ver gastos'],
        ['code' => 'expenses.write', 'module' => 'expenses', 'description' => 'Reportar gastos'],
        ['code' => 'expenses.approve', 'module' => 'expenses', 'description' => 'Aprobar reportes de gastos'],
        
        // Projects & Time
        ['code' => 'projects.read', 'module' => 'projects', 'description' => 'Ver proyectos'],
        ['code' => 'projects.write', 'module' => 'projects', 'description' => 'Gestionar proyectos'],
        ['code' => 'timesheets.read', 'module' => 'time', 'description' => 'Ver hojas de tiempo'],
        ['code' => 'timesheets.write', 'module' => 'time', 'description' => 'Registrar tiempo'],
        ['code' => 'timesheets.approve', 'module' => 'time', 'description' => 'Aprobar hojas de tiempo'],
        ['code' => 'time_off.read', 'module' => 'time', 'description' => 'Ver solicitudes de ausencia'],
        ['code' => 'time_off.write', 'module' => 'time', 'description' => 'Solicitar ausencias'],
        
        // Payroll & Benefits
        ['code' => 'payroll.read', 'module' => 'payroll', 'description' => 'Ver nómina'],
        ['code' => 'payroll.write', 'module' => 'payroll', 'description' => 'Gestionar ciclos de nómina'],
        ['code' => 'benefits.read', 'module' => 'benefits', 'description' => 'Ver beneficios'],
        ['code' => 'benefits.write', 'module' => 'benefits', 'description' => 'Gestionar planes de beneficios'],
        
        // Assets & IT
        ['code' => 'equipment.read', 'module' => 'equipment', 'description' => 'Ver inventario'],
        ['code' => 'equipment.write', 'module' => 'equipment', 'description' => 'Gestionar asignaciones de equipos'],
        ['code' => 'integrations.read', 'module' => 'integrations', 'description' => 'Ver integraciones'],
        ['code' => 'integrations.write', 'module' => 'integrations', 'description' => 'Configurar integraciones'],
        
        // Legal
        ['code' => 'legal.approve', 'module' => 'legal', 'description' => 'Aprobación legal de documentos'],
        ['code' => 'compliance.read', 'module' => 'legal', 'description' => 'Ver estado de compliance'],
        ['code' => 'compliance.write', 'module' => 'legal', 'description' => 'Gestionar requisitos de compliance'],
        
        // Reports
        ['code' => 'reports.read', 'module' => 'reports', 'description' => 'Acceso a reportes y analíticas']
    ];

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->seedPermissions();
    }

    private function ensureTables(): void
    {
        // 1. Roles Table
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS roles (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                name VARCHAR(100) NOT NULL,
                is_system BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_company (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Migration: Add deleted_at column to roles if not exists
        try {
            $stmt = $this->pdo->query("SHOW COLUMNS FROM roles LIKE 'deleted_at'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE roles ADD COLUMN deleted_at DATETIME NULL");
            }
            
            // Also check for updated_at just in case
            $stmt = $this->pdo->query("SHOW COLUMNS FROM roles LIKE 'updated_at'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE roles ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            }
        } catch (\Throwable $e) {
            // Ignore
        }

        // 2. Permissions Table
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS permissions (
                id CHAR(36) PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                module VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Migration: Add module column if not exists
        try {
            $stmt = $this->pdo->query("SHOW COLUMNS FROM permissions LIKE 'module'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE permissions ADD COLUMN module VARCHAR(50) AFTER code");
            }
            
            $stmt = $this->pdo->query("SHOW COLUMNS FROM permissions LIKE 'description'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE permissions ADD COLUMN description TEXT AFTER code");
            }

            $stmt = $this->pdo->query("SHOW COLUMNS FROM permissions LIKE 'created_at'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE permissions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
            }
        } catch (\Throwable $e) {
            // Ignore if fails, assuming column exists or permissions issue
        }

        // 3. Role Permissions (Many-to-Many)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id CHAR(36) NOT NULL,
                permission_id CHAR(36) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (role_id, permission_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // 4. User Roles (Many-to-Many: CompanyUser <-> Role)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS user_roles (
                company_user_id CHAR(36) NOT NULL,
                role_id CHAR(36) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (company_user_id, role_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // 5. System Role Permissions (for dynamic platform roles)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS system_role_permissions (
                role_key VARCHAR(50) NOT NULL,
                module VARCHAR(50) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (role_key, module)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function seedPermissions(): void
    {
        // 1. Check if permissions exist (optimization)
        $stmt = $this->pdo->query("SELECT COUNT(*) FROM permissions");
        $count = $stmt->fetchColumn();
        if ($count > 0) {
            if ($count >= count(self::STANDARD_PERMISSIONS)) {
                return;
            }
        }

        $sql = "INSERT IGNORE INTO permissions (id, code, module, description, created_at) VALUES (:id, :code, :module, :desc, NOW())";
        $stmt = $this->pdo->prepare($sql);

        // Check for existing codes to avoid unnecessary UUID generation/inserts
        $existingCodes = $this->pdo->query("SELECT code FROM permissions")->fetchAll(PDO::FETCH_COLUMN);
        
        foreach (self::STANDARD_PERMISSIONS as $perm) {
            if (in_array($perm['code'], $existingCodes)) continue;

            $stmt->execute([
                ':id' => $this->uuid(),
                ':code' => $perm['code'],
                ':module' => $perm['module'],
                ':desc' => $perm['description']
            ]);
        }
    }

    public function handle(array $segments, string $method)
    {
        $resource = $segments[1] ?? null;
        
        // /api/roles/system/permissions
        if ($resource === 'roles' && ($segments[2] ?? '') === 'system' && ($segments[3] ?? '') === 'permissions') {
             if (!$this->requireRbacManager()) return;
             // ensureTables called in constructor now
             if ($method === 'GET') {
                 $this->getSystemPermissions();
             } elseif ($method === 'POST') {
                 $this->saveSystemPermissions();
             }
             return;
        }

        // /api/roles/system/stats
        if ($resource === 'roles' && ($segments[2] ?? '') === 'system' && ($segments[3] ?? '') === 'stats') {
             if (!$this->requireRbacManager()) return;
             if ($method === 'GET') {
                 $this->getSystemRoleStats();
                 return;
             }
        }
        
        // /api/permissions
        if ($resource === 'permissions') {
            if (!$this->requireRbacManager()) return;
            if ($method === 'GET') {
                $this->listPermissions();
            } else {
                $this->methodNotAllowed();
            }
            return;
        }

        // /api/roles/templates
        if ($resource === 'roles') {
             if (isset($segments[2]) && $segments[2] === 'templates') {
                 if (!$this->requireRbacManager()) return;
                 $this->listTemplates();
                 return;
             }
        }

        // /api/companies/{id}/roles
        if ($resource === 'companies' && isset($segments[3]) && $segments[3] === 'roles') {
             $companyId = $segments[2];

             // GET /api/companies/{id}/roles
             if (!isset($segments[4])) {
                 if ($method === 'GET') {
                     if (!$this->requireCompanyRolesAccess($companyId, false)) return;
                     $this->listCompanyRoles($companyId);
                     return;
                 }
                 if ($method === 'POST') {
                     if (!$this->requireCompanyRolesAccess($companyId, true)) return;
                     $this->createCompanyRole($companyId);
                     return;
                 }
             }
             
             // POST /api/companies/{id}/roles/apply-template
             if (isset($segments[4]) && $segments[4] === 'apply-template' && $method === 'POST') {
                 if (!$this->requireCompanyRolesAccess($companyId, true)) return;
                 $this->applyTemplate($companyId);
                 return;
             }

             // POST /api/companies/{id}/roles/restore-defaults
             if (isset($segments[4]) && $segments[4] === 'restore-defaults' && $method === 'POST') {
                 if (!$this->requireCompanyRolesAccess($companyId, true)) return;
                 $this->restoreDefaults($companyId);
                 return;
             }

             // /api/companies/{id}/roles/{roleId}
             if (isset($segments[4])) {
                 $roleId = $segments[4];
                 if ($method === 'PUT' || $method === 'PATCH') {
                     if (!$this->requireCompanyRolesAccess($companyId, true)) return;
                     $this->updateCompanyRole($companyId, $roleId);
                     return;
                 }
                 if ($method === 'DELETE') {
                     if (!$this->requireCompanyRolesAccess($companyId, true)) return;
                     $this->deleteCompanyRole($companyId, $roleId);
                     return;
                 }
             }
        }
        
        $this->methodNotAllowed();
    }

    // --- Endpoints ---

    public function listPermissions()
    {
        $stmt = $this->pdo->query("SELECT * FROM permissions ORDER BY code ASC");
        $permissions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Group by module
        $grouped = [];
        foreach ($permissions as $p) {
            $parts = explode('.', $p['code']);
            $module = $parts[0];
            $grouped[$module][] = $p;
        }

        Response::json($grouped);
    }

    public function listTemplates()
    {
        $output = [];
        foreach (self::TEMPLATES as $key => $tpl) {
            $output[] = [
                'key' => $key,
                'name' => $tpl['name'],
                'description' => $tpl['description'],
                'permissions' => $tpl['permissions'], // Include permissions list
                'permissions_count' => count($tpl['permissions'])
            ];
        }
        Response::json($output);
    }

    public function listCompanyRoles(string $companyId)
    {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        // Count total
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM roles WHERE company_id = :cid AND deleted_at IS NULL");
        $countStmt->execute([':cid' => $companyId]);
        $total = $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("
            SELECT r.*, 
                   (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) as user_count
            FROM roles r 
            WHERE r.company_id = :cid AND r.deleted_at IS NULL
            ORDER BY r.name ASC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $roles = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Optimization: Fetch all permissions for these roles in one query (N+1 fix)
        if (!empty($roles)) {
            $roleIds = array_column($roles, 'id');
            $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
            
            $stmtPerms = $this->pdo->prepare("
                SELECT rp.role_id, p.code 
                FROM role_permissions rp 
                JOIN permissions p ON rp.permission_id = p.id 
                WHERE rp.role_id IN ($placeholders)
            ");
            $stmtPerms->execute($roleIds);
            $allPerms = $stmtPerms->fetchAll(PDO::FETCH_ASSOC);

            // Group permissions by role_id
            $permsByRole = [];
            foreach ($allPerms as $perm) {
                $permsByRole[$perm['role_id']][] = $perm['code'];
            }

            // Assign permissions to roles
            foreach ($roles as &$role) {
                $role['permissions'] = $permsByRole[$role['id']] ?? [];
            }
        }

        Response::json([
            'data' => $roles,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    public function applyTemplate(string $companyId)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || !isset($data['template_key'])) {
            Response::error('template_key es requerido', 400);
            return;
        }

        $key = $data['template_key'];
        if (!isset(self::TEMPLATES[$key])) {
            Response::error('Template no encontrado', 404);
            return;
        }

        $this->createRoleFromTemplate($companyId, self::TEMPLATES[$key]);

        Response::json(['message' => 'Rol creado desde plantilla'], 201);
    }

    public function restoreDefaults(string $companyId)
    {
        foreach (self::TEMPLATES as $tpl) {
            // Check if role with same name exists to avoid exact duplicates
            $stmt = $this->pdo->prepare("SELECT 1 FROM roles WHERE company_id = :cid AND name = :name AND deleted_at IS NULL LIMIT 1");
            $stmt->execute([':cid' => $companyId, ':name' => $tpl['name']]);
            if ($stmt->fetch()) {
                continue; // Skip if exists
            }

            $this->createRoleFromTemplate($companyId, $tpl);
        }

        Response::json(['message' => 'Roles restaurados correctamente']);
    }

    public function createCompanyRole(string $companyId)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || empty($data['name'])) {
            Response::error('El nombre del rol es requerido', 400);
            return;
        }

        $roleId = $this->uuid();
        $name = trim($data['name']);
        $permissions = $data['permissions'] ?? [];

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO roles (id, company_id, name, is_system, created_at)
                VALUES (:id, :cid, :name, 0, NOW())
            ");
            $stmt->execute([
                ':id' => $roleId,
                ':cid' => $companyId,
                ':name' => $name
            ]);

            $this->syncRolePermissions($roleId, $permissions);

            $this->pdo->commit();
            Response::json(['message' => 'Rol creado correctamente', 'id' => $roleId], 201);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Error creando rol: ' . $e->getMessage(), 500);
        }
    }

    public function updateCompanyRole(string $companyId, string $roleId)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || empty($data['name'])) {
            Response::error('El nombre del rol es requerido', 400);
            return;
        }

        // Verify ownership
        $stmt = $this->pdo->prepare("SELECT id FROM roles WHERE id = :id AND company_id = :cid AND deleted_at IS NULL");
        $stmt->execute([':id' => $roleId, ':cid' => $companyId]);
        if (!$stmt->fetch()) {
            Response::error('Rol no encontrado', 404);
            return;
        }

        $name = trim($data['name']);
        $permissions = $data['permissions'] ?? [];

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("UPDATE roles SET name = :name, updated_at = NOW() WHERE id = :id");
            $stmt->execute([':name' => $name, ':id' => $roleId]);

            $this->syncRolePermissions($roleId, $permissions);

            $this->pdo->commit();
            Response::json(['message' => 'Rol actualizado correctamente']);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Error actualizando rol: ' . $e->getMessage(), 500);
        }
    }

    public function deleteCompanyRole(string $companyId, string $roleId)
    {
        // Verify ownership
        $stmt = $this->pdo->prepare("SELECT id FROM roles WHERE id = :id AND company_id = :cid AND deleted_at IS NULL");
        $stmt->execute([':id' => $roleId, ':cid' => $companyId]);
        if (!$stmt->fetch()) {
            Response::error('Rol no encontrado', 404);
            return;
        }

        // Check for users assigned
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM user_roles WHERE role_id = :id");
        $stmt->execute([':id' => $roleId]);
        if ($stmt->fetchColumn() > 0) {
            Response::error('No se puede eliminar un rol que tiene usuarios asignados', 400);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE roles SET deleted_at = NOW() WHERE id = :id");
        $stmt->execute([':id' => $roleId]);

        Response::json(['message' => 'Rol eliminado correctamente']);
    }

    private function syncRolePermissions(string $roleId, array $permissionCodes)
    {
        // Clear existing
        $stmt = $this->pdo->prepare("DELETE FROM role_permissions WHERE role_id = :rid");
        $stmt->execute([':rid' => $roleId]);

        if (empty($permissionCodes)) return;

        // Find IDs for codes
        $placeholders = implode(',', array_fill(0, count($permissionCodes), '?'));
        $stmt = $this->pdo->prepare("SELECT id FROM permissions WHERE code IN ($placeholders)");
        $stmt->execute($permissionCodes);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($ids)) return;

        $sql = "INSERT INTO role_permissions (role_id, permission_id) VALUES ";
        $values = [];
        $params = [];
        foreach ($ids as $pId) {
            $values[] = "(?, ?)";
            $params[] = $roleId;
            $params[] = $pId;
        }
        $sql .= implode(', ', $values);
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
    }

    private function createRoleFromTemplate(string $companyId, array $tpl): void
    {
        // Create Role
        $roleId = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO roles (id, company_id, name, is_system, created_at)
            VALUES (:id, :cid, :name, 0, NOW())
        ");
        $stmt->execute([
            ':id' => $roleId,
            ':cid' => $companyId,
            ':name' => $tpl['name']
        ]);

        // Resolve permissions
        $permsToAssign = [];
        if ($tpl['permissions'] === ['*']) {
            // All permissions
            $stmt = $this->pdo->query("SELECT id FROM permissions");
            $permsToAssign = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } else {
            // Find IDs for codes
            // We need to handle wildcards if present in templates, but current templates list specific codes or *
            // Let's assume specific codes for now as per constant.
            if (empty($tpl['permissions'])) return;

            $placeholders = implode(',', array_fill(0, count($tpl['permissions']), '?'));
            $stmt = $this->pdo->prepare("SELECT id FROM permissions WHERE code IN ($placeholders)");
            $stmt->execute($tpl['permissions']);
            $permsToAssign = $stmt->fetchAll(PDO::FETCH_COLUMN);
        }

        // Insert role_permissions
        if (!empty($permsToAssign)) {
            $sql = "INSERT INTO role_permissions (role_id, permission_id) VALUES ";
            $values = [];
            $params = [];
            foreach ($permsToAssign as $pId) {
                $values[] = "(?, ?)";
                $params[] = $roleId;
                $params[] = $pId;
            }
            $sql .= implode(', ', $values);
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
        }
    }

    private function getSystemRoleStats()
    {
        $stmt = $this->pdo->query("SELECT platform_role, COUNT(*) as count FROM users GROUP BY platform_role");
        $stats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        Response::json($stats);
    }

    private function getSystemPermissions()
    {
        $stmt = $this->pdo->query("SELECT role_key, module FROM system_role_permissions");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $result = [];
        foreach ($rows as $row) {
            $result[$row['role_key']][] = $row['module'];
        }
        
        Response::json($result);
    }

    private function saveSystemPermissions()
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $role = $data['role'] ?? '';
        $modules = $data['modules'] ?? [];
        
        if (empty($role) || !is_array($modules)) {
            Response::error('Datos inválidos', 400);
            return;
        }

        // Anti-escalation: solo super_admin puede modificar el rol super_admin
        if ($role === 'super_admin' && (Auth::user()['platform_role'] ?? '') !== 'super_admin') {
            Response::error('Acceso denegado', 403);
            return;
        }
        
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare("DELETE FROM system_role_permissions WHERE role_key = :role");
            $stmt->execute([':role' => $role]);
            
            if (!empty($modules)) {
                $sql = "INSERT INTO system_role_permissions (role_key, module) VALUES ";
                $params = [];
                $parts = [];
                foreach ($modules as $mod) {
                    $parts[] = "(?, ?)";
                    $params[] = $role;
                    $params[] = $mod;
                }
                $sql .= implode(', ', $parts);
                $stmt = $this->pdo->prepare($sql);
                $stmt->execute($params);
            }
            
            $this->pdo->commit();
            $this->getSystemPermissions();
            
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Error guardando permisos: ' . $e->getMessage(), 500);
        }
    }

    private function requireRbacManager(): bool
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'admin', 'security'], true)) {
            Response::error('Acceso denegado', 403);
            return false;
        }
        return true;
    }

    private function requireCompanyRolesAccess(string $companyId, bool $mutate): bool
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';

        // Gestores de RBAC pueden leer y modificar roles de cualquier empresa
        if (in_array($role, ['super_admin', 'admin', 'security'], true)) return true;

        // El company_admin de esa empresa gestiona sus propios roles
        if ($role === 'company_admin' && ($user['company_id'] ?? '') === $companyId) return true;

        // Lectura para roles con acceso al módulo Tenants
        if (!$mutate && in_array($role, ['support', 'finance', 'legal'], true)) return true;

        Response::error('Acceso denegado', 403);
        return false;
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
    
    private function methodNotAllowed()
    {
        Response::error('Método no permitido', 405);
    }
}
