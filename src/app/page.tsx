'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, FileText, User, Sparkles, Copy, Check, Mic, MicOff, History, MessageSquare, Plus, ArrowLeft, Trash2, Edit2, Pin, MoreHorizontal, X, Paperclip, Cloud, CloudRain, Sun, CloudSnow, Zap, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { checkProfanity } from '@/lib/badwords';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Robust regex for stripping technical JSON action blocks from the UI
const JSON_CLEAN_REGEX = /(?:```(?:json)?\s*)?JSON_START\s*[\s\S]*?JSON_END(?:\s*```)?/gi;
const stripJsonBlock = (content: string) => content.replace(JSON_CLEAN_REGEX, '').trim();

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
  createdAt?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string, content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userRole, setUserRole] = useState<'student' | 'academic' | 'admin'>('student'); // Keep for API compatibility but derive from user
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);

  const { isListening, transcript, startListening, stopListening, resetTranscript, hasSupport } = useVoiceInput();
  const [weatherData, setWeatherData] = useState<any>(null);
  const [locationPermission, setLocationPermission] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [showLocationBanner, setShowLocationBanner] = useState(false);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTelegramBanner, setShowTelegramBanner] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const bannerDismissed = localStorage.getItem('telegram_banner_dismissed');
    if (!bannerDismissed) {
      setShowTelegramBanner(true);
    }
  }, []);

  const dismissTelegramBanner = () => {
    setShowTelegramBanner(false);
    localStorage.setItem('telegram_banner_dismissed', 'true');
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
  const fetchWeatherAndLocation = async (latitude: number, longitude: number) => {
    let locationName = "Bilinmeyen Konum";
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=tr`, {
        headers: { 'User-Agent': 'CMYO-AI-Web/1.0' }
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        locationName = geoData.address.town || geoData.address.city || geoData.address.province || geoData.address.district || "Bilinmeyen Bölge";
        if (geoData.address.suburb) locationName += `, ${geoData.address.suburb}`;
      }
    } catch (e) {
      console.error("Reverse geocoding failed", e);
    }
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
          locationName
        });
      }
    } catch (e) {
      console.error("Failed to fetch weather", e);
    }
  };

  const requestLocation = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocationPermission('granted');
        setShowLocationBanner(false);
        await fetchWeatherAndLocation(latitude, longitude);
        if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            (pos) => fetchWeatherAndLocation(pos.coords.latitude, pos.coords.longitude),
            () => {}
          );
        }, 30 * 60 * 1000);
      },
      () => {
        setLocationPermission('denied');
        setShowLocationBanner(false);
      }
    );
  };

  const dismissLocationBanner = () => {
    setShowLocationBanner(false);
    localStorage.setItem('location_banner_dismissed', 'true');
  };

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const checkPermission = async () => {
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          if (result.state === 'granted') {
            setLocationPermission('granted');
            requestLocation();
          } else if (result.state === 'denied') {
            setLocationPermission('denied');
          } else {
            setLocationPermission('prompt');
            if (!localStorage.getItem('location_banner_dismissed')) {
              setShowLocationBanner(true);
            }
          }
        } else {
          requestLocation();
        }
      } catch {
        // permissions API not supported — fall back to direct request
        requestLocation();
      }
    };
    checkPermission();
    return () => {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload-and-parse', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Dosya yüklenemedi.');
        return;
      }

      setAttachment({
        name: data.filename,
        content: data.text
      });

    } catch (error) {
      console.error('Upload failed:', error);
      alert('Dosya yüklenirken bir hata oluştu.');
    } finally {
      setIsUploading(false);
      // Reset input so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Silent fail — still clear client-side
    }
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
      attachments: attachment ? [attachment.name] : undefined
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    const currentAttachment = attachment; // Store ref to send
    setAttachment(null); // Clear attachment UI immediately
    setIsLoading(true);

    try {
      // Filter history to send (exclude error messages or local UI states if any, but simplified here)
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // If there's an attachment, pre-pend it to the last message content or add as context
      let messageToSend = input;
      if (currentAttachment) {
        messageToSend = `[BELGE İÇERİĞİ BAŞLANGICI - ${currentAttachment.name}]\n${currentAttachment.content}\n[BELGE İÇERİĞİ SONU]\n\n${input}`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSend, history: history, user: currentUser, weather: weatherData, conversationId }),
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
        if (response.status === 429) setRemainingQuota(0);
        throw new Error(data.error || `API Error: ${response.statusText}`);
      }

      botContent = data.reply || 'Cevap alınamadı.';

      if (data.remainingQuota !== undefined && data.remainingQuota !== null) {
            setRemainingQuota(data.remainingQuota);
      }

      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        fetchHistory(); // Refresh history list
      }

      // Check for JSON block (PDF Generation Trigger)
      const jsonMatch = botContent.match(JSON_CLEAN_REGEX);
      if (jsonMatch) {
        try {
          const lastMatch = jsonMatch[jsonMatch.length - 1];
          const jsonInside = lastMatch.match(/JSON_START\s*([\s\S]*?)\s*JSON_END/i);
          
          if (jsonInside) {
            const jsonStr = jsonInside[1].trim();
            const actionData = JSON.parse(jsonStr);
            const targetFilename = actionData.filename || actionData.file_name;
            
            botContent = stripJsonBlock(botContent);

            if ((actionData.action === 'generate_file' || actionData.action === 'generate_pdf') && targetFilename) {
              setMessages((prev) => [...prev, {
                id: 'gen-' + Date.now(),
                role: 'assistant',
                content: `📝 "${targetFilename}" belgesi hazırlanıyor...`
              }]);

              const fileRes = await fetch('/api/generate-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: targetFilename, data: actionData.data })
              });

              if (fileRes.ok) {
                const blob = await fileRes.blob();
                const url = window.URL.createObjectURL(blob);
                attachment = url;

                const isPdf = targetFilename.toLowerCase().endsWith('.pdf');
                const extension = isPdf ? 'pdf' : 'docx';

                const a = document.createElement('a');
                a.href = url;
                a.download = `${targetFilename.replace(/\.[^/.]+$/, "")}_Gen.${extension}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                botContent += `\n\n✅ Belgeniz hazırlandı ve indirildi (${isPdf ? 'PDF' : 'Word'} formatında).`;
              } else {
                botContent += "\n\n❌ Belge oluşturulurken hata oluştu.";
              }
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

  const copyToClipboard = (text: string, msgId: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(err => {
        console.error('Could not copy text: ', err);
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (err) {
        console.error('Fallback: unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };

  // Weather icon helper
  const getWeatherIcon = (code: number) => {
    if (code === 0 || code === 1) return <Sun className="w-4 h-4 text-yellow-400" />;
    if (code >= 2 && code <= 3) return <Cloud className="w-4 h-4 text-slate-400" />;
    if (code >= 51 && code <= 67) return <CloudRain className="w-4 h-4 text-blue-400" />;
    if (code >= 71 && code <= 77) return <CloudSnow className="w-4 h-4 text-blue-200" />;
    if (code >= 95) return <Zap className="w-4 h-4 text-yellow-400" />;
    return <Cloud className="w-4 h-4 text-slate-400" />;
  };

  // Quick start suggestions
  const quickSuggestions = [
    { icon: '📅', text: 'Ders programını göster', query: 'Haftalık ders programını gösterir misin?' },
    { icon: '📝', text: 'Staj başvurusu nasıl yapılır?', query: 'Staj başvurusu nasıl yapılır?' },
    { icon: '🏫', text: 'Çiçekdağı MYO hakkında', query: 'Çiçekdağı MYO hakkında bilgi ver' },
    { icon: '📋', text: 'Kayıt dondurma süreci', query: 'Kayıt dondurma süreci nasıl işliyor?' },
  ];

  return (
    <div className="fixed inset-0 flex w-full overflow-hidden bg-[#050a14] text-white">

      {/* Sidebar - Desktop (Permanent) & Mobile (Drawer) */}
      <aside className={`
        fixed inset-y-0 z-50 w-72 bg-[#050a14]/95 backdrop-blur-xl border-r border-blue-500/20 transition-all duration-300 ease-in-out
        md:relative md:left-0 md:bg-transparent md:backdrop-blur-none
        ${showHistory ? 'left-0 shadow-[20px_0_50px_rgba(0,0,0,0.5)]' : '-left-[100%] md:left-0'}
      `}>
        <div className="flex flex-col h-full p-4">
          {/* Sidebar Header */}
          <div className="flex items-center gap-3 mb-6 px-2">
            <div className="w-10 h-10 relative">
              <Image src="/logo.png" alt="Logo" fill className="object-contain" />
            </div>
            <span className="font-bold text-lg tracking-tight">ÇMYO.AI</span>
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
                    <>
                      <button
                        onClick={() => {
                          loadChat(chat.id);
                          if (window.innerWidth < 768) setShowHistory(false);
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-all text-sm flex items-center gap-2 overflow-hidden ${conversationId === chat.id
                          ? 'bg-blue-900/40 text-blue-100 border border-blue-500/30'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                          }`}
                      >
                        <div className="shrink-0">
                          {chat.is_pinned ? <Pin className="w-3.5 h-3.5 text-blue-400 rotate-45" /> : <MessageSquare className="w-4 h-4 opacity-70" />}
                        </div>
                        <span className="truncate flex-1">{chat.title}</span>
                      </button>

                      {/* Hover Actions — single minimal button */}
                      <div className="absolute inset-y-0 right-1 flex items-center z-10">
                        <button
                          onClick={(e) => { e.stopPropagation(); setHistoryMenuOpen(historyMenuOpen === chat.id ? null : chat.id); }}
                          className={`p-1.5 rounded-md transition-all ${historyMenuOpen === chat.id ? 'opacity-100 text-white bg-white/10' : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white hover:bg-white/10'}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}

                  {/* Settings Menu */}
                  <AnimatePresence>
                    {historyMenuOpen === chat.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setHistoryMenuOpen(null)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -6 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-0 top-full mt-1.5 w-44 bg-[#0d1424] border border-slate-700/60 rounded-xl shadow-2xl z-50 overflow-hidden py-1"
                        >
                          <button
                            onClick={(e) => startRenaming(e, chat)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-400" /> Yeniden Adlandır
                          </button>
                          <button
                            onClick={(e) => handlePinChat(e, chat.id, chat.is_pinned)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                          >
                            <Pin className={`w-3.5 h-3.5 text-slate-400 ${chat.is_pinned ? 'fill-current' : ''}`} />
                            {chat.is_pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                          </button>
                          <div className="border-t border-slate-700/50 my-1" />
                          <button
                            onClick={(e) => { handleDeleteChat(e, chat.id); setHistoryMenuOpen(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Sil
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

      {/* Mobile Sidebar Overlay (Click to close) */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowHistory(false);
            }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden cursor-pointer"
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full h-full max-w-full overflow-hidden">

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
            <div className="md:hidden font-bold">ÇMYO.AI</div>
          </div>

          <div className="flex items-center gap-3">
            {weatherData && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs text-slate-300">
                {getWeatherIcon(weatherData.code)}
                <span className="font-medium">{Math.round(weatherData.temp)}{weatherData.unit}</span>
                <span className="text-slate-500 hidden md:inline">{weatherData.locationName}</span>
              </div>
            )}
            {!weatherData && (locationPermission === 'denied' || locationPermission === 'prompt') && (
              <button
                onClick={() => {
                  if (locationPermission === 'denied') {
                    alert('Konum iznini etkinleştirmek için tarayıcı adres çubuğundaki kilit/bilgi ikonuna tıklayın, konum iznini "İzin Ver" olarak değiştirin ve sayfayı yenileyin.');
                  } else {
                    localStorage.removeItem('location_banner_dismissed');
                    setShowLocationBanner(true);
                    requestLocation();
                  }
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                title={locationPermission === 'denied' ? 'Tarayıcı ayarlarından konum iznini etkinleştirin' : 'Konum iznine izin ver'}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{locationPermission === 'denied' ? 'Konum engellendi' : 'Konum izni ver'}</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 transition-colors"
              title="Çıkış Yap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
            </button>
          </div>
        </header>

        {/* Telegram Announcement Banner */}
        <AnimatePresence>
          {showTelegramBanner && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="relative z-20 w-full bg-gradient-to-r from-blue-900/40 via-blue-800/30 to-blue-900/40 border-b border-blue-500/20 backdrop-blur-md overflow-hidden"
            >
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay"></div>
              <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.892-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mt-0.5">ÇMYO.AI Artık Telegram'da!</h3>
                    <p className="text-xs text-blue-200/80">Yapay zeka asistanımızı doğrudan Telegram üzerinden kullanabilirsiniz.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <a 
                    href="https://t.me/CmyoResmiBot" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-lg shadow-blue-500/20"
                  >
                    <span>Telegram'a Git</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </a>
                  <button 
                    onClick={dismissTelegramBanner}
                    className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors"
                    title="Kapat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Location Permission Banner */}
        <AnimatePresence>
          {showLocationBanner && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="relative z-20 w-full bg-slate-800/60 border-b border-slate-700/40 backdrop-blur-md overflow-hidden"
            >
              <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-300">Hava durumu ve konuma dayalı soruları yanıtlayabilmek için konum izninize ihtiyaç duyuluyor.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={requestLocation}
                    className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    İzin Ver
                  </button>
                  <button
                    onClick={dismissLocationBanner}
                    className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors"
                    title="Kapat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth relative z-10 w-full min-h-0">
          <div className="max-w-3xl mx-auto space-y-6">
            <AnimatePresence initial={false}>
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-80 mt-[-50px] relative z-10">
                  <div className="relative w-32 h-32 mb-6 animate-float">
                    <Image
                      src="/logo.png"
                      alt="ÇMYO Logo"
                      fill
                      className="object-contain drop-shadow-[0_0_25px_rgba(0,128,255,0.3)]"
                    />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">ÇMYO.AI Asistan</h2>
                  <p className="text-slate-400 max-w-md mb-8">
                    Çiçekdağı MYO hakkında merak ettiklerinizi sorabilir, akademik ve idari süreçler hakkında yardım alabilirsiniz.
                  </p>

                  {/* Quick Start Cards */}
                  <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                    {quickSuggestions.map((s, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => { setInput(s.query); }}
                        className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-blue-500/30 rounded-xl text-left text-sm text-slate-300 hover:text-white transition-all group"
                      >
                        <span className="text-lg">{s.icon}</span>
                        <span className="group-hover:text-blue-300 transition-colors">{s.text}</span>
                      </motion.button>
                    ))}
                  </div>
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
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className={`absolute top-2 right-2 p-1.5 rounded transition-all ${copiedId === msg.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${msg.role === 'user' ? 'text-blue-200 hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-700'
                          }`}
                      >
                        {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      {/* Attachment Badge */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {msg.attachments.map((att, idx) => (
                            <div
                              key={idx}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${msg.role === 'user'
                                ? 'bg-blue-500/30 text-blue-100 border border-blue-400/20'
                                : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
                                }`}
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="max-w-[200px] truncate">{att}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.role === 'user' ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-blue-200 prose-strong:text-blue-100 prose-a:text-blue-400 prose-code:text-green-300 prose-code:bg-slate-900/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-900/80 prose-pre:border prose-pre:border-slate-700/50 prose-table:border-collapse [&_th]:bg-slate-800/50 [&_th]:border [&_th]:border-slate-700/50 [&_th]:px-3 [&_th]:py-2 [&_td]:border [&_td]:border-slate-700/50 [&_td]:px-3 [&_td]:py-2 prose-li:marker:text-blue-400">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripJsonBlock(msg.content)}</ReactMarkdown>
                        </div>
                      )}
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
        </div>

        {/* Input Area */}
        <div className="mt-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] w-full bg-[#050a14] border-t border-white/5 shrink-0 z-20">
          <div className="max-w-3xl mx-auto w-full relative flex gap-2 sm:gap-3 items-end">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".docx,.pdf"
              className="hidden"
            />

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

            <button
              type="button"
              onClick={handleAttachClick}
              disabled={isUploading}
              className={`p-3 rounded-xl transition-all flex items-center justify-center shrink-0 ${isUploading
                ? 'bg-blue-500/20 text-blue-400 animate-pulse border border-blue-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700'
                }`}
              title="Belge Ekle (.docx, .pdf)"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex-1 relative"
            >
              {attachment && (
                <div className="absolute -top-10 left-0 bg-blue-900/50 border border-blue-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-blue-200 animate-in fade-in slide-in-from-bottom-2">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="max-w-[150px] truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="hover:text-white ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Quota Badge */}
              {userRole !== 'admin' && remainingQuota !== null && (
                <div className={`absolute -top-10 right-0 border rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs animate-in fade-in slide-in-from-bottom-2 ${remainingQuota === 0 ? 'bg-red-900/50 border-red-500/30 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-800/80 border-slate-600/50 text-slate-300'}`}>
                   <span className="font-medium">Kalan Mesaj: {remainingQuota}/100</span>
                </div>
              )}

              <div className={`relative w-full flex items-center rounded-xl border border-transparent transition-all p-1 overflow-hidden ${remainingQuota === 0 ? 'bg-red-950/20' : 'bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:bg-slate-800/80'}`}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isBlocked || remainingQuota === 0}
                  placeholder={remainingQuota === 0 ? "Günlük limitiniz doldu. Lütfen yarın tekrar deneyin." : (isBlocked ? `Kısıtlandı: ${blockTimer}s` : (attachment ? "Belge hakkında bir şeyler sorun..." : "Bir şeyler yazın..."))}
                  className="flex-1 bg-transparent border-0 px-3 sm:px-4 py-2 sm:py-2.5 text-white placeholder-slate-500 focus:ring-0 focus:outline-none min-w-0 text-sm sm:text-base disabled:opacity-70"
                />
                <button
                  type="submit"
                  disabled={(!input.trim() && !attachment) || isLoading}
                  className="p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 disabled:opacity-50 disabled:bg-transparent disabled:text-slate-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </form>
          </div>

          {/* Mobile Apps Coming Soon Badge */}
          <div className="flex justify-center mt-3 mb-1">
            <div className="group relative flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-900/40 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all duration-300">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-[1.1rem] w-auto text-slate-300 group-hover:text-white transition-colors" fill="currentColor">
                  <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-1.956.04-3.766 1.146-4.773 2.926-2.04 3.593-.522 8.913 1.473 11.832 1.01 1.493 2.203 3.167 3.834 3.107 1.554-.06 2.146-.99 3.992-.99 1.826 0 2.373.99 3.992.95 1.666-.04 2.684-1.494 3.652-2.926 1.127-1.666 1.593-3.272 1.613-3.352-.04-.01-3.13-1.228-3.15-4.87-.02-3.05 2.455-4.52 2.573-4.58-1.434-2.126-3.666-2.414-4.472-2.473-2.022-.18-3.816 1.206-4.755 1.206-.92 0-2.39-1.206-4.027-1.166v.05zm1.5-3.674c.85-.996 1.423-2.385 1.258-3.785-1.185.05-2.656.79-3.526 1.805-.694.793-1.34 2.213-1.146 3.594 1.334.1 2.564-.626 3.414-1.614z"/>
                </svg>
                <svg viewBox="0 0 576 512" className="h-[1.05rem] w-auto text-green-500/80 group-hover:text-green-400 transition-colors" fill="currentColor">
                  <path d="M420.22 165.73l42.6-70.1c4.54-7.46 2.14-17.18-5.35-21.73-7.48-4.55-17.25-2.15-21.8 5.3L392.4 149.3c-31.5-13.84-66.23-21.65-103.14-21.65s-71.6 7.8-103.1 21.64L142.75 79.2C138.2 71.75 128.45 69.34 121 73.9c-7.5 4.54-9.9 14.26-5.35 21.73l42.6 70.1c-96.16 52.84-158.33 147.28-158.33 252.37H578.4c0-105-62.1-199.5-158.18-252.37zM186.27 341.25c-18.06 0-32.8-14.74-32.8-32.8 0-18.08 14.74-32.8 32.8-32.8 18.1 0 32.83 14.73 32.83 32.8 0 18.07-14.75 32.8-32.83 32.8zm203.46 0c-18.1 0-32.8-14.74-32.8-32.8 0-18.08 14.7-32.8 32.8-32.8 18.1 0 32.8 14.73 32.8 32.8 0 18.07-14.73 32.8-32.8 32.8z"/>
                </svg>
              </div>
              
              <div className="h-3.5 w-px bg-slate-700/50"></div>
              
              <span className="text-[11px] font-medium bg-gradient-to-r from-slate-300 to-slate-400 bg-clip-text text-transparent group-hover:from-white group-hover:to-slate-200 transition-colors">
                Mobil Uygulamalarımız Yakında
              </span>
            </div>
          </div>

          <div className="text-center mt-1">
            <p className="text-[10px] text-slate-600">ÇMYO.AI yanlış bilgiler gösterebilir. Bu nedenle, verdiği yanıtları doğrulayın.</p>
            <div className="flex justify-center gap-2 mt-1">
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-700 hover:text-blue-400 transition-colors">Kullanım Koşulları</a>
              <span className="text-[10px] text-slate-800">•</span>
              <a href="/kvkk" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-700 hover:text-blue-400 transition-colors">KVKK</a>
              <span className="text-[10px] text-slate-800">•</span>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-700 hover:text-blue-400 transition-colors">Gizlilik</a>
            </div>
            <div className="flex justify-center items-center gap-2 mt-1.5">
              <a href="https://github.com/drtaylanaktas" target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:text-slate-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.083-.729.083-.729 1.205.085 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/></svg>
              </a>
              <a href="https://www.linkedin.com/in/cmyo" target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:text-slate-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="https://www.instagram.com/cicekdagimeslekyuksekokulu/" target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:text-slate-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              </a>
              <a href="https://x.com/cicekdagimyo" target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:text-slate-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
