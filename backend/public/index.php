<?php

// =====================================================
// CORS SIEMPRE PRIMERO (allowlist de orígenes)
// =====================================================
$allowedOrigins = array_filter(array_map('trim', explode(',', (string)getenv('CORS_ALLOWED_ORIGINS'))));
if (empty($allowedOrigins)) {
    $allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://app.spectralatam.com',
        'https://manage.spectralatam.com',
    ];
}

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$isAllowedOrigin = $requestOrigin !== '' && in_array(rtrim($requestOrigin, '/'), $allowedOrigins, true);

if ($isAllowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
} else {
    // No origin (mismo-origen) o origin no permitido: sin ACAO
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Compresión gzip cuando el cliente la soporte (ob_gzhandler se auto-desactiva si no aplica)
ob_start('ob_gzhandler');

// =====================================================
// Errores a JSON
// =====================================================
$appDebug = filter_var(getenv('APP_DEBUG') ?: getenv('APP_ENV') === 'development', FILTER_VALIDATE_BOOLEAN);

if ($appDebug) {
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
} else {
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);
}

error_reporting(E_ALL);

set_exception_handler(function ($e) use ($appDebug) {
    $msg = $appDebug ? $e->getMessage() : 'Internal Server Error';
    $details = [];
    if ($appDebug) {
        $details = [
            'message' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ];
    } else {
        error_log('[Spectra] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    }

    http_response_code(500);
    $body = ['error' => $msg];
    if (!empty($details)) $body['details'] = $details;
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
});

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});

// =====================================================
// Bootstrap
// =====================================================
$GLOBALS['debug_start'] = microtime(true);
function debug_log($msg) {
    $time = microtime(true) - $GLOBALS['debug_start'];
    file_put_contents(__DIR__ . '/debug_timings.log', sprintf("[%.4f] %s\n", $time, $msg), FILE_APPEND);
}
debug_log("Request started: " . ($_SERVER['REQUEST_URI'] ?? 'unknown'));

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
try {
    $dotenv->safeLoad();
} catch (Throwable $e) {
    // Un .env malformado/presente con valores sin comillas no debe tumbar la API:
    // config.php cae al valor por getenv() (variables de entorno del proceso).
}

require_once __DIR__ . '/../src/Support/Response.php';
require_once __DIR__ . '/../src/Support/Auth.php';
require_once __DIR__ . '/../src/Support/Str.php';
require_once __DIR__ . '/../src/Support/SMTP.php';
require_once __DIR__ . '/../src/Support/TaxEngine.php';
debug_log("Core classes loaded");

require_once __DIR__ . '/../src/Support/AuditLogger.php';
require_once __DIR__ . '/../src/Database.php';

debug_log("DB connecting...");
$config = require __DIR__ . '/../config/config.php';
$database = new App\Database($config['db']);
// Force connection REMOVED for optimization
// $database->pdo();
debug_log("DB configured (lazy connection)");


