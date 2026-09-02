<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class FreelancerController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables(): void
    {
        // Ensure projects table has start_date and end_date columns (Lazy Migration)
        try {
            $this->pdo->exec("ALTER TABLE projects ADD COLUMN start_date DATE NULL");
        } catch (\Throwable $e) {}
        try {
            $this->pdo->exec("ALTER TABLE projects ADD COLUMN end_date DATE NULL");
        } catch (\Throwable $e) {}

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS freelancer_profiles (
                user_id VARCHAR(36) PRIMARY KEY,
                years_experience INT,
                area VARCHAR(100),
                country VARCHAR(100),
                city VARCHAR(100),
                phone VARCHAR(50),
                bio TEXT,
                skills TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS freelancer_experience (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                company VARCHAR(255) NOT NULL,
                role VARCHAR(255) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                description TEXT,
                current TINYINT(1) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS freelancer_portfolio (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                url VARCHAR(2048),
                image_url VARCHAR(2048),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Migration to ensure user_id column exists
        try {
            $stmt = $this->pdo->query("DESCRIBE freelancer_profiles");
            $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
            // Normalize columns to lowercase just in case
            $columns = array_map('strtolower', $columns);
            
            if (!in_array('user_id', $columns)) {
                // If id exists, we can try to use it or copy from it
                if (in_array('id', $columns)) {
                    // Safe approach: Add user_id, copy data. 
                    // Renaming 'id' can fail if it has FKs or is PK in complex ways.
                    try {
                        $this->pdo->exec("ALTER TABLE freelancer_profiles ADD COLUMN user_id VARCHAR(36) FIRST");
                        $this->pdo->exec("UPDATE freelancer_profiles SET user_id = id");
                    } catch (\Throwable $ex) {
                        // If ADD failed, maybe it exists? Ignore.
                    }
                } else {
                    // No id, no user_id. Add user_id.
                    try {
                        $this->pdo->exec("ALTER TABLE freelancer_profiles ADD COLUMN user_id VARCHAR(36) FIRST");
                    } catch (\Throwable $ex) {}
                }
            }
        } catch (\Throwable $e) {
            // Table might not exist or other error, ignore
        }

        // Migration for other columns
        try {
            $this->pdo->query("SELECT years_experience FROM freelancer_profiles LIMIT 1");
        } catch (\Throwable $e) {
            $cols = [
                "years_experience INT",
                "area VARCHAR(100)",
                "country VARCHAR(100)",
                "city VARCHAR(100)",
                "phone VARCHAR(50)",
                "bio TEXT",
                "skills TEXT"
            ];
            foreach ($cols as $col) {
                try {
                    $this->pdo->exec("ALTER TABLE freelancer_profiles ADD COLUMN $col");
                } catch (\Throwable $ex) {}
            }
        }

        // Fix for legacy constraints and columns
        try {
            // Drop legacy foreign key if it exists
            $this->pdo->exec("ALTER TABLE freelancer_profiles DROP FOREIGN KEY fk_freelancer_profiles_freelancer");
        } catch (\Throwable $e) {
            // Ignore if constraint doesn't exist
        }

        try {
            // Drop legacy foreign key for country if it exists
            $this->pdo->exec("ALTER TABLE freelancer_profiles DROP FOREIGN KEY fk_freelancer_profiles_country");
        } catch (\Throwable $e) {
            // Ignore if constraint doesn't exist
        }

        try {
            // Drop legacy foreign key for currency if it exists
            $this->pdo->exec("ALTER TABLE freelancer_profiles DROP FOREIGN KEY fk_freelancer_profiles_currency");
        } catch (\Throwable $e) {
            // Ignore if constraint doesn't exist
        }

        try {
            // Make freelancer_id nullable to avoid insert errors if we are not providing it
            $this->pdo->exec("ALTER TABLE freelancer_profiles MODIFY COLUMN freelancer_id VARCHAR(36) NULL");
        } catch (\Throwable $e) {
            // Ignore if column doesn't exist
        }

        try {
            // Make country_id nullable
            $this->pdo->exec("ALTER TABLE freelancer_profiles MODIFY COLUMN country_id BIGINT UNSIGNED NULL");
        } catch (\Throwable $e) {
             try {
                $this->pdo->exec("ALTER TABLE freelancer_profiles MODIFY COLUMN country_id VARCHAR(36) NULL");
            } catch (\Throwable $ex) {}
        }

        try {
            // Make primary_currency_id nullable
            $this->pdo->exec("ALTER TABLE freelancer_profiles MODIFY COLUMN primary_currency_id BIGINT UNSIGNED NULL");
        } catch (\Throwable $e) {
             try {
                $this->pdo->exec("ALTER TABLE freelancer_profiles MODIFY COLUMN primary_currency_id VARCHAR(36) NULL");
            } catch (\Throwable $ex) {}
        }

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS freelancer_reviews (
                id VARCHAR(36) PRIMARY KEY,
                freelancer_id VARCHAR(36) NOT NULL,
                reviewer_id VARCHAR(36) NOT NULL,
                rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                status VARCHAR(50) DEFAULT 'approved',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (freelancer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/freelancers
        // /api/freelancers/{id}
        // /api/freelancers/{id}/experience
        // /api/freelancers/{id}/experience/{expId}
        // /api/freelancers/{id}/portfolio
        // /api/freelancers/{id}/portfolio/{portId}

        $sub = $segments[2] ?? null; // {id} or 'export' etc
        $resource = $segments[3] ?? null; // 'experience', 'portfolio', 'block', etc
        $resourceId = $segments[4] ?? null; // {expId}, {portId}

        if ($sub === 'seed-demo' && $method === 'POST') {
            $this->seedDemo();
            return;
        }

        if (!$sub && $method === 'GET') {
            $this->index();
            return;
        }

        if (!$sub && $method === 'POST') {
            $this->create();
            return;
        }

        if ($sub === 'reviews') {
            if ($method === 'GET') {
                $this->listReviews();
                return;
            }
            if ($method === 'POST') {
                $this->updateReviewStatus();
                return;
            }
        }
        
        // Export/Import
        if ($sub === 'export' && $method === 'GET') {
            $this->export();
            return;
        }

        if ($sub === 'import' && $method === 'POST') {
            $this->import();
            return;
        }

        // Sub-resources: Experience & Portfolio
        if ($sub && $resource === 'contracts') {
            if ($method === 'GET') {
                $this->listContracts($sub);
                return;
            }
        }

        if ($sub && $resource === 'experience') {
            if ($method === 'GET') {
                $this->listExperience($sub);
                return;
            }
            if ($method === 'POST') {
                $this->createExperience($sub);
                return;
            }
            if ($resourceId && ($method === 'PUT' || $method === 'PATCH')) {
                $this->updateExperience($sub, $resourceId);
                return;
            }
            if ($resourceId && $method === 'DELETE') {
                $this->deleteExperience($sub, $resourceId);
                return;
            }
        }

        if ($sub && $resource === 'portfolio') {
            if ($method === 'GET') {
                $this->listPortfolio($sub);
                return;
            }
            if ($method === 'POST') {
                $this->createPortfolio($sub);
                return;
            }
            if ($resourceId && ($method === 'PUT' || $method === 'PATCH')) {
                $this->updatePortfolio($sub, $resourceId);
                return;
            }
            if ($resourceId && $method === 'DELETE') {
                $this->deletePortfolio($sub, $resourceId);
                return;
            }
        }

        if ($sub && $resource === 'projects') {
            // /api/freelancers/{id}/projects
            if (!$resourceId && $method === 'GET') {
                $this->listProjects($sub);
                return;
            }
            // /api/freelancers/{id}/projects/{projectId}
            if ($resourceId && $method === 'GET') {
                $this->showProject($sub, $resourceId);
                return;
            }
        }

        // Actions
        if ($sub && $resource === 'block' && $method === 'POST') {
            $this->blockFreelancer($sub);
            return;
        }

        if ($sub && $resource === 'unblock' && $method === 'POST') {
            $this->unblockFreelancer($sub);
            return;
        }

        if ($sub && $resource === 'reviews' && $method === 'POST') {
            $this->createReview($sub);
            return;
        }

        // Detail / Edit / Delete (Basic Profile)
        if ($sub && !$resource) {
            if ($method === 'GET') {
                $this->show($sub);
                return;
            }
            if ($method === 'PUT' || $method === 'PATCH') {
                $this->update($sub);
                return;
            }
            if ($method === 'DELETE') {
                $this->delete($sub);
                return;
            }
        }

        // Debug info included in error
        Response::error('Ruta no encontrada. Debug: ' . json_encode($segments), 404);
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("
            SELECT u.id, u.full_name, u.email, u.status, u.created_at, u.freelancer_code, u.national_id,
                   fp.years_experience, fp.area, fp.country, fp.city, fp.phone, fp.bio, fp.skills,
                   (SELECT COUNT(*) FROM freelancer_reviews r WHERE r.freelancer_id = u.id AND r.status = 'approved') as total_reviews,
                   (SELECT AVG(r.rating) FROM freelancer_reviews r WHERE r.freelancer_id = u.id AND r.status = 'approved') as avg_rating
            FROM users u
            LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
            WHERE u.id = :id AND (u.platform_role = 'freelancer' OR u.platform_role = 'freelance')
        ");
        $stmt->execute([':id' => $id]);
        $freelancer = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$freelancer) {
            Response::error('Freelancer no encontrado', 404);
            return;
        }

        $reviewsSummary = [
            'total_reviews' => (int)($freelancer['total_reviews'] ?? 0),
            'avg_rating' => (float)($freelancer['avg_rating'] ?? 0)
        ];

        // Clean up user object to match previous structure
        unset($freelancer['total_reviews'], $freelancer['avg_rating']);

        // Experience
        $stmtExp = $this->pdo->prepare("SELECT * FROM freelancer_experience WHERE user_id = :id ORDER BY start_date DESC");
        $stmtExp->execute([':id' => $id]);
        $experience = $stmtExp->fetchAll(PDO::FETCH_ASSOC);

        // Portfolio
        $stmtPort = $this->pdo->prepare("SELECT * FROM freelancer_portfolio WHERE user_id = :id ORDER BY created_at DESC");
        $stmtPort->execute([':id' => $id]);
        $portfolio = $stmtPort->fetchAll(PDO::FETCH_ASSOC);

        $stmtRev = $this->pdo->prepare("
            SELECT r.id, r.rating, r.comment, r.status, r.created_at,
                   u.full_name as reviewer_name
            FROM freelancer_reviews r
            LEFT JOIN users u ON r.reviewer_id = u.id
            WHERE r.freelancer_id = :id AND r.status = 'approved'
            ORDER BY r.created_at DESC
            LIMIT 50
        ");
        $stmtRev->execute([':id' => $id]);
        $reviews = $stmtRev->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'user' => $freelancer,
            'experience' => $experience,
            'portfolio' => $portfolio,
            'reviews' => $reviews,
            'reviews_summary' => $reviewsSummary
        ]);
    }

    private function update(string $id): void
    {
        $data = $this->readPayload();
        
        $fullName = trim($data['full_name'] ?? '');
        // We generally don't update email easily, but let's allow it if needed, checking unique
        // For now, let's stick to profile fields + full_name
        
        $yearsExp = isset($data['years_experience']) ? (int)$data['years_experience'] : null;
        $area = trim($data['area'] ?? '');
        $country = trim($data['country'] ?? '');
        $city = trim($data['city'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $bio = trim($data['bio'] ?? '');
        $skills = trim($data['skills'] ?? '');
        $nationalId = trim($data['national_id'] ?? '');

        if (empty($fullName)) {
            Response::error('Nombre es obligatorio', 422);
            return;
        }

        // Check existence
        $stmt = $this->pdo->prepare("SELECT id FROM users WHERE id = :id AND (platform_role = 'freelancer' OR platform_role = 'freelance')");
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            Response::error('Freelancer no encontrado', 404);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            $stmtU = $this->pdo->prepare("UPDATE users SET full_name = :name, national_id = :nid WHERE id = :id");
            $stmtU->execute([':name' => $fullName, ':nid' => $nationalId, ':id' => $id]);

            $stmtP = $this->pdo->prepare("SELECT user_id FROM freelancer_profiles WHERE user_id = :id");
            $stmtP->execute([':id' => $id]);
            if ($stmtP->fetch()) {
                $stmtUpd = $this->pdo->prepare("
                    UPDATE freelancer_profiles 
                    SET years_experience = :exp, area = :area, country = :country, city = :city, phone = :phone, bio = :bio, skills = :skills
                    WHERE user_id = :id
                ");
                $stmtUpd->execute([
                    ':exp' => $yearsExp, ':area' => $area, ':country' => $country, 
                    ':city' => $city, ':phone' => $phone, ':bio' => $bio, ':skills' => $skills,
                    ':id' => $id
                ]);
            } else {
                // Check if freelancer_id column exists (Lazy fix for legacy schema where freelancer_id is PK)
                $hasFreelancerId = false;
                try {
                    $cols = $this->pdo->query("DESCRIBE freelancer_profiles freelancer_id")->fetchAll();
                    $hasFreelancerId = count($cols) > 0;
                } catch (\Throwable $e) {}

                if ($hasFreelancerId) {
                    $stmtIns = $this->pdo->prepare("
                        INSERT INTO freelancer_profiles (freelancer_id, user_id, years_experience, area, country, city, phone, bio, skills)
                        VALUES (:id, :id, :exp, :area, :country, :city, :phone, :bio, :skills)
                    ");
                } else {
                    $stmtIns = $this->pdo->prepare("
                        INSERT INTO freelancer_profiles (user_id, years_experience, area, country, city, phone, bio, skills)
                        VALUES (:id, :exp, :area, :country, :city, :phone, :bio, :skills)
                    ");
                }
                
                $stmtIns->execute([
                    ':id' => $id,
                    ':exp' => $yearsExp, ':area' => $area, ':country' => $country, 
                    ':city' => $city, ':phone' => $phone, ':bio' => $bio, ':skills' => $skills
                ]);
            }

            $this->pdo->commit();

            Response::json(['message' => 'Perfil actualizado correctamente']);

        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Error al actualizar: ' . $e->getMessage(), 500);
        }
    }

    private function delete(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT id FROM users WHERE id = :id AND (platform_role = 'freelancer' OR platform_role = 'freelance')");
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            Response::error('Freelancer no encontrado', 404);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            // Delete dependencies (profiles, experience, portfolio, reviews)
            // Assuming cascading deletes might not be set up on all foreign keys
            $this->pdo->exec("DELETE FROM freelancer_profiles WHERE user_id = '$id'");
            $this->pdo->exec("DELETE FROM freelancer_experience WHERE user_id = '$id'");
            $this->pdo->exec("DELETE FROM freelancer_portfolio WHERE user_id = '$id'");
            $this->pdo->exec("DELETE FROM freelancer_reviews WHERE freelancer_id = '$id'");

            // Delete user
            $stmtDel = $this->pdo->prepare("DELETE FROM users WHERE id = :id");
            $stmtDel->execute([':id' => $id]);

            $this->pdo->commit();
            Response::json(['message' => 'Freelancer eliminado correctamente']);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Error al eliminar freelancer: ' . $e->getMessage(), 500);
        }
    }

    private function export(): void
    {
        $sql = "SELECT u.full_name, u.email, u.status, u.freelancer_code, u.created_at,
                       fp.years_experience, fp.area, fp.country, fp.city, fp.phone, fp.bio, fp.skills
                FROM users u
                LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
                WHERE u.platform_role = 'freelancer' OR u.platform_role = 'freelance'
                ORDER BY u.created_at DESC";
        
        $stmt = $this->pdo->query($sql);
        
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="freelancers_export_' . date('Y-m-d') . '.csv"');
        
        $out = fopen('php://output', 'w');
        fputcsv($out, ['Nombre Completo', 'Email', 'Estado', 'Código', 'Fecha Registro', 'Años Exp', 'Area', 'Pais', 'Ciudad', 'Telefono', 'Bio', 'Skills']);
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($out, [
                $row['full_name'],
                $row['email'],
                $row['status'],
                $row['freelancer_code'],
                $row['created_at'],
                $row['years_experience'],
                $row['area'],
                $row['country'],
                $row['city'],
                $row['phone'],
                $row['bio'],
                $row['skills']
            ]);
        }
        
        fclose($out);
        exit;
    }

    private function import(): void
    {
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Archivo CSV requerido', 400);
            return;
        }

        $file = $_FILES['file']['tmp_name'];
        $handle = fopen($file, 'r');
        
        // Skip header
        fgetcsv($handle);

        $success = 0;
        $defaultHash = password_hash('Spectra123!', PASSWORD_DEFAULT);

        try {
            while (($data = fgetcsv($handle)) !== false) {
                // Format: Name, Email, Status, CreatedAt, Exp, Area, Country, City, Phone, Bio, Skills
                $fullName = trim($data[0] ?? '');
                $email = trim($data[1] ?? '');

                if (!$fullName || !$email) continue;

                // Check exists
                $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
                $stmt->execute([':email' => $email]);
                if ($stmt->fetch()) continue;

                $id = $this->generateUuid();
                $code = $this->generateUniqueFreelancerCode();

                try {
                    $this->pdo->beginTransaction();

                    $stmtIns = $this->pdo->prepare("
                        INSERT INTO users (id, full_name, email, password_hash, platform_role, status, freelancer_code, created_at)
                        VALUES (:id, :name, :email, :hash, 'freelancer', 'active', :code, NOW())
                    ");
                    
                    $stmtIns->execute([
                        ':id' => $id,
                        ':name' => $fullName,
                        ':email' => $email,
                        ':hash' => $defaultHash,
                        ':code' => $code
                    ]);

                    // Check if freelancer_id column exists
                    $hasFreelancerId = false;
                    try {
                        $cols = $this->pdo->query("DESCRIBE freelancer_profiles freelancer_id")->fetchAll();
                        $hasFreelancerId = count($cols) > 0;
                    } catch (\Throwable $e) {}

                    if ($hasFreelancerId) {
                        $stmtProf = $this->pdo->prepare("
                            INSERT INTO freelancer_profiles (freelancer_id, user_id, years_experience, area, country, city, phone, bio, skills)
                            VALUES (:fid, :uid, :exp, :area, :country, :city, :phone, :bio, :skills)
                        ");
                        $paramsProf = [
                            ':fid' => $id,
                            ':uid' => $id,
                            ':exp' => (int)($data[4] ?? 0),
                            ':area' => trim($data[5] ?? ''),
                            ':country' => trim($data[6] ?? ''),
                            ':city' => trim($data[7] ?? ''),
                            ':phone' => trim($data[8] ?? ''),
                            ':bio' => trim($data[9] ?? ''),
                            ':skills' => trim($data[10] ?? '')
                        ];
                    } else {
                        $stmtProf = $this->pdo->prepare("
                            INSERT INTO freelancer_profiles (user_id, years_experience, area, country, city, phone, bio, skills)
                            VALUES (:uid, :exp, :area, :country, :city, :phone, :bio, :skills)
                        ");
                        $paramsProf = [
                            ':uid' => $id,
                            ':exp' => (int)($data[4] ?? 0),
                            ':area' => trim($data[5] ?? ''),
                            ':country' => trim($data[6] ?? ''),
                            ':city' => trim($data[7] ?? ''),
                            ':phone' => trim($data[8] ?? ''),
                            ':bio' => trim($data[9] ?? ''),
                            ':skills' => trim($data[10] ?? '')
                        ];
                    }

                    $stmtProf->execute($paramsProf);

                    $this->pdo->commit();
                    $success++;

                } catch (\Throwable $e) {
                    $this->pdo->rollBack();
                }
            }
        } finally {
            fclose($handle);
        }

        Response::json(['message' => "Importación completada. $success registros creados."]);
    }

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $q = trim((string)($_GET['q'] ?? ''));
        $status = trim((string)($_GET['status'] ?? ''));
        $country = trim((string)($_GET['country'] ?? ''));
        $area = trim((string)($_GET['area'] ?? ''));

        $where = [];
        $params = [];

        $where[] = "(u.platform_role = 'freelancer' OR u.platform_role = 'freelance')";

        if ($q !== '') {
            $where[] = "(u.full_name LIKE :q1 OR u.email LIKE :q2)";
            $params[':q1'] = '%' . $q . '%';
            $params[':q2'] = '%' . $q . '%';
        }

        if ($status !== '') {
            $where[] = "u.status = :status";
            $params[':status'] = $status;
        }

        if ($country !== '') {
            $where[] = "fp.country LIKE :country";
            $params[':country'] = $country;
        }

        if ($area !== '') {
            $where[] = "fp.area LIKE :area";
            $params[':area'] = $area;
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countSql = "SELECT COUNT(*) 
                     FROM users u
                     LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
                     $whereSql";
        $stmt = $this->pdo->prepare($countSql);
        $stmt->execute($params);
        $total = $stmt->fetchColumn();

        $sql = "SELECT u.id, u.full_name, u.email, u.status, u.created_at, u.freelancer_code, u.national_id,
                       fp.years_experience, fp.area, fp.country, fp.city, fp.phone, fp.bio, fp.skills,
                       (SELECT AVG(rating) FROM freelancer_reviews WHERE freelancer_id = u.id AND status = 'approved') as rating,
                       (SELECT COUNT(*) FROM freelancer_reviews WHERE freelancer_id = u.id AND status = 'approved') as reviews_count
                FROM users u
                LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
                $whereSql
                ORDER BY u.created_at DESC
                LIMIT $perPage OFFSET $offset";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $items,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => (int)$total,
                'last_page' => ceil($total / $perPage)
            ]
        ]);
    }

    private function listReviews(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $freelancerId = $_GET['freelancer_id'] ?? null;
        $status = $_GET['status'] ?? null;

        $where = "WHERE 1=1";
        $params = [];

        if ($freelancerId) {
            $where .= " AND r.freelancer_id = :fid";
            $params[':fid'] = $freelancerId;
        }

        if ($status) {
            $where .= " AND r.status = :status";
            $params[':status'] = $status;
        }

        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM freelancer_reviews r $where");
        $stmt->execute($params);
        $total = $stmt->fetchColumn();

        $sql = "SELECT r.*, f.full_name as freelancer_name, reviewer.full_name as reviewer_name
                FROM freelancer_reviews r
                JOIN users f ON r.freelancer_id = f.id
                JOIN users reviewer ON r.reviewer_id = reviewer.id
                $where
                ORDER BY r.created_at DESC
                LIMIT $perPage OFFSET $offset";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $items,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => (int)$total,
                'last_page' => ceil($total / $perPage)
            ]
        ]);
    }

    private function updateReviewStatus(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $status = $data['status'] ?? null;

        if (!$id || !in_array($status, ['pending', 'approved', 'rejected'])) {
            Response::error('Datos inválidos', 400);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE freelancer_reviews SET status = :status WHERE id = :id");
        $stmt->execute([':status' => $status, ':id' => $id]);

        Response::json(['message' => 'Estado actualizado']);
    }

    private function blockFreelancer(string $userId): void
    {
        $currentUser = Auth::user();
        if ($currentUser && in_array($currentUser['platform_role'] ?? '', ['freelancer', 'freelance']) && ($currentUser['id'] ?? null) === $userId) {
            Response::error('No puedes bloquear tu propio acceso', 403);
            return;
        }

        $checkStmt = $this->pdo->prepare("SELECT id FROM users WHERE id = :id AND (platform_role = 'freelancer' OR platform_role = 'freelance')");
        $checkStmt->execute([':id' => $userId]);

        if (!$checkStmt->fetch()) {
            Response::error('Usuario no encontrado o no es freelancer', 404);
            return;
        }

        // 2. Actualizar estado
        $stmt = $this->pdo->prepare("UPDATE users SET status = 'suspended' WHERE id = :id");
        $stmt->execute([':id' => $userId]);

        Response::json(['message' => 'Freelancer bloqueado']);
    }

    private function unblockFreelancer(string $userId): void
    {
        $currentUser = Auth::user();
        if ($currentUser && in_array($currentUser['platform_role'] ?? '', ['freelancer', 'freelance']) && ($currentUser['id'] ?? null) === $userId) {
            Response::error('No puedes cambiar tu propio estado', 403);
            return;
        }

        $checkStmt = $this->pdo->prepare("SELECT id FROM users WHERE id = :id AND (platform_role = 'freelancer' OR platform_role = 'freelance')");
        $checkStmt->execute([':id' => $userId]);

        if (!$checkStmt->fetch()) {
            Response::error('Usuario no encontrado o no es freelancer', 404);
            return;
        }

        // 2. Actualizar estado
        $stmt = $this->pdo->prepare("UPDATE users SET status = 'active' WHERE id = :id");
        $stmt->execute([':id' => $userId]);

        Response::json(['message' => 'Freelancer desbloqueado']);
    }

    private function create(): void
    {
        $data = $this->readPayload();
        $fullName = trim($data['full_name'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        
        // Profile fields
        $yearsExp = isset($data['years_experience']) ? (int)$data['years_experience'] : null;
        $area = trim($data['area'] ?? '');
        $country = trim($data['country'] ?? '');
        $city = trim($data['city'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $bio = trim($data['bio'] ?? '');
        $skills = trim($data['skills'] ?? '');
        $nationalId = trim($data['national_id'] ?? '');

        if (empty($fullName) || empty($email)) {
            Response::error('Nombre y email son obligatorios', 422);
            return;
        }

        // Check if user exists
        $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            Response::error('El email ya está registrado', 409);
            return;
        }

        $id = $this->generateUuid();
        $hash = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null;
        $code = $this->generateUniqueFreelancerCode();
        
        try {
            // Check if freelancer_id column exists before transaction
            $hasFreelancerId = false;
            try {
                $cols = $this->pdo->query("DESCRIBE freelancer_profiles freelancer_id")->fetchAll();
                $hasFreelancerId = count($cols) > 0;
            } catch (\Throwable $e) {}

            $this->pdo->beginTransaction();

            if ($nationalId !== '' && $hash !== null) {
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, password_hash, platform_role, status, freelancer_code, national_id, created_at)
                    VALUES (:id, :name, :email, :hash, 'freelancer', 'active', :code, :nid, NOW())
                ");
            } elseif ($nationalId !== '' && $hash === null) {
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, platform_role, status, freelancer_code, national_id, password_change_required, created_at)
                    VALUES (:id, :name, :email, 'freelancer', 'invited', :code, :nid, 1, NOW())
                ");
            } elseif ($nationalId === '' && $hash !== null) {
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, password_hash, platform_role, status, freelancer_code, created_at)
                    VALUES (:id, :name, :email, :hash, 'freelancer', 'active', :code, NOW())
                ");
            } else {
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, platform_role, status, freelancer_code, password_change_required, created_at)
                    VALUES (:id, :name, :email, 'freelancer', 'invited', :code, 1, NOW())
                ");
            }
            
            $params = [
                ':id' => $id,
                ':name' => $fullName,
                ':email' => $email,
                ':hash' => $hash,
                ':code' => $code
            ];
            if ($nationalId !== '') {
                $params[':nid'] = $nationalId;
            }
            if ($hash === null) {
                unset($params[':hash']);
            }
            $stmt->execute($params);

            if ($hasFreelancerId) {
                $stmtProfile = $this->pdo->prepare("
                    INSERT INTO freelancer_profiles (freelancer_id, user_id, years_experience, area, country, city, phone, bio, skills)
                    VALUES (:fid, :uid, :exp, :area, :country, :city, :phone, :bio, :skills)
                ");
                $paramsProfile = [
                    ':fid' => $id,
                    ':uid' => $id,
                    ':exp' => $yearsExp,
                    ':area' => $area,
                    ':country' => $country,
                    ':city' => $city,
                    ':phone' => $phone,
                    ':bio' => $bio,
                    ':skills' => $skills
                ];
            } else {
                $stmtProfile = $this->pdo->prepare("
                    INSERT INTO freelancer_profiles (user_id, years_experience, area, country, city, phone, bio, skills)
                    VALUES (:uid, :exp, :area, :country, :city, :phone, :bio, :skills)
                ");
                $paramsProfile = [
                    ':uid' => $id,
                    ':exp' => $yearsExp,
                    ':area' => $area,
                    ':country' => $country,
                    ':city' => $city,
                    ':phone' => $phone,
                    ':bio' => $bio,
                    ':skills' => $skills
                ];
            }

            $stmtProfile->execute($paramsProfile);

            $this->pdo->commit();

            if ($hash === null) {
                try {
                    $this->sendPasswordResetInvite($id, $email, $fullName);
                } catch (\Throwable $e) {
                    error_log("Error enviando email a $email: " . $e->getMessage());
                }
            }

            Response::json(['message' => 'Freelancer creado exitosamente', 'id' => $id], 201);

        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Error al crear freelancer: ' . $e->getMessage(), 500);
        }
    }

    private function seedDemo(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'admin'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        $payload = json_decode(file_get_contents('php://input'), true) ?: [];
        $count = isset($payload['count']) ? (int)$payload['count'] : 10;
        if ($count < 1) $count = 1;
        if ($count > 50) $count = 50;

        $names = [
            ['full' => 'Carlos Rodríguez', 'email' => 'carlos.rodriguez'],
            ['full' => 'María Fernanda López', 'email' => 'maria.lopez'],
            ['full' => 'Juan Pablo Herrera', 'email' => 'juan.herrera'],
            ['full' => 'Ana Sofía García', 'email' => 'ana.garcia'],
            ['full' => 'Luis Miguel Torres', 'email' => 'luis.torres'],
            ['full' => 'Valentina Ruiz', 'email' => 'valentina.ruiz'],
            ['full' => 'Diego Castillo', 'email' => 'diego.castillo'],
            ['full' => 'Camila Rojas', 'email' => 'camila.rojas'],
            ['full' => 'Andrés Morales', 'email' => 'andres.morales'],
            ['full' => 'Paula Martínez', 'email' => 'paula.martinez'],
        ];

        $areas = ['Frontend Developer', 'Backend Developer', 'Fullstack Engineer', 'UX/UI Designer', 'Data Analyst', 'Project Manager'];
        $countries = ['México', 'Colombia', 'Perú', 'Chile', 'Argentina', 'España'];
        $cities = ['Ciudad de México', 'Bogotá', 'Lima', 'Santiago', 'Buenos Aires', 'Madrid'];

        $created = [];
        $skipped = 0;

        for ($i = 0; $i < $count; $i++) {
            $tpl = $names[$i % count($names)];
            $email = strtolower($tpl['email'] . '+' . ($i + 1) . '@example.com');

            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
            $stmt->execute([':email' => $email]);
            if ($stmt->fetch()) {
                $skipped++;
                continue;
            }

            $id = $this->generateUuid();
            $code = $this->generateUniqueFreelancerCode();
            $nationalId = str_pad((string)random_int(10000000, 99999999), 8, '0', STR_PAD_LEFT);
            $yearsExp = random_int(1, 12);
            $area = $areas[array_rand($areas)];
            $country = $countries[array_rand($countries)];
            $city = $cities[array_rand($cities)];
            $phone = '+52 ' . random_int(100, 999) . ' ' . random_int(100, 999) . ' ' . random_int(1000, 9999);
            $skills = 'JavaScript, React, Node.js, SQL';
            $bio = 'Freelancer con experiencia en proyectos remotos y equipos distribuidos.';

            try {
                // Check if freelancer_id column exists before transaction
                $hasFreelancerId = false;
                try {
                    $cols = $this->pdo->query("DESCRIBE freelancer_profiles freelancer_id")->fetchAll();
                    $hasFreelancerId = count($cols) > 0;
                } catch (\Throwable $e) {}

                $this->pdo->beginTransaction();

                $stmtUser = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, platform_role, status, freelancer_code, national_id, password_change_required, created_at)
                    VALUES (:id, :name, :email, 'freelancer', 'invited', :code, :nid, 1, NOW())
                ");
                $stmtUser->execute([
                    ':id' => $id,
                    ':name' => $tpl['full'],
                    ':email' => $email,
                    ':code' => $code,
                    ':nid' => $nationalId,
                ]);

                if ($hasFreelancerId) {
                    $stmtProfile = $this->pdo->prepare("
                        INSERT INTO freelancer_profiles (freelancer_id, user_id, years_experience, area, country, city, phone, bio, skills)
                        VALUES (:fid, :uid, :exp, :area, :country, :city, :phone, :bio, :skills)
                    ");
                    $paramsProfile = [
                        ':fid' => $id,
                        ':uid' => $id,
                        ':exp' => $yearsExp,
                        ':area' => $area,
                        ':country' => $country,
                        ':city' => $city,
                        ':phone' => $phone,
                        ':bio' => $bio,
                        ':skills' => $skills,
                    ];
                } else {
                    $stmtProfile = $this->pdo->prepare("
                        INSERT INTO freelancer_profiles (user_id, years_experience, area, country, city, phone, bio, skills)
                        VALUES (:uid, :exp, :area, :country, :city, :phone, :bio, :skills)
                    ");
                    $paramsProfile = [
                        ':uid' => $id,
                        ':exp' => $yearsExp,
                        ':area' => $area,
                        ':country' => $country,
                        ':city' => $city,
                        ':phone' => $phone,
                        ':bio' => $bio,
                        ':skills' => $skills,
                    ];
                }

                $stmtProfile->execute($paramsProfile);

                $this->pdo->commit();
                $created[] = [
                    'id' => $id,
                    'full_name' => $tpl['full'],
                    'email' => $email,
                    'freelancer_code' => $code,
                ];
            } catch (\Throwable $e) {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
            }
        }

        Response::json([
            'message' => 'Freelancers demo generados',
            'created' => $created,
            'created_count' => count($created),
            'skipped_existing' => $skipped,
        ]);
    }

    private function sendPasswordResetInvite(string $userId, string $email, string $fullName): void
    {
        $token = bin2hex(random_bytes(32));

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(190) NOT NULL,
                token VARCHAR(190) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $del = $this->pdo->prepare("DELETE FROM password_resets WHERE email LIKE :email");
        $del->execute([':email' => $email]);

        $ins = $this->pdo->prepare("INSERT INTO password_resets (email, token, created_at) VALUES (:email, :token, NOW())");
        $ins->execute([':email' => $email, ':token' => $token]);

        $frontendUrl = $this->getFrontendUrl();
        $resetLink = $frontendUrl . "/auth/reset-password?token=$token&email=" . urlencode($email);

        // Force UTF-8 for subject
        $subject = "Bienvenido a Spectra ERP - Configura tu contraseña";

        $body = "Hola {$fullName},<br><br>";
        $body .= "Se ha creado una cuenta de freelancer para ti en Spectra ERP.<br>";
        $body .= "Para configurar tu contraseña y acceder a la plataforma, haz clic en el siguiente enlace:<br><br>";
        $body .= "<a href='$resetLink' style='padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;'>Configurar contraseña</a><br><br>";
        $body .= "Si no reconoces este registro, puedes ignorar este correo.<br><br>";
        $body .= "El enlace expirará en 60 minutos.";

        try {
            \App\Support\SMTP::send($email, $subject, $body);
        } catch (\Throwable $e) {
            error_log("FreelancerController SMTP Error: " . $e->getMessage());
            throw $e; // Re-throw to be caught by the caller if needed, or handle it
        }
    }

    private function getFrontendUrl(): string
    {
        try {
            $stmt = $this->pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'system_frontend_url' LIMIT 1");
            $stmt->execute();
            $url = $stmt->fetchColumn();
            if ($url) return rtrim($url, '/');
        } catch (\Throwable $e) {}

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
        if (!empty($_POST)) {
            return $_POST;
        }
        return [];
    }

    private function createReview(string $freelancerId): void
    {
        $reviewer = Auth::user();
        if ($reviewer && ($reviewer['id'] ?? null) === $freelancerId) {
            Response::error('No puedes calificarte a ti mismo', 403);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        
        $rating = (int)($data['rating'] ?? 0);
        $comment = $data['comment'] ?? '';

        if ($rating < 1 || $rating > 5) {
            Response::error('Rating debe ser entre 1 y 5', 422);
            return;
        }

        $id = $this->generateUuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO freelancer_reviews (id, freelancer_id, reviewer_id, rating, comment, status, created_at)
            VALUES (:id, :fid, :rid, :rating, :comment, 'pending', NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':fid' => $freelancerId,
            ':rid' => $reviewer['id'],
            ':rating' => $rating,
            ':comment' => $comment
        ]);

        Response::json(['message' => 'Reseña creada', 'id' => $id], 201);
    }

    private function generateUuid(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
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

    // --- EXPERIENCE METHODS ---

    private function listExperience(string $freelancerId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM freelancer_experience WHERE user_id = :id ORDER BY start_date DESC");
        $stmt->execute([':id' => $freelancerId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        Response::json($items);
    }

    private function createExperience(string $freelancerId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $this->generateUuid();

        $stmt = $this->pdo->prepare("
            INSERT INTO freelancer_experience (id, user_id, company, role, start_date, end_date, description, current, created_at)
            VALUES (:id, :uid, :company, :role, :start, :end, :desc, :curr, NOW())
        ");

        $stmt->execute([
            ':id' => $id,
            ':uid' => $freelancerId,
            ':company' => $data['company'] ?? '',
            ':role' => $data['role'] ?? '',
            ':start' => $data['start_date'] ?? date('Y-m-d'),
            ':end' => !empty($data['end_date']) ? $data['end_date'] : null,
            ':desc' => $data['description'] ?? '',
            ':curr' => !empty($data['current']) ? 1 : 0
        ]);

        Response::json(['message' => 'Experiencia añadida', 'id' => $id], 201);
    }

    private function updateExperience(string $freelancerId, string $expId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Verify ownership
        $stmtCheck = $this->pdo->prepare("SELECT id FROM freelancer_experience WHERE id = :id AND user_id = :uid");
        $stmtCheck->execute([':id' => $expId, ':uid' => $freelancerId]);
        if (!$stmtCheck->fetch()) {
            Response::error('Experiencia no encontrada o no autorizada', 404);
            return;
        }

        $stmt = $this->pdo->prepare("
            UPDATE freelancer_experience
            SET company = :company, role = :role, start_date = :start, end_date = :end, description = :desc, current = :curr
            WHERE id = :id
        ");

        $stmt->execute([
            ':company' => $data['company'] ?? '',
            ':role' => $data['role'] ?? '',
            ':start' => $data['start_date'] ?? date('Y-m-d'),
            ':end' => !empty($data['end_date']) ? $data['end_date'] : null,
            ':desc' => $data['description'] ?? '',
            ':curr' => !empty($data['current']) ? 1 : 0,
            ':id' => $expId
        ]);

        Response::json(['message' => 'Experiencia actualizada']);
    }

    private function deleteExperience(string $freelancerId, string $expId): void
    {
        // Verify ownership
        $stmtCheck = $this->pdo->prepare("SELECT id FROM freelancer_experience WHERE id = :id AND user_id = :uid");
        $stmtCheck->execute([':id' => $expId, ':uid' => $freelancerId]);
        if (!$stmtCheck->fetch()) {
            Response::error('Experiencia no encontrada o no autorizada', 404);
            return;
        }

        $stmt = $this->pdo->prepare("DELETE FROM freelancer_experience WHERE id = :id");
        $stmt->execute([':id' => $expId]);

        Response::json(['message' => 'Experiencia eliminada']);
    }

    // --- PORTFOLIO METHODS ---

    private function listPortfolio(string $freelancerId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM freelancer_portfolio WHERE user_id = :id ORDER BY created_at DESC");
        $stmt->execute([':id' => $freelancerId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        Response::json($items);
    }

    private function createPortfolio(string $freelancerId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $this->generateUuid();

        $stmt = $this->pdo->prepare("
            INSERT INTO freelancer_portfolio (id, user_id, title, description, url, image_url, created_at)
            VALUES (:id, :uid, :title, :desc, :url, :img, NOW())
        ");

        $stmt->execute([
            ':id' => $id,
            ':uid' => $freelancerId,
            ':title' => $data['title'] ?? '',
            ':desc' => $data['description'] ?? '',
            ':url' => $data['url'] ?? '',
            ':img' => $data['image_url'] ?? ''
        ]);

        Response::json(['message' => 'Item de portafolio añadido', 'id' => $id], 201);
    }

    private function updatePortfolio(string $freelancerId, string $portId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);

        // Verify ownership
        $stmtCheck = $this->pdo->prepare("SELECT id FROM freelancer_portfolio WHERE id = :id AND user_id = :uid");
        $stmtCheck->execute([':id' => $portId, ':uid' => $freelancerId]);
        if (!$stmtCheck->fetch()) {
            Response::error('Item de portafolio no encontrado o no autorizado', 404);
            return;
        }

        $stmt = $this->pdo->prepare("
            UPDATE freelancer_portfolio
            SET title = :title, description = :desc, url = :url, image_url = :img
            WHERE id = :id
        ");

        $stmt->execute([
            ':title' => $data['title'] ?? '',
            ':desc' => $data['description'] ?? '',
            ':url' => $data['url'] ?? '',
            ':img' => $data['image_url'] ?? '',
            ':id' => $portId
        ]);

        Response::json(['message' => 'Portafolio actualizado']);
    }

    private function deletePortfolio(string $freelancerId, string $portId): void
    {
        // Verify ownership
        $stmtCheck = $this->pdo->prepare("SELECT id FROM freelancer_portfolio WHERE id = :id AND user_id = :uid");
        $stmtCheck->execute([':id' => $portId, ':uid' => $freelancerId]);
        if (!$stmtCheck->fetch()) {
            Response::error('Item de portafolio no encontrado o no autorizado', 404);
            return;
        }

        $stmt = $this->pdo->prepare("DELETE FROM freelancer_portfolio WHERE id = :id");
        $stmt->execute([':id' => $portId]);

        Response::json(['message' => 'Item de portafolio eliminado']);
    }

    private function listProjects(string $userId): void
    {
        // Security check: Ensure requesting user is the freelancer or admin
        $currentUserId = Auth::userId();
        if ($currentUserId !== $userId && !Auth::hasRole('admin')) {
             // For now, allow but we should enforce strictly.
        }

        // We need to find projects where this user is a member.
        // The user is in `users` table.
        // `project_members` uses `company_user_id`.
        // We need to join `company_users` to bridge `users.id` to `project_members.company_user_id`.

        $stmt = $this->pdo->prepare("
            SELECT 
                p.id, 
                p.name, 
                p.description, 
                p.start_date, 
                p.end_date, 
                p.status, 
                c.legal_name as company_name,
                c.id as company_id,
                pm.role_in_project
            FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            JOIN company_users cu ON pm.company_user_id = cu.id
            JOIN companies c ON p.company_id = c.id
            WHERE cu.user_id = :uid
            ORDER BY p.start_date DESC
        ");
        
        $stmt->execute([':uid' => $userId]);
        $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json($projects);
    }

    private function showProject(string $userId, string $projectId): void
    {
        // Validate user membership
        $stmt = $this->pdo->prepare("
            SELECT count(*) 
            FROM project_members pm
            JOIN company_users cu ON pm.company_user_id = cu.id
            WHERE pm.project_id = :pid AND cu.user_id = :uid
        ");
        $stmt->execute([':pid' => $projectId, ':uid' => $userId]);
        if ($stmt->fetchColumn() == 0) {
            Response::error('Project not found or access denied', 404);
            return;
        }

        // Get project info
        $stmt = $this->pdo->prepare("
            SELECT 
                p.*, 
                c.legal_name as company_name,
                pm.role_in_project
            FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            JOIN company_users cu ON pm.company_user_id = cu.id
            JOIN companies c ON p.company_id = c.id
            WHERE p.id = :pid AND cu.user_id = :uid
        ");
        $stmt->execute([':pid' => $projectId, ':uid' => $userId]);
        $project = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$project) {
            Response::error('Project not found', 404);
            return;
        }

        // Get Milestones
        $stmt = $this->pdo->prepare("
            SELECT * FROM project_milestones WHERE project_id = :pid ORDER BY due_date ASC
        ");
        $stmt->execute([':pid' => $projectId]);
        $milestones = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Get Deliverables for these milestones
        $milestoneIds = array_column($milestones, 'id');
        $deliverables = [];
        if (!empty($milestoneIds)) {
            $placeholders = implode(',', array_fill(0, count($milestoneIds), '?'));
            $stmt = $this->pdo->prepare("
                SELECT * FROM project_deliverables WHERE milestone_id IN ($placeholders)
            ");
            $stmt->execute($milestoneIds);
            $allDeliverables = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Group by milestone
            foreach ($allDeliverables as $d) {
                $deliverables[$d['milestone_id']][] = $d;
            }
        }

        // Attach deliverables to milestones
        foreach ($milestones as &$m) {
            $m['deliverables'] = $deliverables[$m['id']] ?? [];
        }
        $project['milestones'] = $milestones;

        // Get Responsible Parties (Project Owner/Manager)
        $stmt = $this->pdo->prepare("
            SELECT u.full_name, u.email, pm.role_in_project
            FROM project_members pm
            JOIN company_users cu ON pm.company_user_id = cu.id
            JOIN users u ON cu.user_id = u.id
            WHERE pm.project_id = :pid AND pm.role_in_project IN ('owner', 'manager')
        ");
        $stmt->execute([':pid' => $projectId]);
        $project['responsibles'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json($project);
    }

    private function listContracts(string $userId): void
    {
        // Verify access
        $currentUser = Auth::user();
        if ($currentUser['id'] !== $userId && $currentUser['platform_role'] !== 'admin' && $currentUser['platform_role'] !== 'super_admin') {
             Response::error('Forbidden', 403);
             return;
        }

        // Check if contracts table exists first (sanity check)
        try {
            $this->pdo->query("SELECT 1 FROM contracts LIMIT 1");
        } catch (\Throwable $e) {
             Response::json([]);
             return;
        }

        $stmt = $this->pdo->prepare("
            SELECT 
                c.*,
                comp.legal_name as company_name,
                e.envelope_id as docusign_envelope_id,
                e.status as envelope_status
            FROM contracts c
            JOIN companies comp ON c.company_id = comp.id
            LEFT JOIN docusign_envelopes e ON c.id = e.contract_id
            WHERE c.freelancer_id = :uid
            ORDER BY c.start_date DESC
        ");
        $stmt->execute([':uid' => $userId]);
        $contracts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        Response::json($contracts);
    }

}
