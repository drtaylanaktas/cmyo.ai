'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, FileText, User, Sparkles, Copy, Check, Mic, MicOff } from 'lucide-react';
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
        body: JSON.stringify({ message: input, history: history, user: currentUser, weather: weatherData }),
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
    <main className="flex-1 flex flex-col h-screen max-h-screen relative overflow-hidden bg-transparent text-white">

      {/* Background Ambience (Neon Glows) */}
      <NeuralBackground />

      {/* Header */}
      <header className="h-20 border-b border-blue-500/20 glass flex items-center justify-between px-6 fixed top-0 w-full z-50 bg-[#050a14]/80 backdrop-blur-xl transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-full border-2 border-blue-400/50 shadow-[0_0_15px_rgba(0,128,255,0.4)] overflow-hidden bg-white/10 p-0.5">
            <Image src="/logo.png" alt="Logo" width={48} height={48} className="object-cover w-full h-full rounded-full" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#0080ff] via-[#39ff14] to-[#lld700] drop-shadow-[0_0_10px_rgba(0,128,255,0.5)]">
              KAEU.AI v1.0 (beta)
            </h1>
            <p className="text-xs text-blue-300/80">Kırşehir Ahi Evran Üniversitesi</p>
          </div>

        </div>

        <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-full border border-blue-500/20 backdrop-blur-md px-4">
          {currentUser && (
            <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push('/profile')}>
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-white">
                  {currentUser.role === 'academic' && currentUser.title ? `${currentUser.title} ` : ''}
                  {currentUser.name} {currentUser.surname}
                </span>
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${currentUser.role === 'academic' ? 'text-green-400' : 'text-blue-400'
                  }`}>
                  {currentUser.role === 'academic' ? 'Akademisyen' : 'Öğrenci'}
                </span>
              </div>
              <div className="w-10 h-10 rounded-full border border-blue-500/30 overflow-hidden bg-slate-800 relative">
                {currentUser.avatar ? (
                  <Image src={currentUser.avatar} alt="Profile" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <User className="w-6 h-6" />
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="p-2 rounded-full text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all border border-red-500/20"
            title="Çıkış Yap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 pt-28 space-y-6 md:p-8 md:pt-32 scroll-smooth z-0 relative">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex max-w-[85%] md:max-w-[75%] gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Icon */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden ${msg.role === 'assistant'
                  ? 'border-blue-500/50 bg-slate-900 shadow-[0_0_10px_rgba(0,128,255,0.3)]'
                  : 'border-slate-600 bg-slate-800'
                  }`}>
                  {msg.role === 'assistant' ? (
                    <Image src="/logo.png" alt="Bot" width={48} height={48} className="w-full h-full object-cover" />
                  ) : (
                    currentUser?.avatar ? (
                      <div className="relative w-full h-full">
                        <Image src={currentUser.avatar} alt="User" fill className="object-cover" />
                      </div>
                    ) : <User className="w-6 h-6 text-slate-300" />
                  )}
                </div>

                {/* Bubble */}
                <div className={`p-5 rounded-2xl relative overflow-hidden backdrop-blur-md group ${msg.role === 'user'
                  ? 'bg-gradient-to-br from-blue-600/90 to-blue-800/90 text-white rounded-tr-none border border-blue-400/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
                  : 'bg-[#111827]/80 text-blue-50 rounded-tl-none border border-green-500/20 shadow-[0_4px_20px_rgba(0,255,100,0.05)]'
                  }`}>

                  {/* Copy Button */}
                  <button
                    onClick={() => {
                      copyToClipboard(msg.content);
                    }}
                    className={`absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${msg.role === 'user' ? 'text-blue-100 hover:bg-white/10' : 'text-slate-400 hover:bg-slate-700'
                      }`}
                    title="Metni Kopyala"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  {/* Glow effect for bot messages */}
                  {msg.role === 'assistant' && (
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-green-500 to-blue-500 opacity-50" />
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{msg.content}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start w-full pl-2">
            <div className="flex max-w-[80%] gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-900 border-2 border-blue-500/50 flex items-center justify-center shrink-0 overflow-hidden shadow-[0_0_15px_rgba(0,128,255,0.3)]">
                <Image src="/logo.png" alt="Loading" width={48} height={48} className="w-full h-full object-cover animate-pulse" />
              </div>
              <div className="glass-card px-6 py-4 rounded-2xl rounded-tl-none flex items-center gap-2 border border-blue-500/30">
                <span className="w-2.5 h-2.5 bg-[#0080ff] rounded-full animate-[bounce_1s_infinite_-0.3s] shadow-[0_0_10px_#0080ff]"></span>
                <span className="w-2.5 h-2.5 bg-[#39ff14] rounded-full animate-[bounce_1s_infinite_-0.15s] shadow-[0_0_10px_#39ff14]"></span>
                <span className="w-2.5 h-2.5 bg-[#ffd700] rounded-full animate-[bounce_1s_infinite] shadow-[0_0_10px_#ffd700]"></span>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 md:p-4 bg-[#050a14]/90 backdrop-blur-xl border-t border-blue-500/20 z-20 shrink-0 pb-6">
        <div className="max-w-4xl mx-auto flex gap-3 relative">
          {/* Input Glow */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-green-500 to-blue-500 rounded-xl opacity-20 blur group-hover:opacity-40 transition duration-1000 animate-tilt"></div>



          <div className="flex-1 flex gap-3 relative z-10">
            {/* Mic Button */}
            {hasSupport && (
              <button
                type="button"
                onClick={handleMicClick}
                className={`p-3 rounded-xl transition-all shadow-[0_0_20px_rgba(0,128,255,0.3)] active:scale-95 flex items-center justify-center w-14 border ${isListening
                  ? 'bg-red-600 hover:bg-red-500 border-red-400/20 animate-pulse text-white'
                  : 'bg-[#0f172a] hover:bg-[#1e293b] border-blue-500/30 text-slate-400 hover:text-white'
                  }`}
                title={isListening ? "Dinlemeyi Durdur" : "Sesle Yaz"}
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex-1 flex gap-3 relative z-10"
            >
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                    // Reset height
                    if (e.currentTarget) {
                      e.currentTarget.style.height = 'auto';
                    }
                  }
                }}
                placeholder={isBlocked ? `Sohbet kilitlendi. ${blockTimer} saniye sonra tekrar yazabilirsiniz.` : "Merhaba! Ben KAEU.AI v1.0 (beta). Size nasıl yardımcı olabilirim?"}
                rows={1}
                disabled={isBlocked}
                className={`flex-1 bg-[#0f172a] border border-blue-500/30 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 shadow-inner transition-all hover:border-blue-500/50 resize-none min-h-[46px] max-h-[150px] overflow-y-auto ${isBlocked ? 'opacity-50 cursor-not-allowed border-red-500/50' : ''}`}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-[0_0_20px_rgba(0,128,255,0.3)] active:scale-95 flex items-center justify-center w-14 border border-blue-400/20"
              >
                <Send className="w-6 h-6" />
              </button>
            </form>
          </div>
        </div>
        <div className="text-center mt-2 flex justify-center items-center gap-2 opacity-50">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_lime]"></div>
          <p className="text-[10px] text-blue-200 tracking-wider font-light uppercase">KAEU.AI SİSTEMİ AKTİF</p>
        </div>
      </div>
    </main>
  );
}
