<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class OnboardingController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS onboarding_tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'pending', -- pending, completed
                completed_at DATETIME NULL,
                required BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                type VARCHAR(20) DEFAULT 'onboarding', -- onboarding, offboarding
                INDEX (user_id),
                INDEX (type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        
        // Migration for existing tables without type
        try {
            $this->pdo->exec("ALTER TABLE onboarding_tasks ADD COLUMN type VARCHAR(20) DEFAULT 'onboarding' AFTER created_at");
            $this->pdo->exec("CREATE INDEX idx_type ON onboarding_tasks(type)");
        } catch (\Exception $e) {
            // Ignore if exists
        }

        try {
            $this->pdo->exec("ALTER TABLE onboarding_tasks ADD COLUMN responsible_id VARCHAR(36) NULL AFTER type");
            $this->pdo->exec("ALTER TABLE onboarding_tasks ADD COLUMN sla_due_at DATETIME NULL AFTER responsible_id");
            $this->pdo->exec("ALTER TABLE onboarding_tasks ADD COLUMN checklist_group VARCHAR(50) NULL AFTER sla_due_at");
        } catch (\Exception $e) {
            // Ignore if exists
        }

        // Templates table for company-specific checklists
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS onboarding_templates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                checklist_group VARCHAR(50) NOT NULL,
                sla_days INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function triggerOffboarding(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $userId = $data['user_id'] ?? null;
        
        if (!$userId) {
            Response::error('User ID required', 400);
            return;
        }

        $this->assignOffboardingTasks($userId);
        Response::json(['message' => 'Offboarding initiated']);
    }

    public function assignDefaultTasks(string $userId): void
    {
        // Avoid duplicates for onboarding
        $stmt = $this->pdo->prepare("SELECT count(*) FROM onboarding_tasks WHERE user_id LIKE ? AND type = 'onboarding'");
        $stmt->execute([$userId]);
        if ($stmt->fetchColumn() > 0) {
            return;
        }

        $tasks = [
            ['title' => 'Subir Identificación (ID/Pasaporte)', 'desc' => 'Sube una foto clara de tu documento de identidad (frente y dorso).', 'req' => 1],
            ['title' => 'Firmar Contrato', 'desc' => 'Revisa y firma digitalmente tu contrato de trabajo adjunto.', 'req' => 1],
            ['title' => 'Completar Información Bancaria', 'desc' => 'Agrega tu cuenta bancaria (IBAN/SWIFT) para recibir pagos.', 'req' => 1],
            ['title' => 'Formulario de Impuestos (W-8BEN)', 'desc' => 'Completa el formulario de declaración de impuestos para contratistas internacionales.', 'req' => 1],
            ['title' => 'Leer Manual del Empleado', 'desc' => 'Descarga y lee el manual de políticas de la empresa y código de conducta.', 'req' => 0],
            ['title' => 'Configurar Autenticación 2FA', 'desc' => 'Activa la autenticación de dos factores para mayor seguridad.', 'req' => 0],
        ];

        $stmt = $this->pdo->prepare("INSERT INTO onboarding_tasks (user_id, title, description, required, type) VALUES (?, ?, ?, ?, 'onboarding')");
        foreach ($tasks as $t) {
            $stmt->execute([$userId, $t['title'], $t['desc'], $t['req']]);
        }
    }

    public function assignOffboardingTasks(string $userId): void
    {
        // Avoid duplicates for offboarding
        $stmt = $this->pdo->prepare("SELECT count(*) FROM onboarding_tasks WHERE user_id LIKE ? AND type = 'offboarding'");
        $stmt->execute([$userId]);
        if ($stmt->fetchColumn() > 0) {
            return;
        }

        $tasks = [
            ['title' => 'Entrevista de Salida', 'desc' => 'Completar la encuesta de satisfacción y entrevista final con RRHH.', 'req' => 1],
            ['title' => 'Devolución de Equipo', 'desc' => 'Devolver laptop, monitor y periféricos asignados.', 'req' => 1],
            ['title' => 'Revocación de Accesos', 'desc' => 'Confirmar la eliminación de accesos a sistemas (Slack, Email, Jira).', 'req' => 1],
            ['title' => 'Firma de Acuerdo de Terminación', 'desc' => 'Firmar digitalmente el acuerdo de confidencialidad post-empleo.', 'req' => 1],
            ['title' => 'Entrega de Credenciales', 'desc' => 'Entregar tarjetas de acceso a la oficina y llaves.', 'req' => 0],
        ];

        $stmt = $this->pdo->prepare("INSERT INTO onboarding_tasks (user_id, title, description, required, type) VALUES (?, ?, ?, ?, 'offboarding')");
        foreach ($tasks as $t) {
            $stmt->execute([$userId, $t['title'], $t['desc'], $t['req']]);
        }
    }

    public function assignInternalOnboardingTasks(string $userId, ?string $companyId = null): void
    {
        // Check if already exists
        $stmt = $this->pdo->prepare("SELECT count(*) FROM onboarding_tasks WHERE user_id LIKE ? AND type = 'internal_onboarding'");
        $stmt->execute([$userId]);
        if ($stmt->fetchColumn() > 0) {
            return;
        }

        $tasks = [];

        // If companyId provided, fetch templates
        if ($companyId) {
            $stmt = $this->pdo->prepare("SELECT * FROM onboarding_templates WHERE company_id = ?");
            $stmt->execute([$companyId]);
            $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (count($templates) > 0) {
                foreach ($templates as $tmpl) {
                    $tasks[] = [
                        'title' => $tmpl['title'],
                        'desc' => $tmpl['description'],
                        'group' => $tmpl['checklist_group'],
                        'sla' => '+' . $tmpl['sla_days'] . ' days'
                    ];
                }
            } else {
                // If no templates, seed defaults and use them
                $this->seedDefaultTemplates($companyId);
                // Re-fetch
                $stmt->execute([$companyId]);
                $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($templates as $tmpl) {
                    $tasks[] = [
                        'title' => $tmpl['title'],
                        'desc' => $tmpl['description'],
                        'group' => $tmpl['checklist_group'],
                        'sla' => '+' . $tmpl['sla_days'] . ' days'
                    ];
                }
            }
        } else {
             // Fallback to hardcoded if no companyId (should not happen in this flow)
             $tasks = [
                // Accesos
                ['title' => 'Crear cuenta de correo corporativo', 'desc' => 'Solicitar a IT la creación del email.', 'group' => 'accesos', 'sla' => '+2 days'],
                ['title' => 'Configurar acceso a Slack', 'desc' => 'Invitar al canal general y canales de equipo.', 'group' => 'accesos', 'sla' => '+1 days'],
                ['title' => 'Acceso a Jira/Trello', 'desc' => 'Dar permisos en el tablero del proyecto.', 'group' => 'accesos', 'sla' => '+1 days'],
                
                // Inducción
                ['title' => 'Agendar sesión de bienvenida', 'desc' => 'Reunión con HR y Manager.', 'group' => 'induccion', 'sla' => '+3 days'],
                ['title' => 'Tour de oficina / Virtual', 'desc' => 'Mostrar instalaciones o herramientas remotas.', 'group' => 'induccion', 'sla' => '+3 days'],
                ['title' => 'Revisión de Manual de Empleado', 'desc' => 'Asegurar lectura de políticas.', 'group' => 'induccion', 'sla' => '+5 days'],

                // Documentación
                ['title' => 'Verificar DNI/Pasaporte', 'desc' => 'Confirmar validez del documento subido.', 'group' => 'documentacion', 'sla' => '+2 days'],
                ['title' => 'Validar Contrato Firmado', 'desc' => 'Revisar firma digital y archivar.', 'group' => 'documentacion', 'sla' => '+1 days'],
                ['title' => 'Alta en Sistema de Nómina', 'desc' => 'Ingresar datos bancarios en plataforma de pago.', 'group' => 'documentacion', 'sla' => '+4 days'],
            ];
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO onboarding_tasks 
            (user_id, title, description, required, type, checklist_group, sla_due_at, status) 
            VALUES (?, ?, ?, 1, 'internal_onboarding', ?, ?, 'pending')
        ");

        foreach ($tasks as $t) {
            $slaDate = date('Y-m-d H:i:s', strtotime($t['sla']));
            $stmt->execute([$userId, $t['title'], $t['desc'], $t['group'], $slaDate]);
        }
    }

    public function getTemplates(string $companyId): void
    {
        // Auto-seed if empty
        $stmt = $this->pdo->prepare("SELECT count(*) FROM onboarding_templates WHERE company_id = ?");
        $stmt->execute([$companyId]);
        if ($stmt->fetchColumn() == 0) {
            $this->seedDefaultTemplates($companyId);
        }

        $stmt = $this->pdo->prepare("SELECT * FROM onboarding_templates WHERE company_id = ? ORDER BY checklist_group, id");
        $stmt->execute([$companyId]);
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    private function seedDefaultTemplates(string $companyId): void
    {
        $defaults = [
             // Accesos
            ['title' => 'Crear cuenta de correo corporativo', 'desc' => 'Solicitar a IT la creación del email.', 'group' => 'accesos', 'sla' => 2],
            ['title' => 'Configurar acceso a Slack', 'desc' => 'Invitar al canal general y canales de equipo.', 'group' => 'accesos', 'sla' => 1],
            ['title' => 'Acceso a Jira/Trello', 'desc' => 'Dar permisos en el tablero del proyecto.', 'group' => 'accesos', 'sla' => 1],
            
            // Inducción
            ['title' => 'Agendar sesión de bienvenida', 'desc' => 'Reunión con HR y Manager.', 'group' => 'induccion', 'sla' => 3],
            ['title' => 'Tour de oficina / Virtual', 'desc' => 'Mostrar instalaciones o herramientas remotas.', 'group' => 'induccion', 'sla' => 3],
            ['title' => 'Revisión de Manual de Empleado', 'desc' => 'Asegurar lectura de políticas.', 'group' => 'induccion', 'sla' => 5],

            // Documentación
            ['title' => 'Verificar DNI/Pasaporte', 'desc' => 'Confirmar validez del documento subido.', 'group' => 'documentacion', 'sla' => 2],
            ['title' => 'Validar Contrato Firmado', 'desc' => 'Revisar firma digital y archivar.', 'group' => 'documentacion', 'sla' => 1],
            ['title' => 'Alta en Sistema de Nómina', 'desc' => 'Ingresar datos bancarios en plataforma de pago.', 'group' => 'documentacion', 'sla' => 4],
        ];

        $stmt = $this->pdo->prepare("
            INSERT INTO onboarding_templates 
            (company_id, title, description, checklist_group, sla_days) 
            VALUES (?, ?, ?, ?, ?)
        ");

        foreach ($defaults as $d) {
            $stmt->execute([$companyId, $d['title'], $d['desc'], $d['group'], $d['sla']]);
        }
    }

    public function createTemplate(string $companyId): void
    {
        $input = json_decode(file_get_contents('php://input'), true);
        
        // Validation
        if (empty($input['title']) || empty($input['checklist_group'])) {
            Response::error('Title and Group are required', 400);
            return;
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO onboarding_templates 
            (company_id, title, description, checklist_group, sla_days) 
            VALUES (?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $companyId,
            $input['title'],
            $input['description'] ?? '',
            $input['checklist_group'],
            (int)($input['sla_days'] ?? 0)
        ]);

        Response::json(['message' => 'Template created', 'id' => $this->pdo->lastInsertId()]);
    }

    public function deleteTemplate(string $id): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM onboarding_templates WHERE id = ?");
        $stmt->execute([$id]);
        Response::json(['message' => 'Template deleted']);
    }

    public function updateTask(string $id): void
    {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $allowedFields = ['status', 'responsible_id', 'sla_due_at'];
        $updates = [];
        $params = [];
        
        foreach ($allowedFields as $field) {
            if (isset($input[$field])) {
                $updates[] = "$field = ?";
                $params[] = $input[$field];
                
                if ($field === 'status' && $input[$field] === 'completed') {
                    $updates[] = "completed_at = NOW()";
                }
            }
        }
        
        if (empty($updates)) {
            Response::json(['message' => 'No changes provided'], 400);
            return;
        }
        
        $params[] = $id;
        $sql = "UPDATE onboarding_tasks SET " . implode(', ', $updates) . " WHERE id = ?";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        
        Response::json(['message' => 'Task updated successfully']);
    }

    public function getMyTasks(string $userId): void
    {
        $type = $_GET['type'] ?? null;

        // Auto-seed onboarding if empty and no type specified or type is onboarding
        if (!$type || $type === 'onboarding') {
            $this->assignDefaultTasks($userId);
        }

        $sql = "SELECT * FROM onboarding_tasks WHERE user_id LIKE ?";
        $params = [$userId];

        if ($type) {
            $sql .= " AND type LIKE ?";
            $params[] = $type;
        }

        $sql .= " ORDER BY required DESC, id ASC";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    public function completeTask(string $id): void
    {
        $stmt = $this->pdo->prepare("UPDATE onboarding_tasks SET status = 'completed', completed_at = NOW() WHERE id = ?");
        $stmt->execute([$id]);
        Response::json(['message' => 'Task completed']);
    }
    
    public function resetTask(string $id): void
    {
        $stmt = $this->pdo->prepare("UPDATE onboarding_tasks SET status = 'pending', completed_at = NULL WHERE id = ?");
        $stmt->execute([$id]);
        Response::json(['message' => 'Task reset']);
    }

    // Get tasks for a specific user (Admin view)
    public function getUserTasks(string $userId): void
    {
        $type = $_GET['type'] ?? null;
        
        // Auto-seed if empty
        if (!$type || $type === 'onboarding') {
            $this->assignDefaultTasks($userId);
        }

        $sql = "SELECT * FROM onboarding_tasks WHERE user_id = ?";
        $params = [$userId];

        if ($type) {
            $sql .= " AND type = ?";
            $params[] = $type;
        }

        $sql .= " ORDER BY required DESC, id ASC";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    // Assign a manager to a user (for Org Chart demo)
    public function assignManager(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $userId = $data['user_id'] ?? null;
        $managerId = $data['manager_id'] ?? null;

        if (!$userId) {
            Response::error('User ID required', 400);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE users SET manager_id = ? WHERE id = ?");
        $stmt->execute([$managerId, $userId]);
        Response::json(['message' => 'Manager assigned']);
    }
    
    // Get Org Chart Data
    public function getOrgChart(): void
    {
        // Fetch all users with id, full_name, email, platform_role, manager_id, status 
        $stmt = $this->pdo->query("
            SELECT id, full_name, email, platform_role, manager_id, status 
            FROM users 
            WHERE status = 'active'
        ");
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        Response::json($users);
    }

    // Get All Users Progress (Admin Dashboard)
    public function getAllUsersProgress(): void
    {
        $type = $_GET['type'] ?? 'onboarding';
        $companyId = $_GET['company_id'] ?? null;
        
        $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
        if ($limit < 1) $limit = 50;
        if ($limit > 100) $limit = 100;
        
        $offset = 0;
        if ($page) {
            $page = max(1, $page);
            $offset = ($page - 1) * $limit;
        }

        // Build Query
        $sql = "SELECT u.id, u.full_name, u.email, u.platform_role, u.created_at, u.status,
                       COUNT(t.id) as tasks_total,
                       SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as tasks_completed
                FROM users u";

        if ($companyId) {
            $sql .= " JOIN company_users cu ON u.id = cu.user_id AND cu.deleted_at IS NULL";
        }
        
        $sql .= " LEFT JOIN onboarding_tasks t ON u.id = t.user_id AND t.type = :type";
        
        $whereClauses = [];
        $params = [':type' => $type];

        if ($companyId) {
            $whereClauses[] = "cu.company_id = :company_id";
            $params[':company_id'] = $companyId;
        }

        if ($type === 'offboarding') {
            // Show terminated/suspended users, OR active users who have tasks
            $whereClauses[] = "(u.status IN ('terminated', 'suspended') OR (u.status = 'active' AND t.id IS NOT NULL))";
        } else {
            // Default onboarding: only active users
            $whereClauses[] = "u.status = 'active'";
            // Exclude super_admin and support from onboarding list as per requirement
            $whereClauses[] = "u.platform_role NOT IN ('super_admin', 'support')";
        }

        if (!empty($whereClauses)) {
            $sql .= " WHERE " . implode(' AND ', $whereClauses);
        }
        
        $sql .= " GROUP BY u.id ORDER BY u.created_at DESC";
        
        // Add limit/offset
        $sql .= " LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Calculate progress percentage
        foreach ($results as &$row) {
            $total = (int)$row['tasks_total'];
            $completed = (int)$row['tasks_completed'];
            $row['progress'] = ($total > 0) ? round(($completed / $total) * 100) : 0;
        }

        if ($page) {
            // Count total for pagination (using subquery or simplified count)
            // Simplified count might be inaccurate with GROUP BY and HAVING, but here we filter in WHERE
            // COUNT(DISTINCT u.id) is safer with joins
            $countSql = "SELECT COUNT(DISTINCT u.id) FROM users u";
            
            if ($companyId) {
                $countSql .= " JOIN company_users cu ON u.id = cu.user_id AND cu.deleted_at IS NULL";
            }
            
            $countSql .= " LEFT JOIN onboarding_tasks t ON u.id = t.user_id AND t.type LIKE :type";
            
            if (!empty($whereClauses)) {
                $countSql .= " WHERE " . implode(' AND ', $whereClauses);
            }
            
            $countStmt = $this->pdo->prepare($countSql);
            foreach ($params as $k => $v) {
                $countStmt->bindValue($k, $v);
            }
            $countStmt->execute();
            $total = (int)$countStmt->fetchColumn();

            Response::json([
                'data' => $results,
                'pagination' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => ceil($total / $limit)
                ]
            ]);
        } else {
            Response::json($results);
        }
    }
}
