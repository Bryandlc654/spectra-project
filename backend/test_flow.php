<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/src/Support/Auth.php';
use App\Support\Auth;

$config = require __DIR__ . '/config/config.php';
$pdo = new PDO(
    "mysql:host={$config['db']['host']};port={$config['db']['port']};dbname={$config['db']['database']};charset={$config['db']['charset']}",
    $config['db']['username'],
    $config['db']['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

// 1. Setup Test Data
$companyId = '3fbf9fb1-48bf-4563-aae6-3176d1f895b1';
$freelancerId = 'dca4efa4-dda8-493c-81dc-a5ab56d9066a';
$testUserId = 'test-admin-' . time();
// Check if exists
$stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
$stmt->execute(['testadmin@example.com']);
$existing = $stmt->fetchColumn();
if ($existing) {
    $testUserId = $existing;
} else {
    $pdo->prepare("INSERT INTO users (id, full_name, email, password_hash, status, platform_role, created_at) VALUES (?, 'Test Admin', 'testadmin@example.com', 'hash', 'active', 'admin', NOW())")->execute([$testUserId]);
}

// Generate Token
$claims = [
    'sub' => $testUserId,
    'iss' => $config['jwt']['issuer'],
    'exp' => time() + 3600,
    'iat' => time(),
    'role' => 'admin'
];
$token = Auth::jwtEncode($claims, $config['jwt']['secret']);
echo "Generated Token: " . substr($token, 0, 10) . "...\n";

// 2. Start Server
$cmd = "php -S localhost:8081 -t " . __DIR__ . "/public > /dev/null 2>&1 &";
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
    $cmd = "start /B php -S localhost:8081 -t " . __DIR__ . "/public";
}
pclose(popen($cmd, "r"));
sleep(2); // Wait for server

$baseUrl = "http://localhost:8081/api/tenants/$companyId/invoices";
$headers = [
    "Authorization: Bearer $token",
    "Content-Type: application/json"
];

function req($method, $url, $data = null) {
    global $headers;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($data) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'body' => $res];
}

// 3. Run Flow

// A. Create Invoice
echo "\n1. Creating Invoice...\n";
$createData = [
    'contract_id' => null,
    'freelancer_id' => $freelancerId,
    'invoice_number' => 'TEST-001',
    'issue_date' => date('Y-m-d'),
    'due_date' => date('Y-m-d', strtotime('+30 days')),
    'currency_id' => 1,
    'items' => [
        ['description' => 'Test Item', 'quantity' => 10, 'unit_price' => 50] // Total 500
    ],
    'notes' => 'Test Invoice'
];
$res = req('POST', $baseUrl, $createData);
echo "Status: {$res['code']}\n";
$body = json_decode($res['body'], true);
if ($res['code'] !== 200 && $res['code'] !== 201) {
    echo "Failed: " . $res['body'] . "\n";
    exit;
}
$invoiceId = $body['id'] ?? null;
if (!$invoiceId) {
    // Maybe list returned?
    echo "Response: " . $res['body'] . "\n";
    // Check if body has 'id' directly or inside 'data'
    // Usually invoicesStore returns created object or success message?
    // Let's check TenantController::invoicesStore return.
    // It returns Response::json(['message' => 'Factura creada', 'id' => $id]);
}
echo "Invoice ID: $invoiceId\n";

// B. Update Invoice
echo "\n2. Updating Invoice...\n";
$updateData = $createData;
$updateData['items'][0]['quantity'] = 20; // Total 1000
$res = req('PUT', "$baseUrl/$invoiceId", $updateData);
echo "Status: {$res['code']}\n";
echo "Response: " . $res['body'] . "\n";

// C. Generate PDF
echo "\n3. Generating PDF...\n";
$res = req('GET', "$baseUrl/$invoiceId/pdf");
echo "Status: {$res['code']}\n";
if ($res['code'] === 200 && strpos($res['body'], '%PDF') === 0) {
    echo "PDF Generated Successfully (Header found)\n";
} else {
    echo "PDF Generation Failed\n";
}

// D. Send Email
echo "\n4. Sending Email...\n";
$res = req('POST', "$baseUrl/$invoiceId/send");
echo "Status: {$res['code']}\n";
echo "Response: " . $res['body'] . "\n";

// E. Pay Invoice
echo "\n5. Paying Invoice...\n";
$res = req('POST', "$baseUrl/$invoiceId/pay");
echo "Status: {$res['code']}\n";
echo "Response: " . $res['body'] . "\n";

// F. Delete Invoice (Should Fail)
echo "\n6. Deleting Invoice (Should Fail)...\n";
$res = req('DELETE', "$baseUrl/$invoiceId");
echo "Status: {$res['code']}\n";
echo "Response: " . $res['body'] . "\n";

// Cleanup
$pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$testUserId]);
// Keep invoice for inspection? Or delete manually from DB
// $pdo->prepare("DELETE FROM invoices WHERE id = ?")->execute([$invoiceId]);

echo "\nDone.\n";