require_once __DIR__ . '/../src/Controllers/GenericController.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/TenantController.php';
require_once __DIR__ . '/../src/Controllers/CountryController.php';
require_once __DIR__ . '/../src/Controllers/CurrencyController.php';
require_once __DIR__ . '/../src/Controllers/TimezoneController.php';
require_once __DIR__ . '/../src/Controllers/CompanyFeeRulesController.php';
require_once __DIR__ . '/../src/Controllers/UserController.php';
require_once __DIR__ . '/../src/Controllers/RoleController.php';
require_once __DIR__ . '/../src/Controllers/KybController.php';
require_once __DIR__ . '/../src/Controllers/AuditController.php';
require_once __DIR__ . '/../src/Controllers/SystemSettingsController.php';
require_once __DIR__ . '/../src/Controllers/SecurityController.php';
require_once __DIR__ . '/../src/Controllers/FreelancerController.php';
require_once __DIR__ . '/../src/Controllers/SupportTicketController.php';
require_once __DIR__ . '/../src/Controllers/KnowledgeBaseController.php';
require_once __DIR__ . '/../src/Controllers/GlobalContractTemplateController.php';
require_once __DIR__ . '/../src/Controllers/GlobalContractController.php';
require_once __DIR__ . '/../src/Controllers/EnvelopeController.php';
require_once __DIR__ . '/../src/Controllers/SignatureController.php';
require_once __DIR__ . '/../src/Controllers/FinanceController.php';
require_once __DIR__ . '/../src/Controllers/ProjectController.php';
require_once __DIR__ . '/../src/Controllers/PayrollSettingsController.php';
require_once __DIR__ . '/../src/Controllers/FiscalParameterController.php';
require_once __DIR__ . '/../src/Controllers/FeesController.php';
require_once __DIR__ . '/../src/Controllers/TimesheetController.php';
require_once __DIR__ . '/../src/Controllers/AnalyticsController.php';
require_once __DIR__ . '/../src/Controllers/VendorController.php';
require_once __DIR__ . '/../src/Controllers/RequisitionController.php';
require_once __DIR__ . '/../src/Controllers/BankAccountController.php';
require_once __DIR__ . '/../src/Controllers/TimeOffController.php';
require_once __DIR__ . '/../src/Controllers/EmployeeDocumentController.php';
require_once __DIR__ . '/../src/Controllers/BenefitsController.php';
require_once __DIR__ . '/../src/Controllers/PayrollController.php';
require_once __DIR__ . '/../src/Controllers/ImmigrationController.php';
require_once __DIR__ . '/../src/Controllers/LegalEntityController.php';
require_once __DIR__ . '/../src/Controllers/EquipmentController.php';
require_once __DIR__ . '/../src/Controllers/ComplianceController.php';
require_once __DIR__ . '/../src/Controllers/IntegrationController.php';
require_once __DIR__ . '/../src/Controllers/NpsController.php';
require_once __DIR__ . '/../src/Controllers/ChatbotController.php';
require_once __DIR__ . '/../src/Controllers/AdvanceController.php';
require_once __DIR__ . '/../src/Controllers/CardController.php';
require_once __DIR__ . '/../src/Controllers/PerformanceController.php';
require_once __DIR__ . '/../src/Controllers/ExpenseController.php';
require_once __DIR__ . '/../src/Controllers/OnboardingController.php';
require_once __DIR__ . '/../src/Controllers/TaxFormController.php';
require_once __DIR__ . '/../src/Controllers/NotificationController.php';
require_once __DIR__ . '/../src/Controllers/BackgroundCheckController.php';
require_once __DIR__ . '/../src/Controllers/LaborLawAlertController.php';
require_once __DIR__ . '/../src/Controllers/FiscalParameterController.php';
require_once __DIR__ . '/../src/Controllers/ModerationController.php';
require_once __DIR__ . '/../src/Controllers/FreelancerAreaController.php';

use App\Controllers\GenericController;
use App\Controllers\AuthController;
use App\Controllers\TenantController;
use App\Controllers\CountryController;
use App\Controllers\CurrencyController;
use App\Controllers\TimezoneController;
use App\Controllers\CompanyFeeRulesController;
use App\Controllers\UserController;
use App\Controllers\RoleController;
use App\Controllers\KybController;
use App\Controllers\AuditController;
use App\Controllers\SystemSettingsController;
use App\Controllers\SecurityController;
use App\Controllers\FreelancerController;
use App\Controllers\SupportTicketController;
use App\Controllers\KnowledgeBaseController;
use App\Controllers\GlobalContractTemplateController;
use App\Controllers\GlobalContractController;
use App\Controllers\EnvelopeController;
use App\Controllers\SignatureController;
use App\Controllers\FinanceController;
use App\Controllers\BankAccountController;
use App\Controllers\ComplianceController;
use App\Controllers\AdvanceController;
use App\Controllers\CardController;
use App\Controllers\PerformanceController;
use App\Controllers\ExpenseController;
use App\Controllers\IntegrationController;
use App\Controllers\NpsController;
use App\Controllers\ChatbotController;

use App\Database;
use App\Support\Auth;
use App\Support\Response;

$config = require __DIR__ . '/../config/config.php';

