<?php

namespace App\Controllers;

use App\Database;
use PDO;
use Exception;
use App\Support\Response;
use App\Support\Auth;
use App\Support\Str;
use Pusher\Pusher;

class ChatbotController
{
    private $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables()
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS chatbot_conversations (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                status VARCHAR(50) DEFAULT 'active', -- active, closed
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (user_id)
            )
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS chatbot_messages (
                id VARCHAR(36) PRIMARY KEY,
                conversation_id VARCHAR(36) NOT NULL,
                sender VARCHAR(20) NOT NULL, -- user, bot, agent
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (conversation_id),
                FOREIGN KEY (conversation_id) REFERENCES chatbot_conversations(id) ON DELETE CASCADE
            )
        ");
    }

    public function handle(array $segments, string $method)
    {
        // /api/chatbot/conversations
        // /api/chatbot/conversations/{id}/messages

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;
        $sub = $segments[4] ?? null;

        if ($resource === 'conversations') {
            if ($id && $sub === 'messages' && $method === 'POST') {
                $this->sendMessage($id);
                return;
            }
            if ($id && $sub === 'messages' && $method === 'GET') {
                $this->getMessages($id);
                return;
            }
            if ($method === 'POST') {
                $this->startConversation();
                return;
            }
            if ($method === 'GET') {
                $this->listConversations();
                return;
            }
        }
        
        // Admin/Support routes to list all conversations
        if ($resource === 'admin-conversations') {
             if ($method === 'GET') {
                 $this->listAllConversations();
                 return;
             }
        }

        Response::error('Ruta no encontrada', 404);
    }

    private function startConversation()
    {
        $userId = Auth::userId();
        
        // Check if there is an active conversation
        $stmt = $this->pdo->prepare("SELECT id FROM chatbot_conversations WHERE user_id = :uid AND status = 'active' LIMIT 1");
        $stmt->execute([':uid' => $userId]);
        $existing = $stmt->fetchColumn();

        if ($existing) {
            Response::json(['id' => $existing, 'message' => 'Continuando conversación existente']);
            return;
        }

        $id = Str::uuid();
        $stmt = $this->pdo->prepare("INSERT INTO chatbot_conversations (id, user_id) VALUES (:id, :uid)");
        $stmt->execute([':id' => $id, ':uid' => $userId]);

        // Initial greeting
        $this->addBotMessage($id, "¡Hola! Soy el asistente virtual de Spectra. ¿En qué puedo ayudarte hoy?");

        Response::json(['id' => $id, 'message' => 'Conversación iniciada']);
    }

    private function listConversations()
    {
        $userId = Auth::userId();
        
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM chatbot_conversations WHERE user_id = :uid");
        $countStmt->execute([':uid' => $userId]);
        $total = $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM chatbot_conversations WHERE user_id = :uid ORDER BY updated_at DESC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':uid', $userId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }
    
    private function listAllConversations()
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'], ['super_admin', 'support'])) {
            Response::error('No autorizado', 403);
            return;
        }

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $offset = ($page - 1) * $limit;

        $countStmt = $this->pdo->query("SELECT COUNT(*) FROM chatbot_conversations WHERE status = 'active'");
        $total = $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("
            SELECT c.*, u.full_name as user_name, u.email as user_email 
            FROM chatbot_conversations c
            JOIN users u ON c.user_id = u.id
            WHERE c.status = 'active'
            ORDER BY c.updated_at DESC 
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function sendMessage(string $conversationId)
    {
        $user = Auth::user();
        $userId = $user['id'];
        $role = $user['platform_role'] ?? 'user';
        
        $data = json_decode(file_get_contents('php://input'), true);
        $message = trim($data['message'] ?? '');

        if (!$message) {
            Response::error('Mensaje vacío', 400);
            return;
        }

        // Validate conversation ownership or support role
        $stmt = $this->pdo->prepare("SELECT user_id FROM chatbot_conversations WHERE id = :id");
        $stmt->execute([':id' => $conversationId]);
        $ownerId = $stmt->fetchColumn();
        
        if (!$ownerId) {
             Response::error('Conversación no encontrada', 404);
             return;
        }

        $isSupport = in_array($role, ['super_admin', 'support']);

        if ($ownerId !== $userId && !$isSupport) {
            Response::error('No autorizado', 403);
            return;
        }
        
        $senderType = ($ownerId === $userId) ? 'user' : 'agent';

        // Store message
        $msgId = Str::uuid();
        $stmt = $this->pdo->prepare("INSERT INTO chatbot_messages (id, conversation_id, sender, message) VALUES (:id, :cid, :sender, :msg)");
        $stmt->execute([':id' => $msgId, ':cid' => $conversationId, ':sender' => $senderType, ':msg' => $message]);
        
        // Update conversation updated_at
        $this->pdo->prepare("UPDATE chatbot_conversations SET updated_at = NOW() WHERE id = ?")->execute([$conversationId]);

        // Trigger events
        $payload = [
            'id' => $msgId,
            'conversation_id' => $conversationId,
            'sender' => $senderType,
            'message' => $message,
            'created_at' => date('Y-m-d H:i:s'),
            'user_name' => $user['full_name'] ?? 'Usuario'
        ];
        $this->triggerPusherEvent('chat-' . $conversationId, 'new-message', $payload);
        $this->triggerSocketIOEvent('chat-' . $conversationId, 'new-message', $payload);

        // If user sent a message, notify support channel
        if ($senderType === 'user') {
            $update = [
                'conversation_id' => $conversationId,
                'last_message' => $message,
                'updated_at' => date('Y-m-d H:i:s')
            ];
            $this->triggerPusherEvent('support-chat-channel', 'conversation-updated', $update);
            $this->triggerSocketIOEvent('support-chat-channel', 'conversation-updated', $update);
            
            // Auto-reply logic (ONLY if sender is user)
            // We can disable auto-reply if an agent has already joined, but for now let's keep it simple
            // Or maybe check if the last message was from an agent? 
            // Let's keep the simple bot logic for now, agents can interrupt.
            $reply = $this->generateReply($message);
            $this->addBotMessage($conversationId, $reply);
            
            Response::json(['message' => 'Enviado', 'reply' => $reply]);
        } else {
            Response::json(['message' => 'Enviado']);
        }
    }

    private function getMessages(string $conversationId)
    {
        $user = Auth::user();
        $userId = $user['id'];
        $role = $user['platform_role'] ?? 'user';
        
        // Validate
        $stmt = $this->pdo->prepare("SELECT user_id FROM chatbot_conversations WHERE id = :id");
        $stmt->execute([':id' => $conversationId]);
        $ownerId = $stmt->fetchColumn();

        $isSupport = in_array($role, ['super_admin', 'support']);

        if ($ownerId !== $userId && !$isSupport) {
            Response::error('No autorizado', 403);
            return;
        }

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;
        
        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM chatbot_messages WHERE conversation_id LIKE :cid");
        $countStmt->execute([':cid' => $conversationId]);
        $total = $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM chatbot_messages WHERE conversation_id LIKE :cid ORDER BY created_at ASC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':cid', $conversationId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function addBotMessage($conversationId, $text)
    {
        $id = Str::uuid();
        $stmt = $this->pdo->prepare("INSERT INTO chatbot_messages (id, conversation_id, sender, message) VALUES (:id, :cid, 'bot', :msg)");
        $stmt->execute([':id' => $id, ':cid' => $conversationId, ':msg' => $text]);
        
        // Trigger events
        $payload = [
            'id' => $id,
            'conversation_id' => $conversationId,
            'sender' => 'bot',
            'message' => $text,
            'created_at' => date('Y-m-d H:i:s')
        ];
        $this->triggerPusherEvent('chat-' . $conversationId, 'new-message', $payload);
        $this->triggerSocketIOEvent('chat-' . $conversationId, 'new-message', $payload);
    }
    
    private function triggerPusherEvent($channel, $event, $data) {
        try {
            $pusher = new Pusher(
                $_ENV['PUSHER_APP_KEY'] ?? '',
                $_ENV['PUSHER_APP_SECRET'] ?? '',
                $_ENV['PUSHER_APP_ID'] ?? '',
                [
                    'cluster' => $_ENV['PUSHER_APP_CLUSTER'] ?? 'mt1',
                    'useTLS' => true
                ]
            );
            $pusher->trigger($channel, $event, $data);
        } catch (\Throwable $e) {
            // Log error silently
            error_log("Pusher error: " . $e->getMessage());
        }
    }

    private function triggerSocketIOEvent($channel, $event, $data) {
        $emitUrl = $_ENV['SOCKETIO_EMIT_URL'] ?? (isset($_SERVER['HTTP_HOST']) ? 'https://' . $_SERVER['HTTP_HOST'] . '/emit' : null);
        $apiKey = $_ENV['SOCKETIO_EMIT_SECRET'] ?? null;
        if (!$emitUrl || !$apiKey) {
            return;
        }
        try {
            $payload = json_encode([
                'channel' => $channel,
                'event' => $event,
                'payload' => $data
            ]);
            $ch = curl_init($emitUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'X-API-KEY: ' . $apiKey
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_TIMEOUT, 2);
            curl_exec($ch);
            curl_close($ch);
        } catch (\Throwable $e) {
            error_log("SocketIO emit error: " . $e->getMessage());
        }
    }

    private function generateReply($message)
    {
        $msg = strtolower($message);

        // Simple Keyword Matching
        if (strpos($msg, 'hola') !== false || strpos($msg, 'buenos') !== false) {
            return "¡Hola! ¿Cómo estás? Puedes preguntarme sobre tickets, pagos o perfil. O espera un momento y un agente te atenderá.";
        }

        if (strpos($msg, 'ticket') !== false || strpos($msg, 'soporte') !== false || strpos($msg, 'ayuda') !== false) {
            return "Para temas de soporte, puedes crear un ticket en la sección de 'Soporte'. ¿Quieres que te explique cómo?";
        }

        if (strpos($msg, 'pago') !== false || strpos($msg, 'factura') !== false || strpos($msg, 'salario') !== false) {
            return "Los temas de pagos se gestionan en la sección 'Finanzas'. Revisa tus 'Payslips' o 'Facturas'.";
        }

        if (strpos($msg, 'contrato') !== false) {
            return "Tus contratos están disponibles en la sección 'Contratos'.";
        }
        
        if (strpos($msg, 'crear') !== false && strpos($msg, 'ticket') !== false) {
             return "Ve a Soporte > Tickets y haz clic en 'Nuevo Ticket'.";
        }

        // Try to search KB if possible (simple search)
        // Note: In a real app we would call KnowledgeBaseController or search the table directly.
        $kbReply = $this->searchKnowledgeBase($message);
        if ($kbReply) {
            return "Encontré esto en nuestra base de conocimientos:\n\n" . $kbReply['title'] . "\n" . substr($kbReply['content'], 0, 100) . "...";
        }

        return "Lo siento, no entendí tu pregunta. Un agente de soporte ha sido notificado y te responderá pronto.";
    }

    private function searchKnowledgeBase($query)
    {
        try {
            // Simple full text search simulation with LIKE
            $stmt = $this->pdo->prepare("SELECT title, content FROM kb_articles WHERE is_published = 1 AND (title LIKE :q OR content LIKE :q) LIMIT 1");
            $stmt->execute([':q' => '%' . $query . '%']);
            return $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            return null;
        }
    }
}
