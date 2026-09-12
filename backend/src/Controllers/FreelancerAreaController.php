<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class FreelancerAreaController
{
    private PDO $pdo;
    private array $jwtConfig;

    public function __construct(Database $database, array $jwtConfig)
    {
        $this->pdo = $database->pdo();
        $this->jwtConfig = $jwtConfig;
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS freelancer_areas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function index(): void
    {
        Auth::require($this->pdo, $this->jwtConfig);

        $stmt = $this->pdo->query("SELECT * FROM freelancer_areas ORDER BY name ASC");
        $areas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json($areas);
    }

    public function store(): void
    {
        Auth::require($this->pdo, $this->jwtConfig);
        
        // Check permissions (only admins or specific roles should manage areas?)
        // For now, let's assume any authenticated user with access to freelancers can add areas, 
        // or restrict to admin. Let's start open for authenticated users for simplicity as per request.

        $data = json_decode(file_get_contents('php://input'), true);
        $name = trim($data['name'] ?? '');

        if (!$name) {
            Response::error('El nombre del área es requerido', 400);
            return;
        }

        try {
            $stmt = $this->pdo->prepare("INSERT INTO freelancer_areas (name) VALUES (:name)");
            $stmt->execute([':name' => $name]);
            
            $id = $this->pdo->lastInsertId();
            Response::json(['id' => $id, 'name' => $name, 'message' => 'Área creada correctamente']);
        } catch (\PDOException $e) {
            if ($e->getCode() == 23000) {
                Response::error('El área ya existe', 409);
            } else {
                Response::error('Error al crear área: ' . $e->getMessage(), 500);
            }
        }
    }

    public function update(string $id): void
    {
        Auth::require($this->pdo, $this->jwtConfig);

        $data = json_decode(file_get_contents('php://input'), true);
        $name = trim($data['name'] ?? '');

        if (!$name) {
            Response::error('El nombre del área es requerido', 400);
            return;
        }

        try {
            $stmt = $this->pdo->prepare("UPDATE freelancer_areas SET name = :name WHERE id = :id");
            $stmt->execute([':name' => $name, ':id' => $id]);
            
            if ($stmt->rowCount() === 0) {
                // Check if it exists
                $check = $this->pdo->prepare("SELECT id FROM freelancer_areas WHERE id = :id");
                $check->execute([':id' => $id]);
                if (!$check->fetch()) {
                    Response::error('Área no encontrada', 404);
                    return;
                }
            }

            Response::json(['id' => $id, 'name' => $name, 'message' => 'Área actualizada correctamente']);
        } catch (\PDOException $e) {
             if ($e->getCode() == 23000) {
                Response::error('El nombre de área ya está en uso', 409);
            } else {
                Response::error('Error al actualizar área: ' . $e->getMessage(), 500);
            }
        }
    }

    public function destroy(string $id): void
    {
        Auth::require($this->pdo, $this->jwtConfig);

        try {
            $stmt = $this->pdo->prepare("DELETE FROM freelancer_areas WHERE id = :id");
            $stmt->execute([':id' => $id]);
            
            if ($stmt->rowCount() === 0) {
                Response::error('Área no encontrada', 404);
                return;
            }

            Response::json(['message' => 'Área eliminada correctamente']);
        } catch (\Throwable $e) {
            Response::error('Error al eliminar área: ' . $e->getMessage(), 500);
        }
    }
}