$database = new Database($config['db']);
$controller = new GenericController($database, $config['pagination']);
$authController = new AuthController($database, $config['jwt']);
$tenantController = new TenantController($database);
$globalContractTemplateController = new GlobalContractTemplateController($database);
$globalContractController = new GlobalContractController($database);
$envelopeController = new EnvelopeController($database);
$signatureController = new SignatureController($database);
$financeController = new FinanceController($database);
$bankAccountController = new BankAccountController($database);
$timeOffController = new \App\Controllers\TimeOffController($database);
$employeeDocumentController = new \App\Controllers\EmployeeDocumentController($database);
$benefitsController = new \App\Controllers\BenefitsController($database);
$payrollController = new \App\Controllers\PayrollController($database);
$immigrationController = new \App\Controllers\ImmigrationController($database);
$legalEntityController = new \App\Controllers\LegalEntityController($database);

$countryController = new CountryController($database);
$currencyController = new CurrencyController($database);
$timezoneController = new TimezoneController($database);
$companyFeeRulesController = new CompanyFeeRulesController($database);
$userController = new UserController($database);
$roleController = new RoleController($database);
$kybController = new KybController($database);
$auditController = new AuditController($database);
$systemSettingsController = new SystemSettingsController($database);
$securityController = new SecurityController($database);
$freelancerController = new FreelancerController($database);
$supportTicketController = new SupportTicketController($database);
$knowledgeBaseController = new KnowledgeBaseController($database, $config['jwt']);
$moderationController = new \App\Controllers\ModerationController($database);
$freelancerAreaController = new \App\Controllers\FreelancerAreaController($database, $config['jwt']);

$projectController = new \App\Controllers\ProjectController($database);
$feesController = new \App\Controllers\FeesController($database);
$timesheetController = new \App\Controllers\TimesheetController($database);
$analyticsController = new \App\Controllers\AnalyticsController($database);
$vendorController = new \App\Controllers\VendorController($database);
$requisitionController = new \App\Controllers\RequisitionController($database);
$equipmentController = new \App\Controllers\EquipmentController($database);
$complianceController = new \App\Controllers\ComplianceController($database);
$advanceController = new \App\Controllers\AdvanceController($database);
$cardController = new \App\Controllers\CardController($database);
$performanceController = new \App\Controllers\PerformanceController($database);
$expenseController = new \App\Controllers\ExpenseController($database);
$onboardingController = new \App\Controllers\OnboardingController($database);
$npsController = new \App\Controllers\NpsController($database);
$chatbotController = new \App\Controllers\ChatbotController($database);
$taxFormController = new \App\Controllers\TaxFormController($database);
$notificationController = new \App\Controllers\NotificationController($database);
$backgroundCheckController = new \App\Controllers\BackgroundCheckController($database);
$laborLawAlertController = new \App\Controllers\LaborLawAlertController($database);
$fiscalParameterController = new \App\Controllers\FiscalParameterController($database->pdo());
debug_log("Controllers initialized: Notification=" . (isset($notificationController) ? 'YES' : 'NO'));

// =====================================================
// Router: soporta /api/... y /public/api/... y cualquier prefijo
// =====================================================
$path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
$segments = array_values(array_filter(explode('/', $path), fn($s) => $s !== ''));

$apiIndex = array_search('api', $segments, true);

// Debug rápido de routing (temporal): /public/_debug_router
if (($segments[0] ?? '') === '_debug_router') {
    Response::json([
        'file' => __FILE__,
        'request_uri' => $_SERVER['REQUEST_URI'] ?? null,
        'parsed_path' => $path,
        'segments' => $segments,
        'apiIndex' => $apiIndex,
    ], 200);
    exit;
}

if ($apiIndex === false) {
    Response::json([
        'message' => 'API básica en funcionamiento',
        'hint' => 'No se detectó el segmento "api" en la URL',
        'debug' => [
            'file' => __FILE__,
            'parsed_path' => $path,
            'segments' => $segments,
        ],
    ], 200);
    exit;
}

// desde aquí, $segments empieza en "api"
$segments = array_slice($segments, $apiIndex);

$table = $segments[1] ?? null;
// Normalizar tabla a minúsculas para asegurar coincidencias
if ($table) {
    $table = strtolower($table);
}
$id    = $segments[2] ?? null;

