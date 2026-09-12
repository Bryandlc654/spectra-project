<?php

namespace App\Controllers;

use App\Database;
use PDO;
use Exception;
use App\Support\Response;
use App\Support\Auth;
use App\Support\Str;

class NpsController
{
    private $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables()
    {
        $sql = "
            CREATE TABLE IF NOT EXISTS nps_responses (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                score INT NOT NULL,
                feedback TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                -- Foreign keys skipped to avoid strict dependency order issues during auto-migration
            )
        ";
        $this->pdo->exec($sql);
    }

    public function handle(array $segments, string $method)
    {
        // segments: [0] => api, [1] => nps
        
        $action = $segments[2] ?? null;

        // POST /api/nps/submit
        if ($action === 'submit' && $method === 'POST') {
            $this->submitResponse();
            return;
        }

        // GET /api/nps/stats
        if ($action === 'stats' && $method === 'GET') {
            $this->getStats();
            return;
        }

        // GET /api/nps/responses
        if ($action === 'responses' && $method === 'GET') {
            $this->listResponses();
            return;
        }

        Response::error('Endpoint not found', 404);
    }

    private function submitResponse()
    {
        $userId = Auth::userId();
        // Assuming company_id is available from context or user. 
        // For simplicity, let's get the user's current company or first company.
        // Actually, Auth::userId() is reliable. We need to find the company context.
        // Usually sent in header 'X-Company-ID' or derived from user role context.
        // Let's assume passed in body or we look up user's company.
        
        $data = json_decode(file_get_contents('php://input'), true);
        $score = $data['score'] ?? null;
        $feedback = $data['feedback'] ?? '';
        $companyId = $data['company_id'] ?? null;

        if ($score === null || !is_numeric($score) || $score < 0 || $score > 10) {
            Response::error('Invalid score (0-10)', 400);
            return;
        }

        if (!$companyId) {
            // Try to find a company for this user
            $stmt = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
            $stmt->execute([':uid' => $userId]);
            $companyId = $stmt->fetchColumn();
            
            if (!$companyId) {
                Response::error('User is not associated with any company', 400);
                return;
            }
        }

        $id = Str::uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO nps_responses (id, company_id, user_id, score, feedback, created_at)
            VALUES (:id, :cid, :uid, :score, :feedback, NOW())
        ");
        
        try {
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':uid' => $userId,
                ':score' => $score,
                ':feedback' => $feedback
            ]);
            
            Response::json(['message' => 'NPS response submitted successfully', 'id' => $id]);
        } catch (Exception $e) {
            Response::error('Database error: ' . $e->getMessage(), 500);
        }
    }

    private function getStats()
    {
        $companyId = $_GET['company_id'] ?? null;
        if (!$companyId) {
            // Try to infer from user if not admin? 
            // Usually stats are for a specific company context.
            // Let's require it or infer from user.
             $userId = Auth::userId();
             $stmt = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
             $stmt->execute([':uid' => $userId]);
             $companyId = $stmt->fetchColumn();
        }

        if (!$companyId) {
            Response::error('Company ID required', 400);
            return;
        }

        // Calculate stats
        $stmt = $this->pdo->prepare("SELECT score FROM nps_responses WHERE company_id = :cid");
        $stmt->execute([':cid' => $companyId]);
        $scores = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $total = count($scores);
        if ($total === 0) {
            Response::json([
                'nps' => 0,
                'total' => 0,
                'promoters' => 0,
                'passives' => 0,
                'detractors' => 0
            ]);
            return;
        }

        $promoters = 0;
        $detractors = 0;
        $passives = 0;

        foreach ($scores as $s) {
            if ($s >= 9) $promoters++;
            elseif ($s >= 7) $passives++;
            else $detractors++;
        }

        $nps = (($promoters - $detractors) / $total) * 100;

        Response::json([
            'nps' => round($nps, 1),
            'total' => $total,
            'promoters' => $promoters,
            'passives' => $passives,
            'detractors' => $detractors
        ]);
    }

    private function listResponses()
    {
        $companyId = $_GET['company_id'] ?? null;
        
        if (!$companyId) {
             $userId = Auth::userId();
             $stmt = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
             $stmt->execute([':uid' => $userId]);
             $companyId = $stmt->fetchColumn();
        }

        if (!$companyId) {
            Response::error('Company ID required', 400);
            return;
        }

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        // Count total
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM nps_responses WHERE company_id = :cid");
        $countStmt->execute([':cid' => $companyId]);
        $total = $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("
            SELECT r.*, u.full_name, u.email 
            FROM nps_responses r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.company_id = :cid
            ORDER BY r.created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $data,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }
}
