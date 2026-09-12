<?php
declare(strict_types=1);

// =========================================================
// migrate.php — Arma una sola vez el esquema completo.
//
// Uso (CLI, no es webroot):
//   php backend/scripts/migrate.php
//   php backend/scripts/migrate.php --force
//
// 1. Recorre los controladores y ejecuta su ensureTables()
//    (el DDL declarativo que hoy corre en cada request).
// 2. Aplica los updates/*.sql que aún no se hayan aplicado
//    (controlado por system_settings.applied_updates).
// 3. Marca el esquema como "migrado" (system_settings +
//    caché) para que los controladores dejen de ejecutar
//    DDL en runtime.
// =========================================================

require_once __DIR__ . '/../vendor/autoload.php';

try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->safeLoad();
} catch (Throwable $e) {
}

header('Content-Type: text/plain; charset=utf-8');

try {
    $config = require __DIR__ . '/../config/config.php';
    $database = new \App\Database($config['db'] ?? []);
    $pdo = $database->pdo();
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo conectar a la base de datos: " . $e->getMessage() . "\n");
    exit(1);
}

// =========================================================
// Fase 1: DDL de los controladores (multipasadas).
// Algunas tablas referencian por FK tablas de otros
// controladores (companies, users, countries...); en una
// BD nueva el orden alfabético no garantiza dependencias,
// así que reintentamos hasta estabilizar.
// =========================================================
$force = in_array('--force', $argv ?? [], true);

if ($force) {
    \App\Support\Cache::delete('schema_migrated_at');
    try {
        $pdo->exec("DELETE FROM system_settings WHERE setting_key = 'schema_migrated_at'");
    } catch (\Throwable $e) {
        // system_settings puede no existir todavía en una BD nueva
    }
    echo "Marcador de migración purgado (modo --force).\n";
}

if (!$force && \App\Support\Schema::isMigrated($pdo)) {
    echo "El esquema ya está migrado (schema_migrated_at="
        . \App\Support\Cache::get('schema_migrated_at')
        . "). Usa --force para re-ejecutar el DDL.\n";
    exit(0);
}

$controllersDir = __DIR__ . '/../src/Controllers';
$controllers = [];
foreach (glob($controllersDir . '/*.php') ?: [] as $file) {
    $class = 'App\\Controllers\\' . basename($file, '.php');
    if (class_exists($class)) {
        $controllers[] = $class;
    }
}

$maxPasses = 5;
$errors = [];
$passes = 0;

for ($pass = 1; $pass <= $maxPasses; $pass++) {
    $passes = $pass;
    $errors = [];

    foreach ($controllers as $class) {
        try {
            $ref = new ReflectionClass($class);
            $ctor = $ref->getConstructor();
            $args = [];

            if ($ctor !== null) {
                foreach ($ctor->getParameters() as $param) {
                    $type = $param->getType();
                    $typeName = $type instanceof ReflectionNamedType ? $type->getName() : null;

                    if ($typeName === 'App\Database') {
                        $args[] = $database;
                        continue;
                    }
                    if ($typeName === 'PDO') {
                        $args[] = $pdo;
                        continue;
                    }
                    if ($typeName === 'array') {
                        if ($param->getName() === 'jwtConfig') {
                            $args[] = $config['jwt'] ?? [];
                            continue;
                        }
                        if ($param->getName() === 'pagination') {
                            $args[] = $config['pagination'] ?? [];
                            continue;
                        }
                        $args[] = [];
                        continue;
                    }
                    if ($param->isDefaultValueAvailable()) {
                        $args[] = $param->getDefaultValue();
                        continue;
                    }

                    throw new RuntimeException("Parámetro \${$param->getName()} no resoluble ({$typeName})");
                }
            }

            $ref->newInstanceArgs($args);
        } catch (Throwable $e) {
            $errors[] = $class . ': ' . $e->getMessage();
        }
    }

    if (empty($errors)) {
        break;
    }

    echo "Paso {$pass}: " . (count($controllers) - count($errors)) . "/" . count($controllers) . " controladores OK, reintentando…\n";
}

if (!empty($errors)) {
    echo "ERROR: no se pudieron crear todas las tablas tras {$passes} pasadas:\n  - " . implode("\n  - ", $errors) . "\n";
    echo "El esquema NO se marcó como migrado. Revisa los errores antes de continuar.\n";
    exit(1);
}

echo "DDL ejecutado correctamente en " . count($controllers) . " controladores (pasadas: {$passes}).\n";

// =========================================================
// Fase 2: updates/*.sql pendientes
// =========================================================
$updatesDir = __DIR__ . '/../updates';
$applied = [];

try {
    $stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'applied_updates' LIMIT 1");
    $row = $stmt->fetchColumn();
    $applied = $row !== false ? (json_decode((string)$row, true) ?: []) : [];
} catch (Throwable $e) {
}

foreach (glob($updatesDir . '/*.sql') ?: [] as $sqlFile) {
    $basename = basename($sqlFile);
    if (in_array($basename, $applied, true)) {
        continue;
    }

    try {
        $pdo->exec((string)file_get_contents($sqlFile));
        $applied[] = $basename;
        echo "update aplicado: {$basename}\n";
    } catch (Throwable $e) {
        echo "update OMITIDO {$basename}: " . $e->getMessage() . "\n";
    }
}

try {
    $pdo->prepare(
        "INSERT INTO system_settings (setting_key, setting_value, created_at, updated_at)
         VALUES ('applied_updates', :v, NOW(), NOW())
         ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()"
    )->execute([':v' => json_encode($applied), ':v2' => json_encode($applied)]);
} catch (Throwable $e) {
    echo "No se pudo guardar applied_updates: " . $e->getMessage() . "\n";
}

\App\Support\Schema::markMigrated($pdo);

echo "Esquema marcado como migrado.\n";

exit(0);