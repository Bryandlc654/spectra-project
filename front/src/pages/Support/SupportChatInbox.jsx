import React, { useState, useEffect, useRef, useMemo } from 'react';
import Pusher from 'pusher-js';
import { createApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastProvider';

export default function SupportChatInbox({ apiUrl }) {
  const { token, user } = useAuth();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();
  
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  
  const messagesEndRef = useRef(null);

  // Load conversations
  useEffect(() => {
    loadConversations();

    // Subscribe to global support channel for new/updated conversations
    let backendOrigin = '';
    try { backendOrigin = new URL(apiUrl).origin; } catch (_) {}
    const ioUrl = import.meta.env.VITE_SOCKETIO_URL || backendOrigin;
    const useSocketIO = !!(ioUrl && window && window.io);

    let cleanup = () => {};
    if (useSocketIO) {
      const socket = window.io(ioUrl, {
        transports: ['websocket', 'polling'],
        auth: { token },
      });
      socket.emit('join', { room: 'support-chat-channel' });
      const onUpdated = (data) => {
        setConversations(prev => {
          const exists = prev.find(c => c.id === data.conversation_id);
          if (exists) {
            const others = prev.filter(c => c.id !== data.conversation_id);
            return [{ ...exists, updated_at: data.updated_at }, ...others];
          } else {
            loadConversations(); 
            return prev;
          }
        });
      };
      socket.on('conversation-updated', onUpdated);
      cleanup = () => {
        try { socket.emit('leave', { room: 'support-chat-channel' }); } catch (_) {}
        try { socket.off('conversation-updated', onUpdated); } catch (_) {}
        try { socket.disconnect(); } catch (_) {}
      };
    } else {
      const pusherKey = import.meta.env.VITE_PUSHER_APP_KEY;
      const pusherCluster = import.meta.env.VITE_PUSHER_APP_CLUSTER;
      if (!pusherKey || !pusherCluster) return;
      const pusher = new Pusher(pusherKey, { 
        cluster: pusherCluster,
        forceTLS: true,
        enabledTransports: ['ws', 'wss', 'xhr_streaming', 'xhr_polling'],
        disableStats: true,
      });
      const channel = pusher.subscribe('support-chat-channel');
      const onUpdated = (data) => {
      setConversations(prev => {
        // Move updated conversation to top or add if not exists
        const exists = prev.find(c => c.id === data.conversation_id);
        if (exists) {
          const others = prev.filter(c => c.id !== data.conversation_id);
          return [{ ...exists, updated_at: data.updated_at }, ...others];
        } else {
            // If it's new and we don't have full data, we might need to reload or fetch single
            // For simplicity, reload list or just ignore if we don't want to fetch
            loadConversations(); 
            return prev;
        }
        });
      };
      channel.bind('conversation-updated', onUpdated);
      cleanup = () => {
        channel.unbind('conversation-updated', onUpdated);
        channel.unbind_all();
        channel.unsubscribe();
        pusher.disconnect();
      };
    }
    return cleanup;
  }, []);

  const loadConversations = async () => {
    try {
      const res = await api.get('/api/chatbot/admin-conversations');
      setConversations(res.data || []);
    } catch (e) {
      console.error(e);
      toast.error('Error cargando conversaciones');
    } finally {
      setLoadingList(false);
    }
  };

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedId) return;
    
    setMessages([]);
    loadMessages(selectedId);

    // Subscribe to specific conversation
    let backendOrigin2 = '';
    try { backendOrigin2 = new URL(apiUrl).origin; } catch (_) {}
    const ioUrl = import.meta.env.VITE_SOCKETIO_URL || backendOrigin2;
    const useSocketIO = !!(ioUrl && window && window.io);

    if (useSocketIO) {
      const socket = window.io(ioUrl, {
        transports: ['websocket', 'polling'],
        auth: { token },
      });
      const room = `chat-${selectedId}`;
      socket.emit('join', { room });
      const onMsg = (data) => {
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, data];
        });
        scrollToBottom();
      };
      socket.on('new-message', onMsg);
      return () => {
        try { socket.emit('leave', { room }); } catch (_) {}
        try { socket.off('new-message', onMsg); } catch (_) {}
        try { socket.disconnect(); } catch (_) {}
      };
    } else {
      const pusherKey = import.meta.env.VITE_PUSHER_APP_KEY;
      const pusherCluster = import.meta.env.VITE_PUSHER_APP_CLUSTER;
      if (!pusherKey || !pusherCluster) return;
      const pusher = new Pusher(pusherKey, { 
        cluster: pusherCluster,
        forceTLS: true,
        enabledTransports: ['ws', 'wss', 'xhr_streaming', 'xhr_polling'],
        disableStats: true,
      });
      const channel = pusher.subscribe(`chat-${selectedId}`);
      const onMsg = (data) => {
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, data];
        });
        scrollToBottom();
      };
      channel.bind('new-message', onMsg);
      return () => {
        channel.unbind('new-message', onMsg);
        channel.unbind_all();
        channel.unsubscribe();
        pusher.disconnect();
      };
    }
  }, [selectedId]);

  const loadMessages = async (id) => {
    try {
      const res = await api.get(`/api/chatbot/conversations/${id}/messages`);
      setMessages(res.data || []);
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      console.error(e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedId) return;

    const text = inputText;
    setInputText('');

    try {
      await api.post(`/api/chatbot/conversations/${selectedId}/messages`, { message: text });
      // Pusher will handle the update
    } catch (e) {
      toast.error('Error enviando mensaje');
    }
  };

  const selectedConversation = conversations.find(c => c.id === selectedId);

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden m-4 md:m-8">
      {/* Sidebar List */}
      <div className={`w-full md:w-80 border-r border-slate-200 flex flex-col ${selectedId ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-slate-700">Conversaciones Activas</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList && <div className="p-4 text-center text-slate-500">Cargando...</div>}
          {!loadingList && conversations.length === 0 && (
            <div className="p-4 text-center text-slate-500">No hay chats activos</div>
          )}
          {conversations.map(c => (
            <div 
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition ${selectedId === c.id ? 'bg-indigo-50 border-indigo-200' : ''}`}
            >
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-800 text-sm truncate">{c.user_name || 'Usuario'}</span>
                <span className="text-xs text-slate-400">
                  {new Date(c.updated_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </span>
              </div>
              <div className="text-xs text-slate-500 truncate">{c.user_email}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-slate-50 ${!selectedId ? 'hidden md:flex' : 'flex'}`}>
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <i className="bi bi-chat-dots text-4xl mb-2 block"></i>
              <p>Selecciona una conversación para comenzar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedId(null)} className="md:hidden text-slate-500">
                  <i className="bi bi-arrow-left text-xl"></i>
                </button>
                <div>
                  <h3 className="font-bold text-slate-800">{selectedConversation?.user_name}</h3>
                  <p className="text-xs text-slate-500">{selectedConversation?.user_email}</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => {
                const isMe = msg.sender === 'agent'; // Or specific agent ID check if needed
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm shadow-sm ${
                      isMe 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <div className={`text-xs mt-1 text-right ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        {msg.sender === 'bot' && ' (Bot)'}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Escribe una respuesta..."
                  className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
                <button 
                  type="submit" 
                  disabled={!inputText.trim()}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  <i className="bi bi-send-fill"></i>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