if (!$table) {
    Response::error('Debe indicar la tabla a consultar', 400);
    exit;
}

// Normalizar método HTTP para uso posterior
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// =====================================================
// Debug endpoints (solo diagnóstico, desactivados en producción)
// Activar únicamente con APP_DEBUG=true en .env
// /public/api/_debug/db
// /public/api/_debug/users
// =====================================================
if ($table === '_debug') {
    $action = $segments[2] ?? '';

    if (!$appDebug) {
        Response::error('Not Found', 404);
        exit;
    }

    if ($action === 'db') {
        $pdo = $database->pdo();
        $info = $pdo->query("
            SELECT
              DATABASE() AS db,
              USER() AS user,
              @@hostname AS mysql_host,
              @@port AS mysql_port
        ")->fetch(PDO::FETCH_ASSOC);

        Response::json([
            'db_connection' => $info,
        ], 200);
        exit;
    }

    if ($action === 'users') {
        $pdo = $database->pdo();
        $rows = $pdo->query("
            SELECT id, full_name, email, status, platform_role, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 20
        ")->fetchAll(PDO::FETCH_ASSOC);

        Response::json(['latest_users' => $rows], 200);
        exit;
    }

    if ($action === 'headers') {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (strpos($key, 'HTTP_') === 0) {
                $headers[$key] = $value;
            }
        }
        if (function_exists('apache_request_headers')) {
            $headers['apache'] = apache_request_headers();
        }
        Response::json(['headers' => $headers, 'server' => $_SERVER], 200);
        exit;
    }

    Response::error('Debug action inválida', 404);
    exit;
}

// =====================================================
// Payroll Settings (Company specific)
// =====================================================
if ($table === 'companies' && isset($segments[3]) && $segments[3] === 'payroll-settings') {
    $controller = new \App\Controllers\PayrollSettingsController($database->pdo());
    $companyId = $segments[2];
    
    if ($method === 'GET') {
        $controller->show($companyId);
    } elseif ($method === 'POST' || $method === 'PUT') {
        $controller->update($companyId);
    } else {
        Response::error('Método no permitido', 405);
    }
    exit;
}

// =====================================================
// Fiscal Parameters (Direct and Nested)
// =====================================================
if ($table === 'fiscal-parameters') {
    $controller = new \App\Controllers\FiscalParameterController($database->pdo());
    $controller->handleDirect($segments, $method);
    exit;
}


// =====================================================
// Auth
// =====================================================
if ($table === 'login') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        Response::error('Solo POST para login', 405);
        exit;
    }
    $authController->login();
    exit;
}

if ($table === 'register') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        Response::error('Solo POST para registro', 405);
        exit;
    }
    $authController->registerAdmin();
    exit;
}

if ($table === 'password' && ($segments[2] ?? '') === 'forgot') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        Response::error('Solo POST para recuperar contraseña', 405);
        exit;
    }
    $authController->forgotPassword();
    exit;
}

if ($table === 'password' && ($segments[2] ?? '') === 'reset') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        Response::error('Solo POST para restablecer contraseña', 405);
        exit;
    }
    $authController->resetPassword();
    exit;
}

if ($table === 'auth') {
    $provider = $segments[2] ?? null;
    if ($provider) {
        $authController->handleOAuth($provider, $segments);
        exit;
    }
}

if ($table === 'logout') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        Response::error('Solo POST para logout', 405);
        exit;
    }
    $authController->logout();
    exit;
}

if ($table === 'token' && ($segments[2] ?? '') === 'refresh') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        Response::error('Solo POST para refresh', 405);
        exit;
    }
    $authController->refresh();
    exit;
}

// =====================================================
// Notifications
// =====================================================
if ($table === 'notifications') {
    if (!isset($notificationController)) {
        debug_log("WARNING: notificationController was undefined, instantiating lazily");
        $notificationController = new \App\Controllers\NotificationController($database);
    }
    Auth::require($database->pdo(), $config['jwt']);
    $notificationController->handle($segments, $_SERVER['REQUEST_METHOD'] ?? 'GET');
    exit;
}

