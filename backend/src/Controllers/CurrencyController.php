<?php

namespace App\Controllers;

use App\Database;
use App\Support\Cache;
use App\Support\Response;
use PDO;
use Throwable;

final class CurrencyController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
    }

    public function handle(array $segments, string $method): void
    {
        try {
            // /api/currencies/{id}
            $id = $segments[2] ?? null;

            if ($id === null || $id === '') {
                if ($method === 'GET') { $this->index(); return; }
                if ($method === 'POST') { $this->store(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($method === 'GET') { $this->show((int)$id); return; }
            if ($method === 'PUT' || $method === 'PATCH') { $this->update((int)$id); return; }
            if ($method === 'DELETE') { $this->destroy((int)$id); return; }

            Response::error('Método no permitido', 405);
        } catch (Throwable $e) {
            Response::error('Error interno', 500, ['message' => $e->getMessage()]);
        }
    }

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));

        $where = [];
        $params = [];

        if ($q === '') {
            $records = Cache::remember('ref:currencies', 3600, function (): array {
                $stmt = $this->pdo->query("SELECT id, code, name, symbol FROM currencies ORDER BY code ASC");
                return $stmt->fetchAll() ?: [];
            });

            $total = count($records);
            $offset = ($page - 1) * $perPage;
            $items = array_values(array_slice($records, $offset, $perPage));

            Response::json([
                'data' => $items,
                'meta' => [
                    'page' => $page,
                    'per_page' => $perPage,
                    'total' => $total,
                    'total_pages' => max(1, (int)ceil($total / max(1, $perPage))),
                ],
            ]);
            return;
        }

        $where[] = '(code LIKE :q OR name LIKE :q OR symbol LIKE :q)';
        $params[':q'] = "%$q%";

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM currencies {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;

        $stmt = $this->pdo->prepare("SELECT id, code, name, symbol FROM currencies {$whereSql} ORDER BY code ASC LIMIT :l OFFSET :o");
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':l', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':o', $offset, PDO::PARAM_INT);
        $stmt->execute();

        Response::json([
            'data' => $stmt->fetchAll() ?: [],
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / max(1, $perPage))),
            ],
        ]);
    }

    private function show(int $id): void
    {
        $stmt = $this->pdo->prepare("SELECT id, code, name, symbol FROM currencies WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            Response::error('Moneda no encontrada', 404);
            return;
        }

        Response::json(['data' => $row]);
    }

    private function store(): void
    {
        $payload = $this->readPayload();

        $code = strtoupper(trim((string)($payload['code'] ?? '')));
        $name = trim((string)($payload['name'] ?? ''));
        $symbol = trim((string)($payload['symbol'] ?? ''));

        if ($code === '' || $name === '' || $symbol === '') {
            Response::error('code, name y symbol son requeridos', 422);
            return;
        }

        if (strlen($code) < 2 || strlen($code) > 10) {
            Response::error('code inválido (2 a 10 caracteres)', 422);
            return;
        }

        if ($this->existsByCode($code)) {
            Response::error('Ya existe una moneda con ese code', 409);
            return;
        }

        $stmt = $this->pdo->prepare("INSERT INTO currencies (code, name, symbol) VALUES (:code, :name, :symbol)");
        $stmt->execute([':code' => $code, ':name' => $name, ':symbol' => $symbol]);

        Cache::delete('ref:currencies');

        Response::json(['message' => 'Moneda creada', 'data' => ['id' => (int)$this->pdo->lastInsertId()]], 201);
    }

    private function update(int $id): void
    {
        $exists = $this->pdo->prepare("SELECT id FROM currencies WHERE id = :id LIMIT 1");
        $exists->execute([':id' => $id]);
        if (!$exists->fetchColumn()) {
            Response::error('Moneda no encontrada', 404);
            return;
        }

        $payload = $this->readPayload();

        $code = array_key_exists('code', $payload) ? strtoupper(trim((string)$payload['code'])) : null;
        $name = array_key_exists('name', $payload) ? trim((string)$payload['name']) : null;
        $symbol = array_key_exists('symbol', $payload) ? trim((string)$payload['symbol']) : null;

        $sets = [];
        $params = [':id' => $id];

        if ($code !== null) {
            if (strlen($code) < 2 || strlen($code) > 10) {
                Response::error('code inválido (2 a 10 caracteres)', 422);
                return;
            }
            if ($this->existsByCode($code, $id)) {
                Response::error('Ya existe una moneda con ese code', 409);
                return;
            }
            $sets[] = "code = :code";
            $params[':code'] = $code;
        }

        if ($name !== null) {
            if ($name === '') {
                Response::error('name no puede estar vacío', 422);
                return;
            }
            $sets[] = "name = :name";
            $params[':name'] = $name;
        }

        if ($symbol !== null) {
            if ($symbol === '') {
                Response::error('symbol no puede estar vacío', 422);
                return;
            }
            $sets[] = "symbol = :symbol";
            $params[':symbol'] = $symbol;
        }

        if (!$sets) {
            Response::error('Nada para actualizar', 422);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE currencies SET " . implode(', ', $sets) . " WHERE id = :id");
        $stmt->execute($params);

        Cache::delete('ref:currencies');

        Response::json(['message' => 'Moneda actualizada']);
    }

    private function destroy(int $id): void
    {
        try {
            $exists = $this->pdo->prepare("SELECT id FROM currencies WHERE id = :id LIMIT 1");
            $exists->execute([':id' => $id]);
            if (!$exists->fetchColumn()) {
                Response::error('Moneda no encontrada', 404);
                return;
            }

            // Prevent deletion if currency is in use
            $refs = [
                'companies' => 0,
                'invoices' => 0,
                'payroll_runs' => 0,
                'contracts' => 0,
                'wallet_transactions' => 0,
            ];

            // Companies (FK: companies.default_currency_id -> currencies.id)
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM companies WHERE default_currency_id = :id");
                $stmt->execute([':id' => $id]);
                $refs['companies'] = (int)$stmt->fetchColumn();
            } catch (\Throwable $e) {}

            // Invoices
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM invoices WHERE currency_id = :id");
                $stmt->execute([':id' => $id]);
                $refs['invoices'] = (int)$stmt->fetchColumn();
            } catch (\Throwable $e) {}

            // Payroll runs
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM payroll_runs WHERE currency_id = :id");
                $stmt->execute([':id' => $id]);
                $refs['payroll_runs'] = (int)$stmt->fetchColumn();
            } catch (\Throwable $e) {}

            // Contracts
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM contracts WHERE currency_id = :id");
                $stmt->execute([':id' => $id]);
                $refs['contracts'] = (int)$stmt->fetchColumn();
            } catch (\Throwable $e) {}

            // Wallet transactions
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM wallet_transactions WHERE currency_id = :id");
                $stmt->execute([':id' => $id]);
                $refs['wallet_transactions'] = (int)$stmt->fetchColumn();
            } catch (\Throwable $e) {}

            $totalRefs = array_sum($refs);
            if ($totalRefs > 0) {
                Response::error(
                    'No se puede eliminar la moneda: está en uso por otros registros',
                    409,
                    ['references' => $refs]
                );
                return;
            }

            $stmt = $this->pdo->prepare("DELETE FROM currencies WHERE id = :id");
            $stmt->execute([':id' => $id]);
            Cache::delete('ref:currencies');
            Response::json(['message' => 'Moneda eliminada']);
        } catch (\Throwable $e) {
            Response::error(
                'No se puede eliminar la moneda',
                409,
                ['message' => $e->getMessage()]
            );
        }
    }

    private function existsByCode(string $code, ?int $ignoreId = null): bool
    {
        if ($ignoreId) {
            $stmt = $this->pdo->prepare("SELECT id FROM currencies WHERE code = :code AND id <> :id LIMIT 1");
            $stmt->execute([':code' => $code, ':id' => $ignoreId]);
            return (bool)$stmt->fetchColumn();
        }

        $stmt = $this->pdo->prepare("SELECT id FROM currencies WHERE code = :code LIMIT 1");
        $stmt->execute([':code' => $code]);
        return (bool)$stmt->fetchColumn();
    }

    private function readPayload(): array
    {
        $raw = file_get_contents('php://input') ?: '';

        if ($raw !== '') {
            $json = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($json)) return $json;
        }

        if (!empty($_POST)) return $_POST;

        $ct = $_SERVER['CONTENT_TYPE'] ?? '';
        if ($raw !== '' && stripos($ct, 'application/x-www-form-urlencoded') !== false) {
            parse_str($raw, $parsed);
            if (is_array($parsed)) return $parsed;
        }

        return [];
    }
}
