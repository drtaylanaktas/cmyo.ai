'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, FileText, User, Sparkles, Copy, Check, Mic, MicOff, History, MessageSquare, Plus, ArrowLeft, Trash2, Edit2, Pin, MoreHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import NeuralBackground from '@/components/NeuralBackground';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { checkProfanity } from '@/lib/badwords';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<'student' | 'academic'>('student'); // Keep for API compatibility but derive from user
  const [currentUser, setCurrentUser] = useState<any>(null);

  const { isListening, transcript, startListening, stopListening, resetTranscript, hasSupport } = useVoiceInput();
  const [weatherData, setWeatherData] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // We keep track of the input value when listening starts so we can append to it
  const inputRef = useRef(input);
  const router = useRouter(); // Initialize useRouter

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auth check useEffect
  useEffect(() => {
    const userStr = localStorage.getItem('cmyo_user');
    if (!userStr) {
      router.push('/login');
    } else {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      setUserRole(user.role);
    }
  }, [router]);

  // Fetch History
  const fetchHistory = async () => {
    if (!currentUser?.email) return;
    try {
      const res = await fetch(`/api/chat/history?email=${currentUser.email}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchHistory();
    }
  }, [currentUser]);

  const loadChat = async (id: string) => {
    setIsLoading(true);
    setShowHistory(false);
    try {
      const res = await fetch(`/api/chat/${id}`); // Note: folder structure is [id] but nextjs handles it directly? No, wait. 
      // Actually my route file is at app/api/chat/[id]/route.ts. 
      // However due to how Next.js routing works, I might need to clarify the fetch URL. 
      // If the folder is called [id], then /api/chat/123 works.

      if (res.ok) {
        const data = await res.json();
        // Map DB messages to UI messages
        const uiMessages = data.messages.map((m: any) => ({
          id: m.id || Date.now().toString(),
          role: m.role,
          content: m.content
        }));
        setMessages(uiMessages);
        setConversationId(id);
      }
    } catch (e) {
      console.error("Failed to load chat", e);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  };

  // Chat Management Functions
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [historyMenuOpen, setHistoryMenuOpen] = useState<string | null>(null); // Stores ID of chat with open menu

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Bu sohbeti silmek istediğinizden emin misiniz?')) return;

    try {
      const res = await fetch('/api/chat/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, email: currentUser.email })
      });

      if (res.ok) {
        setHistory(prev => prev.filter(c => c.id !== id));
        if (conversationId === id) startNewChat();
      }
    } catch (error) {
      console.error("Delete failed", error);
    }
  };

  const handlePinChat = async (e: React.MouseEvent, id: string, currentPinStatus: boolean) => {
    e.stopPropagation();
    // Optimistic update
    setHistory(prev => {
      const chat = prev.find(c => c.id === id);
      if (chat) chat.is_pinned = !currentPinStatus;
      return [...prev].sort((a, b) => (b.is_pinned === a.is_pinned ? 0 : b.is_pinned ? 1 : -1));
    });
    setHistoryMenuOpen(null);

    try {
      await fetch('/api/chat/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, email: currentUser.email, isPinned: !currentPinStatus })
      });
      fetchHistory(); // Sync with server to be sure
    } catch (error) {
      console.error("Pin failed", error);
    }
  };

  const startRenaming = (e: React.MouseEvent, chat: any) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
    setHistoryMenuOpen(null);
  }

  const handleRenameChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChatId || !editTitle.trim()) return;

    const id = editingChatId;
    const title = editTitle.trim();

    // Optimistic update
    setHistory(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    setEditingChatId(null);

    try {
      await fetch('/api/chat/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, email: currentUser.email, title })
      });
    } catch (error) {
      console.error("Rename failed", error);
    }
  };

  // Weather & Location Logic
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        let locationName = "Bilinmeyen Konum";

        // 1. Get readable address (Reverse Geocoding)
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=tr`, {
            headers: {
              'User-Agent': 'CMYO-AI-Web/1.0'
            }
          });
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            // Prioritize District/City/Town
            locationName = geoData.address.town || geoData.address.city || geoData.address.province || geoData.address.district || "Bilinmeyen Bölge";
            if (geoData.address.suburb) locationName += `, ${geoData.address.suburb}`;
          }
        } catch (e) {
          console.error("Reverse geocoding failed", e);
        }

        // 2. Get Weather
        try {
          const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`);
          if (response.ok) {
            const data = await response.json();
            setWeatherData({
              temp: data.current.temperature_2m,
              code: data.current.weather_code,
              unit: data.current_units.temperature_2m,
              lat: latitude,
              lon: longitude,
              locationName: locationName // Add the readable name
            });
          }
        } catch (e) {
          console.error("Failed to fetch weather", e);
        }
      }, (error) => {
        console.log("Location access denied or error:", error);
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update input when transcript changes
  useEffect(() => {
    if (isListening && transcript) {
      // Append transcript to the input value captured when listening started
      const prefix = inputRef.current ? inputRef.current.trim() + ' ' : '';
      setInput(prefix + transcript);
    }
  }, [transcript, isListening]);

  // Capture input state when starting to listen
  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      inputRef.current = input; // Capture current input
      resetTranscript();
      startListening();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('cmyo_user');
    router.push('/login');
  };



  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTimer, setBlockTimer] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBlocked && blockTimer > 0) {
      interval = setInterval(() => {
        setBlockTimer((prev) => prev - 1);
      }, 1000);
    } else if (blockTimer === 0) {
      setIsBlocked(false);
    }
    return () => clearInterval(interval);
  }, [isBlocked, blockTimer]);

  const handleSend = async () => {
    if (!input.trim() || isBlocked) return;

    if (checkProfanity(input)) {
      setIsBlocked(true);
      setBlockTimer(60); // 1 minute
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: '⚠️ Sohbet kurallarına aykırı ifadeler tespit edildi. Sisteme erişiminiz 1 dakika süreyle kısıtlanmıştır.',
      }]);
      setInput('');
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Filter history to send (exclude error messages or local UI states if any, but simplified here)
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: history, user: currentUser, weather: weatherData, conversationId }),
      });

      let botContent = '';
      let attachment = null;

      // Try to parse JSON, but handle HTML errors (Vercel crashes) too
      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        // Non-JSON response (likely Vercel 500/504 HTML error)
        const text = await response.text();
        throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}...`);
      }

      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}`);
      }

      botContent = data.reply || 'Cevap alınamadı.';

      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        fetchHistory(); // Refresh history list
      }

      // Check for JSON block (PDF Generation Trigger)
      const jsonMatch = botContent.match(/JSON_START\s*([\s\S]*?)\s*JSON_END/);
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1];
          const actionData = JSON.parse(jsonStr);
          botContent = botContent.replace(/JSON_START[\s\S]*?JSON_END/, '').trim();

          if (actionData.action === 'generate_file' || actionData.action === 'generate_pdf') {
            setMessages((prev) => [...prev, {
              id: 'gen-' + Date.now(),
              role: 'assistant',
              content: `📝 "${actionData.filename}" belgesi hazırlanıyor...`
            }]);

            const fileRes = await fetch('/api/generate-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename: actionData.filename, data: actionData.data })
            });

            if (fileRes.ok) {
              const blob = await fileRes.blob();
              const url = window.URL.createObjectURL(blob);
              attachment = url;

              const isPdf = actionData.filename.toLowerCase().endsWith('.pdf');
              const extension = isPdf ? 'pdf' : 'docx';

              const a = document.createElement('a');
              a.href = url;
              a.download = `${actionData.filename.replace(/\.[^/.]+$/, "")}_Gen.${extension}`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              botContent += `\n\n✅ Belgeniz hazırlandı ve indirildi (${isPdf ? 'PDF' : 'Word'} formatında).`;
            } else {
              botContent += "\n\n❌ Belge oluşturulurken hata oluştu.";
            }
          }
        } catch (e) {
          console.error("JSON Parse Error", e);
        }
      }

      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: botContent,
        attachments: attachment ? [attachment] : undefined
      }]);

    } catch (error: any) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Bir hata oluştu: ${error.message || 'Bilinmeyen hata'}`, // Show REAL error
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(err => {
        console.error('Async: Could not copy text: ', err);
      });
    } else {
      // Fallback for insecure contexts (like HTTP emulator)
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-[#050a14] text-white relative">
      <NeuralBackground />

      {/* Sidebar - Desktop (Permanent) & Mobile (Drawer) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-[#050a14]/95 backdrop-blur-xl border-r border-blue-500/20 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:bg-transparent md:backdrop-blur-none
        ${showHistory ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full p-4">
          {/* Sidebar Header */}
          <div className="flex items-center gap-3 mb-6 px-2">
            <div className="w-10 h-10 relative">
              <Image src="/logo.png" alt="Logo" fill className="object-contain" />
            </div>
            <span className="font-bold text-lg tracking-tight">KAEU.AI</span>
            <button
              onClick={() => setShowHistory(false)}
              className="md:hidden ml-auto text-slate-400"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          {/* New Chat Button */}
          <button
            onClick={() => {
              startNewChat();
              if (window.innerWidth < 768) setShowHistory(false);
            }}
            className="flex items-center gap-3 w-full p-3 mb-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-500/20 group"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Yeni Sohbet</span>
          </button>

          {/* History List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Geçmiş</h3>
            {history.length === 0 ? (
              <div className="text-slate-500 text-sm p-4 text-center border border-dashed border-slate-800 rounded-xl">
                Henüz sohbet yok.
              </div>
            ) : (
              history.map((chat) => (
                <div key={chat.id} className="relative group">
                  {editingChatId === chat.id ? (
                    <form onSubmit={handleRenameChat} className="p-2 flex items-center gap-2">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => setEditingChatId(null)}
                        className="w-full bg-slate-900 border border-blue-500/50 rounded px-2 py-1 text-xs text-white focus:outline-none"
                      />
                      <button type="submit" onMouseDown={(e) => e.preventDefault()} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        loadChat(chat.id);
                        if (window.innerWidth < 768) setShowHistory(false);
                      }}
                      className={`w-full text-left p-3 pr-10 rounded-lg transition-all text-sm flex items-start gap-2 group relative ${conversationId === chat.id
                        ? 'bg-blue-900/40 text-blue-100 border border-blue-500/30'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                    >
                      <div className="mt-0.5 shrink-0 relative">
                        {chat.is_pinned ? <Pin className="w-3.5 h-3.5 text-blue-400 rotate-45" /> : <MessageSquare className="w-4 h-4 opacity-70" />}
                      </div>
                      <span className="truncate flex-1">{chat.title}</span>

                      {/* Hover Actions */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#050a14] shadow-[-10px_0_10px_#050a14]">
                        <div
                          onClick={(e) => handleDeleteChat(e, chat.id)}
                          className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryMenuOpen(historyMenuOpen === chat.id ? null : chat.id);
                          }}
                          className={`p-1.5 hover:bg-blue-500/20 rounded transition-colors ${historyMenuOpen === chat.id ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-blue-400'}`}
                          title="Ayarlar"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Settings Menu */}
                  <AnimatePresence>
                    {historyMenuOpen === chat.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setHistoryMenuOpen(null)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute right-0 top-full mt-1 w-32 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
                        >
                          <button
                            onClick={(e) => startRenaming(e, chat)}
                            className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2"
                          >
                            <Edit2 className="w-3 h-3" /> Yeniden Adlandır
                          </button>
                          <button
                            onClick={(e) => handlePinChat(e, chat.id, chat.is_pinned)}
                            className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2"
                          >
                            <Pin className={`w-3 h-3 ${chat.is_pinned ? 'fill-current' : ''}`} />
                            {chat.is_pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>

          {/* User Profile (Sidebar Footer) */}
          {currentUser && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div
                onClick={() => router.push('/profile')}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/50 cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full border border-slate-700 overflow-hidden bg-slate-800 relative shrink-0">
                  {currentUser.avatar ? (
                    <Image src={currentUser.avatar} alt="Profile" fill className="object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-slate-400 m-auto mt-2" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">
                    {currentUser.title && <span className="text-blue-400 font-normal mr-1">{currentUser.title}</span>}
                    {currentUser.name} {currentUser.surname}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full md:w-auto overflow-hidden">

        {/* Watermark Logo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <div className="relative w-[20rem] h-[20rem] md:w-[30rem] md:h-[30rem] opacity-[0.03]">
            <Image src="/logo.png" alt="Watermark" fill className="object-contain" />
          </div>
        </div>

        {/* Header (Simplified) */}
        <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-white/5 bg-[#050a14]/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-2">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setShowHistory(true)}
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
            >
              <History className="w-6 h-6" />
            </button>
            <div className="md:hidden font-bold">KAEU.AI</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 transition-colors"
              title="Çıkış Yap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
            </button>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth relative z-10">
          <AnimatePresence initial={false}>
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-80 mt-[-50px] relative z-10">
                <div className="relative w-32 h-32 mb-6 animate-float">
                  <Image
                    src="/logo.png"
                    alt="KAEU Logo"
                    fill
                    className="object-contain drop-shadow-[0_0_25px_rgba(0,128,255,0.3)]"
                  />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">KAEU.AI Asistan</h2>
                <p className="text-slate-400 max-w-md">
                  Kırşehir Ahi Evran Üniversitesi hakkında merak ettiklerinizi sorabilir, akademik ve idari süreçler hakkında yardım alabilirsiniz.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[85%] md:max-w-[75%] gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 border overflow-hidden mt-1 ${msg.role === 'assistant'
                    ? 'border-blue-500/30 bg-slate-900'
                    : 'border-slate-600 bg-slate-800'
                    }`}>
                    {msg.role === 'assistant' ? (
                      <Image src="/logo.png" alt="Bot" width={40} height={40} className="w-full h-full object-cover" />
                    ) : (
                      currentUser?.avatar ? (
                        <div className="relative w-full h-full">
                          <Image src={currentUser.avatar} alt="User" fill className="object-cover" />
                        </div>
                      ) : <User className="w-5 h-5 text-slate-300" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={`p-4 md:p-5 rounded-2xl relative overflow-hidden group ${msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-slate-800/80 text-blue-50 rounded-tl-none border border-white/5'
                    }`}>

                    {/* Copy Button */}
                    <button
                      onClick={() => copyToClipboard(msg.content)}
                      className={`absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === 'user' ? 'text-blue-200 hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <div className="prose prose-invert prose-sm max-w-none">
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <div className="flex justify-start w-full gap-4 pl-2">
              <div className="w-8 h-8 rounded-full bg-slate-900 border border-blue-500/30 flex items-center justify-center shrink-0 overflow-hidden">
                <Image src="/logo.png" alt="Loading" width={32} height={32} className="w-full h-full object-cover animate-pulse" />
              </div>
              <div className="bg-slate-800/50 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-700/50 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></span>
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-[#050a14] border-t border-white/5 shrink-0 z-20">
          <div className="max-w-3xl mx-auto relative flex gap-3">
            {hasSupport && (
              <button
                type="button"
                onClick={handleMicClick}
                className={`p-3 rounded-xl transition-all flex items-center justify-center shrink-0 ${isListening
                  ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700'
                  }`}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex-1 relative"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isBlocked}
                placeholder={isBlocked ? `Kısıtlandı: ${blockTimer}s` : "Bir şeyler yazın..."}
                className="w-full bg-slate-800 border-0 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:bg-slate-800/80 transition-all pr-12"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 rounded-lg text-white hover:bg-blue-500 disabled:opacity-50 disabled:bg-transparent disabled:text-slate-500 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
          <div className="text-center mt-2">
            <p className="text-[10px] text-slate-600">KAEU.AI v1.0 (beta) - Hatalar olabilir.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
