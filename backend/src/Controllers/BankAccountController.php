<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Exception;

class BankAccountController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
    }

    private function hasColumn(string $table, string $column): bool
    {
        try {
            $stmt = $this->pdo->prepare("SHOW COLUMNS FROM {$table} LIKE :col");
            $stmt->execute([':col' => $column]);
            return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return false;
        }
    }
    
    private function getTableColumns(string $table): array
    {
        try {
            $stmt = $this->pdo->query("SHOW COLUMNS FROM {$table}");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $cols = [];
            foreach ($rows as $r) {
                if (isset($r['Field'])) $cols[] = strtolower($r['Field']);
                elseif (isset($r['field'])) $cols[] = strtolower($r['field']);
            }
            return $cols;
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function resolveCountryId(?string $input): ?string
    {
        if (!$input) return null;
        $val = trim($input);
        if ($val === '') return null;
        // If looks like UUID or numeric ID, try as-is
        try {
            $stmt = $this->pdo->prepare("SELECT id FROM countries WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $val]);
            $id = $stmt->fetchColumn();
            if ($id) return $id;
        } catch (\Throwable $e) {}
        // Try code columns (iso2/iso3/code)
        $fields = ['code','iso2','iso3','alpha2','alpha3'];
        foreach ($fields as $f) {
            try {
                $stmt = $this->pdo->prepare("SELECT id FROM countries WHERE {$f} = :v LIMIT 1");
                $stmt->execute([':v' => strtoupper($val)]);
                $id = $stmt->fetchColumn();
                if ($id) return $id;
            } catch (\Throwable $e) {}
        }
        return null;
    }

    public function handle(array $segments, string $method): void
    {
        $this->ensureTables();

        // /api/bank-accounts
        $id = $segments[2] ?? null;

        if ($id) {
            if ($method === 'DELETE') {
                $this->destroy($id);
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

    private function ensureTables(): void
    {
        // Patch: Ensure user_id exists (migration from freelancer_id if needed)
        try {
            $stmt = $this->pdo->query("DESCRIBE bank_accounts");
            $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $columns = array_map('strtolower', $columns);

            if (!in_array('user_id', $columns)) {
                if (in_array('freelancer_id', $columns)) {
                    // Rename freelancer_id to user_id
                    $this->pdo->exec("ALTER TABLE bank_accounts CHANGE COLUMN freelancer_id user_id VARCHAR(36) NOT NULL");
                } else {
                    // Add user_id if neither exists
                    $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN user_id VARCHAR(36) NOT NULL AFTER id");
                }
            }
            // Patch: Ensure is_primary column exists for ordering/primary flag
            if (!in_array('is_primary', $columns)) {
                $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN is_primary TINYINT(1) DEFAULT 0 AFTER country_code");
            }
            // Patch: Ensure account_holder_name compatibility (older schemas used account_holder)
            if (!in_array('account_holder_name', $columns) && in_array('account_holder', $columns)) {
                try {
                    $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN account_holder_name VARCHAR(150) NULL AFTER bank_name");
                    // Backfill from legacy column if possible
                    $this->pdo->exec("UPDATE bank_accounts SET account_holder_name = account_holder WHERE account_holder_name IS NULL OR account_holder_name = ''");
                } catch (\PDOException $e) {
                    // Ignore if cannot add; runtime will fallback to legacy column
                }
            }
        } catch (\Throwable $e) {
            // Table might not exist yet, handled by CREATE TABLE below
        }

        // Patch: Ensure ENUM includes 'payoneer'
        try {
            $this->pdo->exec("ALTER TABLE bank_accounts MODIFY COLUMN type ENUM('bank_transfer', 'wise', 'paypal', 'crypto', 'payoneer') NOT NULL DEFAULT 'bank_transfer'");
        } catch (\PDOException $e) {
            // Ignore if already done or if table doesn't exist yet (next block will create it)
        }

        // Patch: Add validation_status column
        try {
            $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN validation_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending'");
        } catch (\PDOException $e) {
            // Ignore if column already exists
        }

        // Patch: Ensure deleted_at column exists
        try {
            $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN deleted_at DATETIME NULL AFTER updated_at");
        } catch (\PDOException $e) {
            // Ignore if column already exists
        }

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS bank_accounts (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                bank_name VARCHAR(150) NOT NULL,
                account_holder_name VARCHAR(150) NOT NULL,
                account_number VARCHAR(100) NOT NULL,
                routing_number VARCHAR(50) NULL,
                swift_code VARCHAR(50) NULL,
                currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
                type ENUM('bank_transfer', 'wise', 'paypal', 'crypto', 'payoneer') NOT NULL DEFAULT 'bank_transfer',
                country_code VARCHAR(2) NULL,
                is_primary TINYINT(1) DEFAULT 0,
                validation_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function index(): void
    {
        $userId = Auth::userId();
        if (!$userId) {
            Response::error('Unauthorized', 401);
            return;
        }

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $useSoftDelete = $this->hasColumn('bank_accounts', 'deleted_at');
        $hasPrimary = $this->hasColumn('bank_accounts', 'is_primary');
        $hasCreatedAt = $this->hasColumn('bank_accounts', 'created_at');
        $orderSecondary = $hasCreatedAt ? 'created_at' : 'id';

        // Count
        if ($useSoftDelete) {
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM bank_accounts WHERE user_id = :uid AND deleted_at IS NULL");
        } else {
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM bank_accounts WHERE user_id = :uid");
        }
        $countStmt->execute([':uid' => $userId]);
        $total = (int)$countStmt->fetchColumn();

        if ($useSoftDelete) {
            if ($hasPrimary) {
                $stmt = $this->pdo->prepare("
                    SELECT * FROM bank_accounts 
                    WHERE user_id = :uid AND deleted_at IS NULL 
                    ORDER BY is_primary DESC, {$orderSecondary} DESC
                    LIMIT :limit OFFSET :offset
                ");
            } else {
                $stmt = $this->pdo->prepare("
                    SELECT * FROM bank_accounts 
                    WHERE user_id = :uid AND deleted_at IS NULL 
                    ORDER BY {$orderSecondary} DESC
                    LIMIT :limit OFFSET :offset
                ");
            }
        } else {
            if ($hasPrimary) {
                $stmt = $this->pdo->prepare("
                    SELECT * FROM bank_accounts 
                    WHERE user_id = :uid
                    ORDER BY is_primary DESC, {$orderSecondary} DESC
                    LIMIT :limit OFFSET :offset
                ");
            } else {
                $stmt = $this->pdo->prepare("
                    SELECT * FROM bank_accounts 
                    WHERE user_id = :uid
                    ORDER BY {$orderSecondary} DESC
                    LIMIT :limit OFFSET :offset
                ");
            }
        }
        $stmt->bindValue(':uid', $userId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Normalize legacy column name to ensure frontend compatibility
        $holderCandidates = ['account_holder_name','account_holder','holder_name','holder','beneficiary','beneficiary_name'];
        foreach ($items as &$it) {
            $holderVal = $it['account_holder_name'] ?? null;
            if ($holderVal === null || $holderVal === '') {
                foreach ($holderCandidates as $cand) {
                    if (isset($it[$cand]) && $it[$cand] !== '') {
                        $holderVal = $it[$cand];
                        break;
                    }
                }
            }
            $it['account_holder_name'] = $holderVal;
        }
        unset($it);

        Response::json([
            'data' => $items,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function store(): void
    {
        $userId = Auth::userId();
        if (!$userId) {
            Response::error('Unauthorized', 401);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        
        // Discover schema columns
        $cols = $this->getTableColumns('bank_accounts');
        $colsL = array_map('strtolower', $cols);
        $holderInput = $data['account_holder_name'] ?? $data['account_holder'] ?? $data['holder_name'] ?? $data['holder'] ?? $data['beneficiary'] ?? $data['beneficiary_name'] ?? '';
        $accountInput = $data['account_number'] ?? $data['iban'] ?? $data['account'] ?? '';
        $holderCandidates = ['account_holder_name','account_holder','holder_name','holder','beneficiary','beneficiary_name'];
        $holderCol = null;
        foreach ($holderCandidates as $cand) {
            if (in_array($cand, $colsL, true)) { $holderCol = $cand; break; }
        }

        if (empty($data['bank_name']) || empty($accountInput) || ($holderCol !== null && empty($holderInput))) {
            Response::error('Faltan campos requeridos', 422);
            return;
        }

        $id = $this->uuid();
        $isPrimary = !empty($data['is_primary']) ? 1 : 0;
        $hasPrimary = $this->hasColumn('bank_accounts', 'is_primary');
        $useSoftDelete = $this->hasColumn('bank_accounts', 'deleted_at');

        // If this is primary, unset others
        if ($isPrimary && $hasPrimary) {
            $stmt = $this->pdo->prepare("UPDATE bank_accounts SET is_primary = 0 WHERE user_id = :uid");
            $stmt->execute([':uid' => $userId]);
        } else {
            // If it's the first account, make it primary
            if ($useSoftDelete) {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM bank_accounts WHERE user_id = :uid AND deleted_at IS NULL");
            } else {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM bank_accounts WHERE user_id = :uid");
            }
            $stmt->execute([':uid' => $userId]);
            if ($stmt->fetchColumn() == 0) {
                $isPrimary = 1;
            }
        }

        // Determine holder column dynamically (optional)
        // $holderCol computed above

        $accountNumberCol = null;
        if ($this->hasColumn('bank_accounts', 'account_number')) {
            $accountNumberCol = 'account_number';
        } elseif ($this->hasColumn('bank_accounts', 'iban')) {
            $accountNumberCol = 'iban';
        } elseif ($this->hasColumn('bank_accounts', 'account')) {
            $accountNumberCol = 'account';
        } else {
            // Intentar crear alguna columna para número de cuenta sin depender de AFTER y tolerando permisos
            try {
                $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN account_number VARCHAR(191) NULL");
            } catch (\Throwable $e) {
                // Ignorar y probar alternativas
            }
            if ($this->hasColumn('bank_accounts', 'account_number')) {
                $accountNumberCol = 'account_number';
            } else {
                try {
                    $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN account VARCHAR(191) NULL");
                } catch (\Throwable $e) {
                    // Ignorar
                }
                if ($this->hasColumn('bank_accounts', 'account')) {
                    $accountNumberCol = 'account';
                } else {
                    try {
                        $this->pdo->exec("ALTER TABLE bank_accounts ADD COLUMN iban VARCHAR(191) NULL");
                    } catch (\Throwable $e) {
                        // Ignorar
                    }
                    if ($this->hasColumn('bank_accounts', 'iban')) {
                        $accountNumberCol = 'iban';
                    } else {
                        Response::error('Schema inválido: falta columna de cuenta en bank_accounts', 500);
                        return;
                    }
                }
            }
        }

        $columns = ['id', 'user_id', 'bank_name', $accountNumberCol];
        $placeholders = [':id', ':uid', ':bank', ':num'];
        if ($holderCol !== null) {
            array_splice($columns, 3, 0, [$holderCol]);
            array_splice($placeholders, 3, 0, [':holder']);
        }
        $params = [
            ':id' => $id,
            ':uid' => $userId,
            ':bank' => $data['bank_name'],
            ':num' => $accountInput,
        ];
        if ($holderCol !== null) {
            $params[':holder'] = $holderInput;
        }

        if ($this->hasColumn('bank_accounts', 'routing_number')) {
            $columns[] = 'routing_number';
            $placeholders[] = ':routing';
            $params[':routing'] = $data['routing_number'] ?? null;
        }
        if ($this->hasColumn('bank_accounts', 'swift_code')) {
            $columns[] = 'swift_code';
            $placeholders[] = ':swift';
            $params[':swift'] = $data['swift_code'] ?? null;
        }
        if ($this->hasColumn('bank_accounts', 'currency_code')) {
            $columns[] = 'currency_code';
            $placeholders[] = ':curr';
            $params[':curr'] = $data['currency_code'] ?? 'USD';
        } elseif ($this->hasColumn('bank_accounts', 'currency')) {
            $columns[] = 'currency';
            $placeholders[] = ':curr';
            $params[':curr'] = $data['currency_code'] ?? $data['currency'] ?? 'USD';
        }
        if ($this->hasColumn('bank_accounts', 'type')) {
            $columns[] = 'type';
            $placeholders[] = ':type';
            $params[':type'] = $data['type'] ?? 'bank_transfer';
        }
        if ($this->hasColumn('bank_accounts', 'country_code')) {
            $columns[] = 'country_code';
            $placeholders[] = ':country';
            $params[':country'] = $data['country_code'] ?? null;
        } elseif ($this->hasColumn('bank_accounts', 'country_id')) {
            $columns[] = 'country_id';
            $placeholders[] = ':country_id';
            $params[':country_id'] = $this->resolveCountryId($data['country_code'] ?? $data['country_id'] ?? null);
        }
        if ($hasPrimary) {
            $columns[] = 'is_primary';
            $placeholders[] = ':primary';
            $params[':primary'] = $isPrimary;
        }

        $sql = "INSERT INTO bank_accounts (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['message' => 'Cuenta agregada correctamente', 'id' => $id], 201);
    }

    private function update(string $id): void
    {
        $userId = Auth::userId();
        if (!$userId) {
            Response::error('Unauthorized', 401);
            return;
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];

        // Only allow updating own records
        $stmtChk = $this->pdo->prepare("SELECT id, user_id FROM bank_accounts WHERE id = :id LIMIT 1");
        $stmtChk->execute([':id' => $id]);
        $row = $stmtChk->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['user_id'] !== $userId) {
            Response::error('Not found', 404);
            return;
        }

        $cols = $this->getTableColumns('bank_accounts');
        $colsL = array_map('strtolower', $cols);

        $sets = [];
        $params = [':id' => $id, ':uid' => $userId];

        if (in_array('bank_name', $colsL) && isset($data['bank_name'])) {
            $sets[] = "bank_name = :bank";
            $params[':bank'] = $data['bank_name'];
        }

        $holderCandidates = ['account_holder_name','account_holder','holder_name','holder','beneficiary','beneficiary_name'];
        $holderCol = null;
        foreach ($holderCandidates as $cand) {
            if (in_array($cand, $colsL, true)) { $holderCol = $cand; break; }
        }
        if ($holderCol && isset($data['account_holder_name']) || isset($data['account_holder']) || isset($data['holder_name']) || isset($data['holder']) || isset($data['beneficiary']) || isset($data['beneficiary_name'])) {
            $val = $data['account_holder_name'] ?? $data['account_holder'] ?? $data['holder_name'] ?? $data['holder'] ?? $data['beneficiary'] ?? $data['beneficiary_name'];
            $sets[] = "{$holderCol} = :holder";
            $params[':holder'] = $val;
        }

        // Account number-ish column
        $accCol = null;
        foreach (['account_number','iban','account'] as $cand) {
            if (in_array($cand, $colsL, true)) { $accCol = $cand; break; }
        }
        if ($accCol && (isset($data['account_number']) || isset($data['iban']) || isset($data['account']))) {
            $val = $data['account_number'] ?? $data['iban'] ?? $data['account'];
            $sets[] = "{$accCol} = :num";
            $params[':num'] = $val;
        }

        if (in_array('routing_number', $colsL) && array_key_exists('routing_number', $data)) {
            $sets[] = "routing_number = :routing";
            $params[':routing'] = $data['routing_number'];
        }
        if (in_array('swift_code', $colsL) && array_key_exists('swift_code', $data)) {
            $sets[] = "swift_code = :swift";
            $params[':swift'] = $data['swift_code'];
        }
        if (in_array('currency_code', $colsL) && array_key_exists('currency_code', $data)) {
            $sets[] = "currency_code = :curr";
            $params[':curr'] = $data['currency_code'];
        } elseif (in_array('currency', $colsL) && (array_key_exists('currency', $data) || array_key_exists('currency_code', $data))) {
            $sets[] = "currency = :curr";
            $params[':curr'] = $data['currency'] ?? $data['currency_code'];
        }
        if (in_array('type', $colsL) && array_key_exists('type', $data)) {
            $sets[] = "type = :type";
            $params[':type'] = $data['type'];
        }
        if (in_array('country_code', $colsL) && array_key_exists('country_code', $data)) {
            $sets[] = "country_code = :country";
            $params[':country'] = $data['country_code'];
        } elseif (in_array('country_id', $colsL) && (array_key_exists('country_code', $data) || array_key_exists('country_id', $data))) {
            $cid = $this->resolveCountryId($data['country_id'] ?? $data['country_code'] ?? null);
            $sets[] = "country_id = :country_id";
            $params[':country_id'] = $cid;
        }
        if (in_array('is_primary', $colsL) && array_key_exists('is_primary', $data)) {
            $isPrimary = $data['is_primary'] ? 1 : 0;
            if ($isPrimary) {
                // Unset others
                $stmt = $this->pdo->prepare("UPDATE bank_accounts SET is_primary = 0 WHERE user_id = :uid");
                $stmt->execute([':uid' => $userId]);
            }
            $sets[] = "is_primary = :primary";
            $params[':primary'] = $isPrimary;
        }

        if (empty($sets)) {
            Response::json(['message' => 'Sin cambios']);
            return;
        }

        $sql = "UPDATE bank_accounts SET " . implode(', ', $sets) . " WHERE id = :id AND user_id = :uid";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['message' => 'Cuenta actualizada']);
    }

    private function destroy(string $id): void
    {
        $userId = Auth::userId();
        if (!$userId) {
            Response::error('Unauthorized', 401);
            return;
        }

        if ($this->hasColumn('bank_accounts', 'deleted_at')) {
            $stmt = $this->pdo->prepare("UPDATE bank_accounts SET deleted_at = NOW() WHERE id = :id AND user_id = :uid");
            $stmt->execute([':id' => $id, ':uid' => $userId]);
        } else {
            // Fallback hard delete if soft delete column is missing
            $stmt = $this->pdo->prepare("DELETE FROM bank_accounts WHERE id = :id AND user_id = :uid");
            $stmt->execute([':id' => $id, ':uid' => $userId]);
        }

        Response::json(['message' => 'Cuenta eliminada']);
    }

    private function uuid(): string
    {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
