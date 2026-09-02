<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\AuditLogger;
use App\Support\Auth;
use PDO;
use Exception;
use Throwable;

class UserController
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->audit = new AuditLogger();
    }

    public function handle(array $segments, string $method): void
    {
        // /api/users/{id}/{sub}/{subId}
        $id = $segments[2] ?? null;
        $sub = $segments[3] ?? null;
        $subId = $segments[4] ?? null;

        $user = Auth::user();
        if (($user['platform_role'] ?? '') === 'support') {
            $allowed =
                ($id === 'support-view' && strtoupper($method) === 'GET') ||
                ($id && $sub === 'send-password-reset' && strtoupper($method) === 'POST');
            if (!$allowed) {
                Response::error('Acceso denegado', 403);
                return;
            }
        }

        try {
            // Handle support-view explicitly before ID checks to avoid collision with user ID 'support-view'
            if ($id === 'support-view') {
                if (strtoupper($method) === 'GET') {
                    $this->supportViewIndex();
                    return;
                }
                // Allow falling through if not GET? No, support-view is a resource, not a user ID.
                Response::error("Método no permitido (support-view). Recibido: $method", 405);
                return;
            }

            if ($id === 'company-admins') {
                if (strtoupper($method) !== 'GET') {
                    Response::error("Método no permitido (company-admins). Recibido: $method", 405);
                    return;
                }

                if ($sub === 'export') {
                    $this->exportCompanyAdmins();
                    return;
                }

                if ($sub === null || $sub === '') {
                    $this->listCompanyAdmins();
                    return;
                }

                Response::error('Ruta no encontrada', 404);
                return;
            }

            if ($id === null || $id === '') {
                if (strtoupper($method) === 'GET') {
                    $this->index();
                    return;
                }
                if (strtoupper($method) === 'POST') {
                    $this->store();
                    return;
                }
                Response::error("Método no permitido (Root). Recibido: $method", 405);
                return;
            }

            if ($id === 'export') {
                if (strtoupper($method) === 'GET') {
                    $this->export();
                    return;
                }
            }

            if ($id === 'team') {
                if (strtoupper($method) === 'GET') {
                    $this->listTeam();
                    return;
                }
            }

            // /api/users/{id}
            if ($sub === null || $sub === '') {
                if (strtoupper($method) === 'GET') {
                    $this->show($id);
                    return;
                }
                if (strtoupper($method) === 'PUT' || strtoupper($method) === 'PATCH') {
                    $this->update($id);
                    return;
                }
                if (strtoupper($method) === 'DELETE') {
                    $this->destroy($id);
                    return;
                }
                Response::error("Método no permitido (ID). Recibido: $method", 405);
                return;
            }

            // Actions
            if ($sub === 'block' && strtoupper($method) === 'POST') {
                $this->block($id);
                return;
            }
            if ($sub === 'unblock' && strtoupper($method) === 'POST') {
                $this->unblock($id);
                return;
            }
            if ($sub === 'invalidate-sessions' && strtoupper($method) === 'POST') {
                $this->invalidateSessions($id);
                return;
            }
            if ($sub === 'send-password-reset' && strtoupper($method) === 'POST') {
                $this->sendPasswordReset($id);
                return;
            }
            if ($sub === 'set-password' && strtoupper($method) === 'POST') {
                $this->setPassword($id);
                return;
            }

            // Memberships: /api/users/{id}/memberships
            if ($sub === 'memberships') {
                if ($subId === null) {
                    if (strtoupper($method) === 'POST') {
                        $this->addMembership($id);
                        return;
                    }
                    Response::error("Método no permitido (Memberships POST). Recibido: $method", 405);
                    return;
                }
                // /api/users/{id}/memberships/{membershipId}
                if (strtoupper($method) === 'PUT' || strtoupper($method) === 'PATCH') {
                    $this->updateMembership($id, $subId);
                    return;
                }
                if (strtoupper($method) === 'DELETE') {
                    $this->removeMembership($id, $subId);
                    return;
                }
                Response::error("Método no permitido (Memberships Sub). Recibido: $method", 405);
                return;
            }

            Response::error('Ruta no encontrada', 404);

        } catch (Throwable $e) {
            error_log("UserController Error: " . $e->getMessage());
            Response::error('Error interno del servidor', 500, ['message' => $e->getMessage()]);
        }
    }

    private function supportViewIndex(): void
    {
        $user = Auth::user();
        // Ensure only support or super_admin can access
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'support'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        $page = (int)($_GET['page'] ?? 1);
        $limit = (int)($_GET['limit'] ?? 20);
        $offset = ($page - 1) * $limit;
        $search = $_GET['search'] ?? '';

        // Base Query
        $sql = "
            SELECT 
                u.id, u.full_name, u.email, u.status, u.platform_role, u.last_login_at,
                (CASE WHEN EXISTS (SELECT 1 FROM user_identities ui WHERE ui.user_id = u.id) THEN 'sso' ELSE 'email' END) as auth_method
            FROM users u
            WHERE u.deleted_at IS NULL
        ";

        $params = [];
        if ($search) {
            $sql .= " AND (u.full_name LIKE :s OR u.email LIKE :s)";
            $params[':s'] = "%$search%";
        }

        $sql .= " ORDER BY u.created_at DESC LIMIT $limit OFFSET $offset";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Count total
        $countSql = "SELECT COUNT(*) FROM users u WHERE u.deleted_at IS NULL";
        if ($search) {
            $countSql .= " AND (u.full_name LIKE :s OR u.email LIKE :s)";
        }
        $stmtCount = $this->pdo->prepare($countSql);
        if ($search) $stmtCount->execute([':s' => "%$search%"]);
        else $stmtCount->execute();
        $total = (int)$stmtCount->fetchColumn();

        Response::json([
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'per_page' => $limit,
                'total' => $total,
                'last_page' => ceil($total / $limit)
            ]
        ]);
    }

    private function export(): void
    {
        $search = trim((string)($_GET['q'] ?? $_GET['search'] ?? '')); 
        $status = trim((string)($_GET['status'] ?? ''));
        $type = trim((string)($_GET['auth_method'] ?? $_GET['type'] ?? ''));
        $companyId = trim((string)($_GET['company_id'] ?? ''));
        $roleScope = trim((string)($_GET['role_scope'] ?? ''));
        $platformRole = trim((string)($_GET['platform_role'] ?? ''));

        $params = [];
        $where = ["1=1", "u.deleted_at IS NULL"];

        if ($search !== '') {
            $where[] = "(u.full_name LIKE :search OR u.email LIKE :search)";
            $params[':search'] = "%$search%";
        }

        if ($status !== '') {
            $where[] = "u.status LIKE :status";
            $params[':status'] = $status;
        }

        if ($platformRole !== '') {
            $where[] = "u.platform_role LIKE :platform_role";
            $params[':platform_role'] = $platformRole;
        } elseif ($roleScope === 'internal') {
            $where[] = "u.platform_role IN ('super_admin', 'admin', 'support', 'finance', 'legal', 'security', 'company_admin')";
            $where[] = "NOT EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id LIKE u.id)";
        } elseif ($roleScope === 'company') {
            $where[] = "u.platform_role IN ('user', 'company_admin')";
        } elseif ($roleScope === 'freelancer') {
            $where[] = "u.platform_role LIKE 'freelancer'";
        }

        if ($companyId !== '') {
            $where[] = "EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id LIKE u.id AND cu.company_id LIKE :company_id AND cu.status LIKE 'active')";
            $params[':company_id'] = $companyId;
        }

        if ($type === 'password') {
            $where[] = "u.password_hash IS NOT NULL AND u.password_hash != ''";
        } elseif ($type === 'sso') {
            $where[] = "EXISTS (SELECT 1 FROM user_identities ui WHERE ui.user_id LIKE u.id)";
        }

        $whereSql = implode(' AND ', $where);

        $sql = "
            SELECT 
                u.full_name, 
                u.email, 
                u.status, 
                u.platform_role,
                u.last_login_at, 
                u.created_at,
                (SELECT COUNT(*) FROM company_users cu2 WHERE cu2.user_id = u.id AND cu2.status = 'active') as company_count
            FROM users u
            WHERE $whereSql
            ORDER BY u.created_at DESC
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->execute();

        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="users_export_' . date('Y-m-d_H-i') . '.csv"');

        $output = fopen('php://output', 'w');
        fputcsv($output, ['Nombre', 'Email', 'Estado', 'Rol', 'Ultimo Acceso', 'Fecha Registro', 'Empresas']);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, [
                $row['full_name'],
                $row['email'],
                $row['status'],
                $row['platform_role'],
                $row['last_login_at'],
                $row['created_at'],
                $row['company_count']
            ]);
        }
        fclose($output);
        exit;
    }

    private function listCompanyAdmins(): void
    {
        $actor = Auth::user();
        $role = $actor['platform_role'] ?? '';
        $allowed = ['super_admin', 'admin', 'support', 'finance', 'legal', 'security', 'it_admin'];
        if (!in_array($role, $allowed, true)) {
            Response::error('Unauthorized', 403);
            return;
        }

        $companyId = trim((string)($_GET['company_id'] ?? ''));
        $search = trim((string)($_GET['q'] ?? $_GET['search'] ?? ''));

        $where = [
            "u.deleted_at IS NULL",
            "cu.deleted_at IS NULL",
            "c.deleted_at IS NULL",
            "u.platform_role = 'company_admin'",
            "cu.status = 'active'"
        ];
        $params = [];

        if ($companyId !== '') {
            $where[] = "c.id LIKE :company_id";
            $params[':company_id'] = $companyId;
        }

        if ($search !== '') {
            $where[] = "(u.full_name LIKE :search OR u.email LIKE :search OR c.trade_name LIKE :search OR c.legal_name LIKE :search)";
            $params[':search'] = "%$search%";
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $this->pdo->prepare("
            SELECT
                u.id AS user_id,
                u.full_name,
                u.email,
                u.status AS user_status,
                u.platform_role,
                c.id AS company_id,
                c.trade_name,
                c.legal_name,
                c.status AS company_status,
                cu.status AS membership_status,
                cu.department,
                cu.job_title,
                cu.active_company,
                cu.created_at AS membership_created_at
            FROM users u
            JOIN company_users cu ON cu.user_id = u.id
            JOIN companies c ON c.id = cu.company_id
            WHERE $whereSql
            ORDER BY c.trade_name ASC, u.full_name ASC
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $rows,
            'meta' => [
                'total' => count($rows)
            ]
        ]);
    }

    private function exportCompanyAdmins(): void
    {
        $actor = Auth::user();
        $role = $actor['platform_role'] ?? '';
        $allowed = ['super_admin', 'admin', 'support', 'finance', 'legal', 'security', 'it_admin'];
        if (!in_array($role, $allowed, true)) {
            Response::error('Unauthorized', 403);
            return;
        }

        $companyId = trim((string)($_GET['company_id'] ?? ''));
        $search = trim((string)($_GET['q'] ?? $_GET['search'] ?? ''));

        $where = [
            "u.deleted_at IS NULL",
            "cu.deleted_at IS NULL",
            "c.deleted_at IS NULL",
            "u.platform_role = 'company_admin'",
            "cu.status = 'active'"
        ];
        $params = [];

        if ($companyId !== '') {
            $where[] = "c.id LIKE :company_id";
            $params[':company_id'] = $companyId;
        }

        if ($search !== '') {
            $where[] = "(u.full_name LIKE :search OR u.email LIKE :search OR c.trade_name LIKE :search OR c.legal_name LIKE :search)";
            $params[':search'] = "%$search%";
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $this->pdo->prepare("
            SELECT
                u.id AS user_id,
                u.full_name,
                u.email,
                u.status AS user_status,
                c.id AS company_id,
                c.trade_name,
                c.legal_name,
                c.status AS company_status,
                cu.department,
                cu.job_title,
                cu.active_company,
                cu.created_at AS membership_created_at
            FROM users u
            JOIN company_users cu ON cu.user_id = u.id
            JOIN companies c ON c.id = cu.company_id
            WHERE $whereSql
            ORDER BY c.trade_name ASC, u.full_name ASC
        ");
        $stmt->execute($params);

        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="company_admins_' . date('Y-m-d_H-i') . '.csv"');

        $output = fopen('php://output', 'w');
        fputcsv($output, [
            'User ID',
            'Nombre',
            'Email',
            'Estado Usuario',
            'Company ID',
            'Trade Name',
            'Legal Name',
            'Estado Empresa',
            'Departamento',
            'Job Title',
            'Empresa Activa',
            'Asignado Desde'
        ]);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, [
                $row['user_id'] ?? '',
                $row['full_name'] ?? '',
                $row['email'] ?? '',
                $row['user_status'] ?? '',
                $row['company_id'] ?? '',
                $row['trade_name'] ?? '',
                $row['legal_name'] ?? '',
                $row['company_status'] ?? '',
                $row['department'] ?? '',
                $row['job_title'] ?? '',
                (string)($row['active_company'] ?? ''),
                $row['membership_created_at'] ?? ''
            ]);
        }

        fclose($output);
        exit;
    }

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 10)));
        $offset = ($page - 1) * $perPage;

        $search = trim((string)($_GET['search'] ?? '')); // name or email
        $status = trim((string)($_GET['status'] ?? ''));
        $type = trim((string)($_GET['type'] ?? '')); // password, sso
        $companyId = trim((string)($_GET['company_id'] ?? ''));
        $roleScope = trim((string)($_GET['role_scope'] ?? '')); // internal, external
        $platformRole = trim((string)($_GET['platform_role'] ?? ''));

        $params = [];
        $where = ["1=1", "u.deleted_at IS NULL"];

        if ($search !== '') {
            $where[] = "(u.full_name LIKE :search OR u.email LIKE :search)";
            $params[':search'] = "%$search%";
        }

        if ($status !== '') {
            $where[] = "u.status LIKE :status";
            $params[':status'] = $status;
        }

        if ($platformRole !== '') {
            $where[] = "u.platform_role LIKE :platform_role";
            $params[':platform_role'] = $platformRole;
        } elseif ($roleScope === 'internal') {
            // Internal roles: Whitelist and exclude company members. Freelancers no pertenecen a Usuarios de Plataforma.
            $where[] = "u.platform_role IN ('super_admin', 'admin', 'support', 'finance', 'legal', 'security', 'company_admin')";
            $where[] = "NOT EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id LIKE u.id)";
        } elseif ($roleScope === 'company') {
            $where[] = "u.platform_role IN ('user', 'company_admin')";
        } elseif ($roleScope === 'freelancer') {
            $where[] = "u.platform_role LIKE 'freelancer'";
        }

        if ($companyId !== '') {
            // Filter by users who belong to this company
            $where[] = "EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id LIKE u.id AND cu.company_id LIKE :company_id AND cu.status LIKE 'active')";
            $params[':company_id'] = $companyId;
        }

        if ($type === 'password') {
            $where[] = "u.password_hash IS NOT NULL AND u.password_hash != ''";
        } elseif ($type === 'sso') {
            $where[] = "EXISTS (SELECT 1 FROM user_identities ui WHERE ui.user_id LIKE u.id)";
        }

        $whereSql = implode(' AND ', $where);

        // Count total
        $countSql = "SELECT COUNT(*) FROM users u WHERE $whereSql";
        $stmt = $this->pdo->prepare($countSql);
        $stmt->execute($params);
        $total = (int)$stmt->fetchColumn();

        // Fetch data
        // Note: Using subquery for company_count to avoid GROUP BY issues with multiple rows if we joined company_users
        // Fetching providers as a concatenated string or JSON could be useful, but let's just flag sso
        $sql = "
            SELECT 
                u.id, 
                u.full_name, 
                u.email, 
                u.status, 
                u.platform_role,
                u.last_login_at, 
                u.created_at,
                (SELECT COUNT(*) FROM company_users cu2 WHERE cu2.user_id = u.id AND cu2.status = 'active') as company_count,
                (CASE WHEN u.password_hash IS NOT NULL AND u.password_hash != '' THEN 1 ELSE 0 END) as has_password,
                (SELECT GROUP_CONCAT(DISTINCT ui.provider SEPARATOR ',') FROM user_identities ui WHERE ui.user_id = u.id) as sso_providers
            FROM users u
            WHERE $whereSql
            ORDER BY u.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Process users to format auth_method
        foreach ($users as &$user) {
            $methods = [];
            if ($user['has_password']) $methods[] = 'Password';
            if (!empty($user['sso_providers'])) {
                $providers = explode(',', $user['sso_providers']);
                foreach ($providers as $p) $methods[] = ucfirst($p);
            }
            $user['auth_methods'] = $methods;
            unset($user['has_password'], $user['sso_providers']);
        }

        Response::json([
            'data' => $users,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage))
            ]
        ]);
    }

    private function show(string $id): void
    {
        // 1. User Info
        $stmt = $this->pdo->prepare("
            SELECT id, full_name, email, status, last_login_at, created_at, password_hash, platform_role, global_permissions
            FROM users 
            WHERE id LIKE :id AND deleted_at IS NULL
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            Response::error('Usuario no encontrado', 404);
            return;
        }

        $user['has_password'] = !empty($user['password_hash']);
        unset($user['password_hash']);

        // Decode global_permissions
        if (!empty($user['global_permissions'])) {
            $user['global_permissions'] = json_decode($user['global_permissions'], true) ?: [];
        } else {
            $user['global_permissions'] = [];
        }

        // 2. Identities (SSO)
        $stmt = $this->pdo->prepare("SELECT provider, created_at FROM user_identities WHERE user_id LIKE :id");
        $stmt->execute([':id' => $id]);
        $identities = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 3. Memberships (Companies & Roles)
        // Need to join companies to get name, and company_users for details
        $stmt = $this->pdo->prepare("
            SELECT 
                cu.id as membership_id,
                cu.company_id,
                c.legal_name as company_name,
                c.trade_name,
                cu.status,
                cu.department,
                cu.job_title,
                cu.active_company
            FROM company_users cu
            JOIN companies c ON cu.company_id LIKE c.id
            WHERE cu.user_id LIKE :id
        ");
        $stmt->execute([':id' => $id]);
        $memberships = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Optimization: Fetch all roles in one query (N+1 fix)
        if (!empty($memberships)) {
            $membershipIds = array_column($memberships, 'membership_id');
            // Create placeholders for IN clause
            $placeholders = implode(',', array_fill(0, count($membershipIds), '?'));
            
            $stmtRoles = $this->pdo->prepare("
                SELECT ur.company_user_id, r.id, r.name 
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.company_user_id IN ($placeholders)
            ");
            $stmtRoles->execute($membershipIds);
            $allRoles = $stmtRoles->fetchAll(PDO::FETCH_ASSOC);

            // Group roles by membership_id
            $rolesByMembership = [];
            foreach ($allRoles as $role) {
                $rolesByMembership[$role['company_user_id']][] = [
                    'id' => $role['id'],
                    'name' => $role['name']
                ];
            }

            // Assign roles to memberships
            foreach ($memberships as &$m) {
                $m['roles'] = $rolesByMembership[$m['membership_id']] ?? [];
            }
        } else {
             // Initialize empty roles if no memberships (though logic above handles it implicitly, good for clarity)
             // No action needed as loop below won't run or we need to ensure structure
        }

        $stmt = $this->pdo->prepare("
                SELECT id, ip_address, user_agent, created_at, last_activity, is_active
                FROM user_sessions 
                WHERE user_id LIKE :id AND is_active = 1
                ORDER BY last_activity DESC
                LIMIT 10
            ");
            $stmt->execute([':id' => $id]);
            $sessions = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // 5. Recent Failed Login Attempts
            $recentFailed = [];
            try {
                $logs = $this->audit->getLogs(['actor_user_id' => $id], 50, 0);
                foreach ($logs['data'] as $log) {
                    if (strpos($log['action'], 'login_failed') !== false) {
                        $recentFailed[] = $log;
                        if (count($recentFailed) >= 5) break;
                    }
                }
            } catch (Throwable $e) {}

        Response::json([
            'user' => $user,
            'identities' => $identities,
            'memberships' => $memberships,
            'active_sessions' => $sessions,
            'recent_failed_logins' => $recentFailed
        ]);
    }

    private function store(): void
    {
        $data = $this->readPayload();
        
        $fullName = trim((string)($data['full_name'] ?? ''));
        $email = strtolower(trim((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');
        $role = trim((string)($data['platform_role'] ?? 'user'));
        
        if ($fullName === '' || $email === '' || $password === '') {
            Response::error('full_name, email y password son requeridos', 400);
            return;
        }

        // Check email
        $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email LIKE :email");
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            Response::error('El correo ya está registrado', 409);
            return;
        }

        $id = $this->uuid();
        $hash = password_hash($password, PASSWORD_BCRYPT);

        try {
            $this->pdo->beginTransaction();

            $isFreelancer = ($role === 'freelancer' || $role === 'freelance');
            if ($isFreelancer) {
                $code = $this->generateUniqueFreelancerCode();
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, password_hash, status, platform_role, freelancer_code, created_at)
                    VALUES (:id, :name, :email, :hash, 'active', :role, :code, NOW())
                ");
            } else {
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, password_hash, status, platform_role, created_at)
                    VALUES (:id, :name, :email, :hash, 'active', :role, NOW())
                ");
            }

            $params = [
                ':id' => $id,
                ':name' => $fullName,
                ':email' => $email,
                ':hash' => $hash,
                ':role' => $role
            ];
            if (isset($code)) {
                $params[':code'] = $code;
            }
            $stmt->execute($params);

            $this->audit->log('user.created', 'user', $id, ['email' => $email, 'role' => $role]);

            $this->pdo->commit();

            Response::json([
                'message' => 'Usuario creado exitosamente',
                'data' => [
                    'id' => $id,
                    'full_name' => $fullName,
                    'email' => $email,
                    'platform_role' => $role
                ]
            ], 201);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e; // Let the main try/catch handle the error response
        }
    }

    private function generateUniqueFreelancerCode(): string
    {
        while (true) {
            $code = \App\Support\Str::randomDigits(6);
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE freelancer_code = :code LIMIT 1");
            $stmt->execute([':code' => $code]);
            if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
                return $code;
            }
        }
    }

    private function update(string $id): void
    {
        $data = $this->readPayload();
        
        $fields = [];
        $params = [':id' => $id];

        if (array_key_exists('full_name', $data)) {
            $fields[] = "full_name = :full_name";
            $params[':full_name'] = trim($data['full_name']);
        }

        if (array_key_exists('email', $data)) {
            $email = strtolower(trim($data['email']));
            // Check unique
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email LIKE :email AND id != :id");
            $stmt->execute([':email' => $email, ':id' => $id]);
            if ($stmt->fetch()) {
                Response::error('El correo ya está registrado', 409);
                return;
            }
            $fields[] = "email = :email";
            $params[':email'] = $email;
        }

        if (array_key_exists('platform_role', $data)) {
             $fields[] = "platform_role = :role";
             $params[':role'] = $data['platform_role'];
        }
        
        if (array_key_exists('global_permissions', $data)) {
             $perms = $data['global_permissions'];
             if (!is_array($perms)) $perms = [];
             $fields[] = "global_permissions = :perms";
             $params[':perms'] = json_encode($perms);
        }

        if (empty($fields)) {
            Response::json(['message' => 'Nada que actualizar']);
            return;
        }

        $sql = "UPDATE users SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id LIKE :id";
        
        try {
            $this->pdo->prepare($sql)->execute($params);
            
            // Log audit
            $this->audit->log('user.updated', 'user', $id, array_keys($data));
            
            Response::json(['message' => 'Usuario actualizado correctamente']);
        } catch (Throwable $e) {
            Response::error('Error al actualizar usuario', 500, ['error' => $e->getMessage()]);
        }
    }

    private function block(string $id): void
    {
        $this->updateUserStatus($id, 'locked');
        $this->audit->log('user.blocked', 'user', $id);
        $this->invalidateSessions($id);
        Response::json(['message' => 'Usuario bloqueado']);
    }

    private function unblock(string $id): void
    {
        $this->updateUserStatus($id, 'active');
        $this->audit->log('user.unblocked', 'user', $id);
        Response::json(['message' => 'Usuario desbloqueado correctamente']);
    }

    private function updateUserStatus(string $id, string $status): void
    {
        $stmt = $this->pdo->prepare("UPDATE users SET status = :status WHERE id LIKE :id");
        $stmt->execute([':status' => $status, ':id' => $id]);
    }

    private function invalidateSessions(string $id): void
    {
        $stmt = $this->pdo->prepare("UPDATE user_sessions SET is_active = 0 WHERE user_id LIKE :id AND is_active = 1");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Sesiones invalidadas correctamente']);
    }

    private function addMembership(string $userId): void
    {
        $data = $this->readPayload();
        
        $companyId = $data['company_id'] ?? null;
        $roleId = $data['role_id'] ?? null; // Optional initial role
        $department = $data['department'] ?? null;
        $jobTitle = $data['job_title'] ?? null;

        if (!$companyId) {
            Response::error('company_id es requerido', 400);
            return;
        }

        // Check if already exists
        $stmt = $this->pdo->prepare("SELECT id FROM company_users WHERE user_id LIKE :uid AND company_id LIKE :cid");
        $stmt->execute([':uid' => $userId, ':cid' => $companyId]);
        if ($stmt->fetch()) {
            Response::error('El usuario ya pertenece a esta empresa', 409);
            return;
        }

        $id = $this->uuid();
        
        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO company_users (id, company_id, user_id, status, department, job_title, created_at)
                VALUES (:id, :cid, :uid, 'active', :dept, :job, NOW())
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':uid' => $userId,
                ':dept' => $department,
                ':job' => $jobTitle
            ]);

            // Assign role if provided
            if ($roleId) {
                // Verify role belongs to company
                $stmtRole = $this->pdo->prepare("SELECT id FROM roles WHERE id LIKE :rid AND company_id LIKE :cid");
                $stmtRole->execute([':rid' => $roleId, ':cid' => $companyId]);
                if ($stmtRole->fetch()) {
                    $stmt = $this->pdo->prepare("INSERT INTO user_roles (company_user_id, role_id) VALUES (:cuid, :rid)");
                    $stmt->execute([':cuid' => $id, ':rid' => $roleId]);
                }
            }

            $this->pdo->commit();
            Response::json(['message' => 'Membresía agregada', 'id' => $id], 201);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    private function updateMembership(string $userId, string $membershipId): void
    {
        // Verify ownership (optional but good)
        $stmt = $this->pdo->prepare("SELECT id FROM company_users WHERE id LIKE :mid AND user_id LIKE :uid");
        $stmt->execute([':mid' => $membershipId, ':uid' => $userId]);
        if (!$stmt->fetch()) {
            Response::error('Membresía no encontrada o no coincide con el usuario', 404);
            return;
        }

        $data = $this->readPayload();
        
        // Update details
        $fields = [];
        $params = [':mid' => $membershipId];
        
        if (array_key_exists('department', $data)) {
            $fields[] = "department = :dept";
            $params[':dept'] = $data['department'];
        }
        if (array_key_exists('job_title', $data)) {
            $fields[] = "job_title = :job";
            $params[':job'] = $data['job_title'];
        }
        if (array_key_exists('status', $data)) {
             // Validate status enum? active, invited, disabled
             $fields[] = "status = :status";
             $params[':status'] = $data['status'];
        }

        if (!empty($fields)) {
            $sql = "UPDATE company_users SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = :mid";
            $this->pdo->prepare($sql)->execute($params);
        }

        // Update Roles
        // If 'role_id' is provided, we might replace or add?
        // Requirement: "cambiar rol". Implies replacing or setting the main role.
        // Since `user_roles` is M:N technically but usually users have one primary role per company in simple systems,
        // let's assume we replace the roles or add/remove. 
        // Let's support `role_id` to replace all roles, or `add_role_id` / `remove_role_id`.
        // Simplest: `role_id` replaces existing roles.
        if (array_key_exists('role_id', $data)) {
            $newRoleId = $data['role_id'];
            
            // Remove existing roles
            $this->pdo->prepare("DELETE FROM user_roles WHERE company_user_id = :mid")->execute([':mid' => $membershipId]);
            
            if ($newRoleId) {
                 $this->pdo->prepare("INSERT INTO user_roles (company_user_id, role_id) VALUES (:mid, :rid)")
                      ->execute([':mid' => $membershipId, ':rid' => $newRoleId]);
            }
        }

        Response::json(['message' => 'Membresía actualizada']);
    }

    private function removeMembership(string $userId, string $membershipId): void
    {
        // Check existence
        $stmt = $this->pdo->prepare("SELECT id FROM company_users WHERE id LIKE :mid AND user_id LIKE :uid");
        $stmt->execute([':mid' => $membershipId, ':uid' => $userId]);
        if (!$stmt->fetch()) {
            Response::error('Membresía no encontrada', 404);
            return;
        }

        // Hard delete or Soft delete? Schema has deleted_at?
        // Checking schema: company_users has deleted_at.
        $stmt = $this->pdo->prepare("UPDATE company_users SET deleted_at = NOW(), status = 'disabled' WHERE id LIKE :mid");
        $stmt->execute([':mid' => $membershipId]);

        Response::json(['message' => 'Membresía eliminada']);
    }

    private function destroy(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT id, email FROM users WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            Response::error('Usuario no encontrado', 404);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            // 1. Unlink Identities (SSO) - Hard Delete to allow re-linking if new user created
            $this->pdo->prepare("DELETE FROM user_identities WHERE user_id LIKE :id")->execute([':id' => $id]);

            // 2. Invalidate Sessions
            $this->pdo->prepare("DELETE FROM user_sessions WHERE user_id LIKE :id")->execute([':id' => $id]);

            // 3. Disable Company Memberships (Soft Delete)
            $this->pdo->prepare("
                UPDATE company_users 
                SET status = 'disabled', deleted_at = NOW() 
                WHERE user_id LIKE :id
            ")->execute([':id' => $id]);

            // 4. Remove Password Resets
            $this->pdo->prepare("DELETE FROM password_resets WHERE email LIKE :email")->execute([':email' => $user['email']]);

            // 5. Soft Delete User
            // We append timestamp to email to release the unique constraint
            $deletedEmail = sprintf("deleted_%s_%s", time(), $user['email']);
            // Ensure length doesn't exceed common limits (190/255)
            if (strlen($deletedEmail) > 190) {
                $deletedEmail = substr($deletedEmail, 0, 190);
            }

            $stmt = $this->pdo->prepare("
                UPDATE users 
                SET 
                    status = 'disabled', 
                    deleted_at = NOW(), 
                    email = :deleted_email,
                    password_hash = NULL
                WHERE id LIKE :id
            ");
            $stmt->execute([
                ':deleted_email' => $deletedEmail,
                ':id' => $id
            ]);

            $this->pdo->commit();

            $this->audit->log('user.deleted', 'user', $id, ['email' => $user['email']]);
            Response::json(['message' => 'Usuario eliminado correctamente']);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            error_log("Error deleting user $id: " . $e->getMessage());
            // Return actual error for debugging
            Response::error('Error al eliminar usuario: ' . $e->getMessage(), 500);
        }
    }

    private function sendPasswordReset(string $id): void
    {
        $this->ensurePasswordResetsTable();

        $stmt = $this->pdo->prepare("SELECT email, full_name FROM users WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            Response::error('Usuario no encontrado', 404);
            return;
        }

        $email = $user['email'];
        $token = bin2hex(random_bytes(32));
        
        $del = $this->pdo->prepare("DELETE FROM password_resets WHERE email LIKE :email");
        $del->execute([':email' => $email]);

        $ins = $this->pdo->prepare("INSERT INTO password_resets (email, token, created_at) VALUES (:email, :token, NOW())");
        $ins->execute([':email' => $email, ':token' => $token]);

        $resetLink = $this->getFrontendUrl() . "/auth/reset-password?token=$token&email=" . urlencode($email);

        $body = "Hola {$user['full_name']},<br><br>";
        $body .= "Se ha solicitado un restablecimiento de contraseña para tu cuenta.<br>";
        $body .= "Haz clic en el siguiente enlace para continuar:<br><br>";
        $body .= "<a href='$resetLink' style='padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;'>Restablecer Contraseña</a><br><br>";
        $body .= "Si no solicitaste esto, ignora este correo.<br><br>";
        $body .= "El enlace expirará en 60 minutos.";

        try {
            \App\Support\SMTP::send($email, "Restablecimiento de Contraseña", $body);
            $this->audit->log('user.password_reset_sent', 'user', $id, ['email' => $email]);
            Response::json(['message' => 'Correo de restablecimiento enviado']);
        } catch (Throwable $e) {
            error_log("SMTP Error: " . $e->getMessage());
            Response::error('Error al enviar el correo: ' . $e->getMessage(), 500);
        }
    }

    private function listTeam(): void
    {
        $managerId = $_GET['manager_id'] ?? null;
        if (!$managerId) {
            Response::error('manager_id requerido', 400);
            return;
        }
        $stmt = $this->pdo->prepare("SELECT id, full_name, email, job_title, created_at FROM users WHERE manager_id LIKE :mid");
        $stmt->execute([':mid' => $managerId]);
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    private function setPassword(string $id): void
    {
        $actor = Auth::user();
        $role = $actor['platform_role'] ?? '';
        $allowed = ['super_admin', 'admin', 'support', 'finance', 'legal', 'security', 'it_admin'];
        if (!in_array($role, $allowed, true)) {
            Response::error('Unauthorized', 403);
            return;
        }

        $data = $this->readPayload();
        $password = (string)($data['password'] ?? '');

        if ($password === '') {
            Response::error('password es requerido', 422);
            return;
        }

        if (strlen($password) < 8) {
            Response::error('La contraseña debe tener al menos 8 caracteres', 422);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT id, email FROM users WHERE id LIKE :id AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            Response::error('Usuario no encontrado', 404);
            return;
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);

        try {
            $this->pdo->beginTransaction();

            $upd = $this->pdo->prepare("UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id LIKE :id");
            $upd->execute([':hash' => $hash, ':id' => $id]);

            $this->pdo->prepare("DELETE FROM password_resets WHERE email LIKE :email")->execute([':email' => $user['email']]);

            $this->pdo->prepare("UPDATE user_sessions SET is_active = 0 WHERE user_id LIKE :id AND is_active = 1")->execute([':id' => $id]);

            $this->pdo->commit();

            $this->audit->log('user.password_set', 'user', $id, ['by' => $actor['id'] ?? null]);

            Response::json(['message' => 'Contraseña actualizada e iniciar sesión requerido']);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Error al actualizar contraseña', 500, ['error' => $e->getMessage()]);
        }
    }

    private function ensurePasswordResetsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(190) NOT NULL,
                token VARCHAR(190) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function getFrontendUrl(): string
    {
         try {
            $stmt = $this->pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'system_frontend_url' LIMIT 1");
            $stmt->execute();
            $url = $stmt->fetchColumn();
            if ($url) return rtrim($url, '/');
         } catch (Throwable $e) {}

         return 'http://localhost:5173';
    }

    private function readPayload(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw) {
            $json = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
                return $json;
            }
        }
        if (!empty($_POST)) return $_POST;
        return [];
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private function tableExists(string $table): bool
    {
        try {
            $stmt = $this->pdo->prepare("SELECT 1 FROM {$table} LIMIT 1");
            $stmt->execute();
            return true;
        } catch (Exception $e) {
            return false;
        }
    }
}