// =====================================================
// Background Checks
// =====================================================
if ($table === 'background-checks') {
    if (!isset($backgroundCheckController)) {
        $backgroundCheckController = new \App\Controllers\BackgroundCheckController($database);
    }
    Auth::require($database->pdo(), $config['jwt']);
    $backgroundCheckController->handle($segments, $_SERVER['REQUEST_METHOD'] ?? 'GET');
    exit;
}

// =====================================================
// Tenants
// =====================================================
if ($table === 'tenants' || $table === 'companies') {
    debug_log("Handling tenants route");
    // Si es companies/.../roles, lo dejamos pasar al bloque específico de roles o lo manejamos aquí?
    // El bloque de abajo ya maneja companies/.../roles, así que debemos asegurarnos de no "robarlo" 
    // si queremos que RoleController lo maneje. 
    // PERO: el bloque de abajo está DESPUÉS de este si pongo esto aquí.
    // Moveré el bloque de roles ANTES de tenants/companies o haré la excepción.
    
    // Mejor estrategia: Check for roles specific sub-route override
    if ($table === 'companies' && ($segments[3] ?? '') === 'roles') {
        Auth::require($database->pdo(), $config['jwt']);
        $roleController->handle($segments, $_SERVER['REQUEST_METHOD']);
        exit;
    }

    Auth::require($database->pdo(), $config['jwt']);
    debug_log("Auth passed, calling TenantController");
    $tenantController->handle($segments, $_SERVER['REQUEST_METHOD'] ?? 'GET');
    debug_log("TenantController finished");
    exit;
}

// =====================================================
// Custom Controllers (Overwrites default CRUD)
// =====================================================

