<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\AuditLogger;
use PDO;

class AuditController
{
    private AuditLogger $logger;
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->logger = new AuditLogger();
        $this->pdo = $database->pdo();
    }

    public function handle(array $segments, string $method)
    {
        $user = \App\Support\Auth::user();
        $role = $user['platform_role'] ?? 'user';

        // Allow super_admin, admin, security, legal, support, and company_admin roles
        if (!in_array($role, ['super_admin', 'admin', 'security', 'legal', 'support', 'company_admin'])) {
            Response::error('Unauthorized access to audit logs', 403);
            return;
        }

        if ($method === 'GET' && (($segments[2] ?? '') === 'export' || ($segments[0] ?? '') === 'export')) {
            $this->export($user);
            return;
        }

        if ($method === 'GET') {
            $this->index($user);
            return;
        }
        Response::error('Method not allowed', 405);
    }

    private function index(array $user)
    {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = (int)($_GET['limit'] ?? $_GET['per_page'] ?? 50);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $userId = $_GET['user_id'] ?? null;
        $action = $_GET['action'] ?? null;
        $companyId = $_GET['company_id'] ?? null;
        
        // Enforce company scope for company_admin
        if (($user['platform_role'] ?? '') === 'company_admin') {
            $companyId = $user['company_id'] ?? null;
            if (!$companyId) {
                Response::json(['data' => [], 'meta' => ['total' => 0]]);
                return;
            }
        }

        $filters = [];

        if ($userId) {
            $filters['actor_user_id'] = $userId;
        }
        if ($action) {
            $filters['action'] = $action;
        }
        if ($companyId) {
            $filters['company_id'] = $companyId;
        }

        $result = $this->logger->getLogs($filters, $limit, $offset);
        $logs = $this->enrichLogs($result['data']);

        Response::json([
            'data' => $logs,
            'meta' => [
                'page' => $page,
                'per_page' => $limit,
                'total' => $result['total'],
                'last_page' => (int)ceil($result['total'] / max(1, $limit)),
                'total_pages' => (int)ceil($result['total'] / max(1, $limit))
            ]
        ]);
    }

    private function export(array $user)
    {
        $userId = $_GET['user_id'] ?? null;
        $filters = [];
        if ($userId) {
            $filters['actor_user_id'] = $userId;
        }
        
        // Enforce company scope for company_admin
        if (($user['platform_role'] ?? '') === 'company_admin') {
            $companyId = $user['company_id'] ?? null;
            if ($companyId) {
                $filters['company_id'] = $companyId;
            } else {
                 // No company, empty export
                 exit;
            }
        } elseif (isset($_GET['company_id'])) {
             $filters['company_id'] = $_GET['company_id'];
        }

        // Export all logs (or reasonable limit)
        $result = $this->logger->getLogs($filters, 1000, 0);
        $items = $this->enrichLogs($result['data']);

        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="audit_logs_' . date('Y-m-d_H-i-s') . '.csv"');

        $fp = fopen('php://output', 'w');
        
        // BOM for Excel
        fputs($fp, "\xEF\xBB\xBF");

        // Header
        fputcsv($fp, ['Fecha', 'Actor', 'Email Actor', 'Acción', 'Tipo Objeto', 'ID Objeto', 'IP', 'User Agent', 'Detalles']);

        foreach ($items as $row) {
            fputcsv($fp, [
                $row['created_at'],
                $row['actor_name'] ?? $row['actor_user_id'],
                $row['actor_email'] ?? '',
                $row['action'],
                $row['object_type'],
                $row['object_id'],
                $row['ip'],
                $row['user_agent'],
                json_encode($row['metadata'], JSON_UNESCAPED_UNICODE)
            ]);
        }
        
        fclose($fp);
        exit;
    }

    private function enrichLogs(array $logs): array
    {
        if (empty($logs)) {
            return [];
        }

        $actorIds = [];
        foreach ($logs as $log) {
            if (!empty($log['actor_user_id'])) {
                $actorIds[$log['actor_user_id']] = true;
            }
        }
        $actorIds = array_keys($actorIds);

        $actors = [];
        if ($actorIds) {
            $placeholders = implode(',', array_fill(0, count($actorIds), '?'));
            $stmt = $this->pdo->prepare("SELECT id, full_name, email FROM users WHERE id IN ($placeholders)");
            $stmt->execute($actorIds);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $u) {
                $actors[$u['id']] = $u;
            }
        }

        foreach ($logs as &$log) {
            $actorId = $log['actor_user_id'] ?? null;
            
            if (empty($actorId)) {
                $log['actor_name'] = 'Sistema';
                $log['actor_email'] = '';
            } elseif (isset($actors[$actorId])) {
                $log['actor_name'] = $actors[$actorId]['full_name'];
                $log['actor_email'] = $actors[$actorId]['email'];
            } else {
                $log['actor_name'] = 'Usuario no encontrado (ID: ' . $actorId . ')';
                $log['actor_email'] = '';
            }
            
            // Populate user object for frontend compatibility if needed
            $log['user'] = [
                'name' => $log['actor_name'],
                'email' => $log['actor_email']
            ];
        }

        return $logs;
    }
}
