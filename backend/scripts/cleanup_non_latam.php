<?php

require_once __DIR__ . '/../src/Database.php';

use App\Database;

// Load config
$config = require __DIR__ . '/../config/config.php';

// Connect to DB
try {
    $database = new Database($config['db']);
    $pdo = $database->pdo();
    echo "Connected to database.\n";
} catch (\Exception $e) {
    die("Connection failed: " . $e->getMessage() . "\n");
}

// 1. Identify non-LATAM countries
echo "Identifying non-LATAM countries...\n";
$stmt = $pdo->query("SELECT id, name, iso2 FROM countries WHERE region != 'LATAM'");
$countries = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($countries)) {
    echo "No non-LATAM countries found.\n";
    exit;
}

$countryIds = array_column($countries, 'id');
$countryNames = array_column($countries, 'name');
$countryCodes = array_column($countries, 'iso2');

echo "Found " . count($countries) . " non-LATAM countries: " . implode(', ', $countryCodes) . "\n";
$idsStr = implode(',', $countryIds);
$namesQuoted = implode(',', array_map(fn($n) => "'" . $n . "'", $countryNames));
$codesQuoted = implode(',', array_map(fn($c) => "'" . $c . "'", $countryCodes));

// Helper to delete and report
function deleteAndReport($pdo, $table, $where, $params = []) {
    try {
        // Check if table exists
        $check = $pdo->query("SHOW TABLES LIKE '$table'");
        if ($check->rowCount() === 0) {
            echo "Table '$table' does not exist. Skipping.\n";
            return;
        }

        $sql = "DELETE FROM $table WHERE $where";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $count = $stmt->rowCount();
        echo "Deleted $count rows from '$table'.\n";
    } catch (\PDOException $e) {
        echo "Error deleting from '$table': " . $e->getMessage() . "\n";
    }
}

// 2. Delete Companies (Tenants) in these countries
// Note: We need to handle dependencies if no CASCADE is set.
// Dependencies of companies: legal_entities, contracts, projects, invoices, etc.
// Let's first get company IDs to be deleted to use for child deletions
$sqlCompanies = "SELECT id FROM companies WHERE country_id IN ($idsStr)";
$stmtComp = $pdo->query($sqlCompanies);
$companyIds = $stmtComp->fetchAll(PDO::FETCH_COLUMN);

if (!empty($companyIds)) {
    $compIdsStr = implode(',', array_map(fn($id) => "'" . $id . "'", $companyIds));
    echo "Found " . count($companyIds) . " companies to delete.\n";

    // Delete Legal Entities for these companies
    deleteAndReport($pdo, 'legal_entities', "company_id IN ($compIdsStr)");

    // Delete Contracts for these companies
    deleteAndReport($pdo, 'contracts', "company_id IN ($compIdsStr)");
    
    // Delete Projects
    deleteAndReport($pdo, 'projects', "company_id IN ($compIdsStr)");

    // Delete Invoices
    deleteAndReport($pdo, 'invoices', "company_id IN ($compIdsStr)");

    // Finally delete companies
    deleteAndReport($pdo, 'companies', "id IN ($compIdsStr)");
} else {
    echo "No companies found in non-LATAM countries.\n";
}

// 3. Delete Contract Templates for these countries
deleteAndReport($pdo, 'contract_templates', "country_id IN ($idsStr)");

// 4. Delete Compliance Requirements for these countries
deleteAndReport($pdo, 'compliance_requirements', "country_id IN ($idsStr)");

// 5. Delete Benefits Plans for these countries
deleteAndReport($pdo, 'benefits_plans', "country_id IN ($idsStr)");

// 6. Delete Legal Entities by Country Name/Code (if any remain that weren't linked to companies above, or just cleanup)
// Sometimes legal_entities table uses 'country' string column
deleteAndReport($pdo, 'legal_entities', "country IN ($namesQuoted) OR country IN ($codesQuoted)");

// 7. Delete Users/Freelancers?
// User asked for "datos como contratos y otros". 
// If users have `nationality` or `country_id` matching non-LATAM, maybe we should delete them?
// Risk: Deleting a global admin who happens to be from Spain.
// User said "elimina los datos como contratos y otros...".
// I will skip users to be safe, unless they are explicitly "freelancers" purely in that market, but hard to distinguish without more info.
// I'll stick to business data (contracts, templates, companies, compliance).

echo "Cleanup completed.\n";