if ($table === 'fees') {
    Auth::require($database->pdo(), $config['jwt']);
    $controller = new \App\Controllers\FeesController($database);
    $controller->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'countries' && ($segments[3] ?? '') === 'fiscal-parameters') {
    Auth::require($database->pdo(), $config['jwt']);
    $fiscalParameterController->handleNested($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'fiscal-parameters') {
    Auth::require($database->pdo(), $config['jwt']);
    $fiscalParameterController->handleDirect($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'countries') {
    Auth::require($database->pdo(), $config['jwt']);
    $countryController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'currencies') {
    Auth::require($database->pdo(), $config['jwt']);
    $currencyController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'timezones') {
    Auth::require($database->pdo(), $config['jwt']);
    $timezoneController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'company_fee_rules') {
    Auth::require($database->pdo(), $config['jwt']);
    $companyFeeRulesController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'kyb') {
    Auth::require($database->pdo(), $config['jwt']);
    $kybController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'audit' || $table === 'audit_logs') {
    Auth::require($database->pdo(), $config['jwt']);
    $auditController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'system-settings') {
    Auth::require($database->pdo(), $config['jwt']);
    $sub = $segments[2] ?? '';
    if ($sub === 'test-smtp') {
        $systemSettingsController->testSmtp();
    } else {
        $systemSettingsController->handle($_SERVER['REQUEST_METHOD']);
    }
    exit;
}

if ($table === 'global-contract-templates') {
    Auth::require($database->pdo(), $config['jwt']);
    $globalContractTemplateController->handle($_SERVER['REQUEST_METHOD'], $id);
    exit;
}

if ($table === 'global-contracts') {
    Auth::require($database->pdo(), $config['jwt']);
    $globalContractController->handle($_SERVER['REQUEST_METHOD'], $id);
    exit;
}

if ($table === 'envelopes') {
    Auth::require($database->pdo(), $config['jwt']);
    $envelopeController->handle($_SERVER['REQUEST_METHOD'], $id);
    exit;
}

// Portal público de firma (Spectra Sign): rutas /api/sign/{token} y /api/sign/{token}/pdf
if ($table === 'sign') {
    $signatureController->handle($segments, $_SERVER['REQUEST_METHOD'] ?? 'GET');
    exit;
}

if ($table === 'permissions' || $table === 'roles') {
    Auth::require($database->pdo(), $config['jwt']);
    $roleController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'companies' && ($segments[3] ?? '') === 'roles') {
    Auth::require($database->pdo(), $config['jwt']);
    $roleController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'users') {
    Auth::require($database->pdo(), $config['jwt']);
    $userController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'support-tickets') {
    Auth::require($database->pdo(), $config['jwt']);
    $supportTicketController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'moderation') {
    Auth::require($database->pdo(), $config['jwt']);
    $moderationController->handle($_SERVER['REQUEST_METHOD'], $id);
    exit;
}

if ($table === 'kb') {
    // Public read access for KB? Maybe. For now let's require auth.
    // If we want public KB, we can check method/segment.
    Auth::require($database->pdo(), $config['jwt']);
    $knowledgeBaseController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'security') {
    Auth::require($database->pdo(), $config['jwt']);
    $securityController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'freelancer-areas') {
    Auth::require($database->pdo(), $config['jwt']);
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'GET') {
        $freelancerAreaController->index();
    } elseif ($method === 'POST') {
        $freelancerAreaController->store();
    } elseif ($method === 'PUT') {
        if ($id) {
            $freelancerAreaController->update($id);
        }
    } elseif ($method === 'DELETE') {
        if ($id) {
            $freelancerAreaController->destroy($id);
        }
    }
    exit;
}

if ($table === 'freelancers') {
    Auth::require($database->pdo(), $config['jwt']);
    $freelancerController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'finance') {
    Auth::require($database->pdo(), $config['jwt']);
    $financeController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'compliance') {
    Auth::require($database->pdo(), $config['jwt']);

    if (($segments[2] ?? '') === 'labor-law-alerts') {
        if (!isset($laborLawAlertController)) {
            $laborLawAlertController = new \App\Controllers\LaborLawAlertController($database);
        }
        $laborLawAlertController->handle($segments, $_SERVER['REQUEST_METHOD']);
        exit;
    }

    $complianceController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'advances') {
    Auth::require($database->pdo(), $config['jwt']);
    $advanceController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'cards') {
    Auth::require($database->pdo(), $config['jwt']);
    $cardController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'projects') {
    Auth::require($database->pdo(), $config['jwt']);
    $projectController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'timesheets') {
    Auth::require($database->pdo(), $config['jwt']);
    $timesheetController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'analytics') {
    Auth::require($database->pdo(), $config['jwt']);
    $analyticsController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

// Handler for nested /api/procurement/... routes
if ($table === 'procurement') {
    Auth::require($database->pdo(), $config['jwt']);
    
    $sub = $segments[2] ?? '';
    
    if ($sub === 'vendors') {
        // Remap: api/procurement/vendors/[id] -> api/vendors/[id]
        $newSegments = ['api', 'vendors'];
        if (isset($segments[3])) $newSegments[] = $segments[3];
        
        $vendorController->handle($newSegments, $_SERVER['REQUEST_METHOD']);
        exit;
    }

    if ($sub === 'requisitions') {
        // Remap: api/procurement/requisitions/[id]/... -> api/requisitions/[id]/...
        $newSegments = ['api', 'requisitions'];
        for ($i = 3; $i < count($segments); $i++) {
            $newSegments[] = $segments[$i];
        }
        
        $requisitionController->handle($newSegments, $_SERVER['REQUEST_METHOD']);
        exit;
    }
    
    Response::error('Recurso de procurement no encontrado', 404);
    exit;
}

if ($table === 'vendors') {
    Auth::require($database->pdo(), $config['jwt']);
    $vendorController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'requisitions') {
    Auth::require($database->pdo(), $config['jwt']);
    $requisitionController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'bank-accounts') {
    Auth::require($database->pdo(), $config['jwt']);
    $bankAccountController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'time-off') {
    Auth::require($database->pdo(), $config['jwt']);
    $timeOffController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'equipment') {
    Auth::require($database->pdo(), $config['jwt']);
    $equipmentController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'employee-documents') {
    Auth::require($database->pdo(), $config['jwt']);
    $employeeDocumentController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'benefits') {
    Auth::require($database->pdo(), $config['jwt']);
    $benefitsController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'payroll') {
    Auth::require($database->pdo(), $config['jwt']);
    $payrollController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'immigration') {
    Auth::require($database->pdo(), $config['jwt']);
    $immigrationController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'legal-entities') {
    Auth::require($database->pdo(), $config['jwt']);
    $legalEntityController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

if ($table === 'onboarding') {
    \App\Support\Auth::require($database->pdo(), $config['jwt']);
    $user = \App\Support\Auth::user();
    $method = $_SERVER['REQUEST_METHOD'];
    $sub = $segments[2] ?? '';
    
    if ($sub === 'me' && $method === 'GET') {
        $onboardingController->getMyTasks($user['id']);
        exit;
    }
    // Admin view: GET /api/onboarding/tasks/{userId}
    if ($sub === 'tasks' && isset($segments[3]) && $method === 'GET') {
        $onboardingController->getUserTasks($segments[3]);
        exit;
    }
    if ($sub === 'tasks' && isset($segments[3]) && ($segments[4] ?? '') === 'complete' && $method === 'POST') {
        $onboardingController->completeTask($segments[3]);
        exit;
    }
    if ($sub === 'tasks' && isset($segments[3]) && ($segments[4] ?? '') === 'reset' && $method === 'POST') {
        $onboardingController->resetTask($segments[3]);
        exit;
    }
    if ($sub === 'assign-manager' && $method === 'POST') {
        $onboardingController->assignManager();
        exit;
    }
    if ($sub === 'org-chart' && $method === 'GET') {
        $onboardingController->getOrgChart();
        exit;
    }
    if ($sub === 'users-progress' && $method === 'GET') {
        $onboardingController->getAllUsersProgress();
        exit;
    }

    if ($sub === 'templates' && isset($segments[3])) {
        if ($method === 'GET') {
            $onboardingController->getTemplates($segments[3]); // segments[3] is company_id
            exit;
        }
        if ($method === 'POST') {
            $onboardingController->createTemplate($segments[3]); // segments[3] is company_id
            exit;
        }
        if ($method === 'DELETE') {
            $onboardingController->deleteTemplate($segments[3]); // segments[3] is template_id
            exit;
        }
    }
    
    if ($sub === 'internal' && ($segments[3] ?? '') === 'assign' && $method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        $onboardingController->assignInternalOnboardingTasks($input['user_id'] ?? '', $input['company_id'] ?? null);
        \App\Support\Response::json(['message' => 'Internal onboarding tasks assigned']);
        exit;
    }

    if ($sub === 'tasks' && isset($segments[3]) && $method === 'PUT') {
        $onboardingController->updateTask($segments[3]);
        exit;
    }

    if ($sub === 'trigger-offboarding' && $method === 'POST') {
        $onboardingController->triggerOffboarding();
        exit;
    }
    
    Response::error('Ruta de onboarding no encontrada', 404);
    exit;
}

if ($table === 'tax-forms') {
    \App\Support\Auth::require($database->pdo(), $config['jwt']);
    $user = \App\Support\Auth::user();
    $method = $_SERVER['REQUEST_METHOD'];
    $sub = $segments[2] ?? '';

    if ($method === 'GET' && $sub === 'me') {
        $taxFormController->getMyForm($user['id']);
        exit;
    }
    if ($method === 'POST' && !$sub) {
        $taxFormController->submit();
        exit;
    }
    if ($method === 'GET' && !$sub) {
        $taxFormController->index();
        exit;
    }
    if ($method === 'GET' && isset($segments[2]) && ($segments[3] ?? '') === 'download') {
        $taxFormController->downloadPdf($segments[2]);
        exit;
    }
    exit;
}

if ($table === 'nps') {
    \App\Support\Auth::require($database->pdo(), $config['jwt']);
    $npsController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

// Fees route handled above at line 407
// if ($table === 'fees') { ... }

if ($table === 'chatbot') {
    \App\Support\Auth::require($database->pdo(), $config['jwt']);
    $chatbotController->handle($segments, $_SERVER['REQUEST_METHOD']);
    exit;
}

// =====================================================
// Generic CRUD
// =====================================================
Auth::require($database->pdo(), $config['jwt']);
$controller->handle($table, $id, $_SERVER['REQUEST_METHOD']);
exit;
