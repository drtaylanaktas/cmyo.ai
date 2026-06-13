'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, FileText, User, Sparkles, Copy, Check, Mic, MicOff, History, MessageSquare, Plus, ArrowLeft, Trash2, Edit2, Pin, MoreHorizontal, X, Paperclip, Cloud, CloudRain, Sun, CloudSnow, Zap, MapPin, Calendar, ChevronDown, Info, Lightbulb, AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import Link from 'next/link';
import MiniCalendar from '@/components/MiniCalendar';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { Activity, Volume2, Bot, Share2, Globe, ShieldCheck } from 'lucide-react';
import { checkProfanity } from '@/lib/badwords';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HistorySkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

// Robust regex for stripping technical JSON action blocks from the UI
const JSON_CLEAN_REGEX = /(?:```(?:json)?\s*)?JSON_START\s*[\s\S]*?JSON_END(?:\s*```)?/gi;
// Güvenlik ağı: model bazen tool argümanlarını ({ "filename": ... }) metne sızdırır — onları da temizle.
const ACTION_JSON_REGEX = /\{[\s\S]*?"(?:filename|file_name|action)"[\s\S]*?\}/gi;
const stripJsonBlock = (content: string) =>
  content.replace(JSON_CLEAN_REGEX, '').replace(ACTION_JSON_REGEX, '').trim();

// Canlı akış için: tamamlanmış bloklara ek olarak, HENÜZ kapanmamış (yarım) bir
// action JSON'u veya JSON_START'ı da gizle — kullanıcı yazılırken görmesin.
const cleanStreamingContent = (content: string) => {
  let out = stripJsonBlock(content);
  const partialObj = out.search(/\{[^}]*"(?:filename|file_name|action)"/i);
  if (partialObj !== -1) out = out.slice(0, partialObj);
  const js = out.indexOf('JSON_START');
  if (js !== -1) out = out.slice(0, js);
  return out.trimEnd();
};

// --- v1.6 & v1.7 İnteraktif Markdown, Akıllı Kartlar & 3D Flashcard Geliştirmeleri ---

interface ContentBlock {
  type: 'markdown' | 'accordion' | 'flashcards';
  title?: string;
  content: string;
  isComplete?: boolean;
}

const parseContentBlocks = (text: string): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  const regex = /:::\s*(details|flashcards)[^\S\r\n]*([^\n]*)\n([\s\S]*?)(?:\n:::\s*|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const beforeText = text.substring(lastIndex, match.index).trim();
    if (beforeText) {
      blocks.push({ type: 'markdown', content: beforeText });
    }

    const type = match[1].trim() as 'details' | 'flashcards';
    const title = match[2].trim();
    const content = match[3].trim();
    
    // Check if the block is closed (ends with the closing delimiter :::)
    const isComplete = match[0].trim().endsWith(':::');
    
    blocks.push({ 
      type: type === 'details' ? 'accordion' : 'flashcards', 
      title: title || undefined, 
      content,
      isComplete
    });

    lastIndex = regex.lastIndex;
  }

  const afterText = text.substring(lastIndex).trim();
  if (afterText) {
    blocks.push({ type: 'markdown', content: afterText });
  }

  return blocks;
};

const getTextContent = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (node.props && node.props.children) return getTextContent(node.props.children);
  return '';
};

const removeCalloutHeader = (node: any, header: string): any => {
  if (!node) return node;
  if (typeof node === 'string') {
    return node.replace(header, '').replace(/^\s*>\s*/, '').trim();
  }
  if (Array.isArray(node)) {
    return node.map(child => removeCalloutHeader(child, header));
  }
  if (node.props && node.props.children) {
    return {
      ...node,
      props: {
        ...node.props,
        children: removeCalloutHeader(node.props.children, header)
      }
    };
  }
  return node;
};

const CustomBlockquote = ({ children }: any) => {
  let type: 'note' | 'tip' | 'warning' | 'caution' | 'normal' = 'normal';
  const textContent = getTextContent(children);

  if (textContent.includes('[!NOTE]')) {
    type = 'note';
    children = removeCalloutHeader(children, '[!NOTE]');
  } else if (textContent.includes('[!TIP]')) {
    type = 'tip';
    children = removeCalloutHeader(children, '[!TIP]');
  } else if (textContent.includes('[!WARNING]')) {
    type = 'warning';
    children = removeCalloutHeader(children, '[!WARNING]');
  } else if (textContent.includes('[!CAUTION]')) {
    type = 'caution';
    children = removeCalloutHeader(children, '[!CAUTION]');
  }

  if (type === 'normal') {
    return <blockquote className="border-l-4 border-slate-700 pl-4 my-2 text-slate-400 italic">{children}</blockquote>;
  }

  const styles = {
    note: {
      border: 'border-blue-500/30',
      bg: 'bg-blue-950/20',
      text: 'text-blue-200',
      icon: <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />,
      title: 'NOT'
    },
    tip: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-950/20',
      text: 'text-emerald-200',
      icon: <Lightbulb className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
      title: 'İPUCU'
    },
    warning: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-950/20',
      text: 'text-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
      title: 'UYARI'
    },
    caution: {
      border: 'border-rose-500/30',
      bg: 'bg-rose-950/20',
      text: 'text-rose-200',
      icon: <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
      title: 'DİKKAT'
    }
  }[type];

  return (
    <div className={`my-4 p-4 rounded-xl border ${styles.border} ${styles.bg} backdrop-blur-sm flex gap-3 shadow-lg`}>
      {styles.icon}
      <div className="flex-1">
        <span className="block text-xs font-bold tracking-wider uppercase mb-1 text-slate-300">{styles.title}</span>
        <div className={`text-sm ${styles.text} leading-relaxed`}>{children}</div>
      </div>
    </div>
  );
};

const CustomAccordion = ({ title, children }: { title: string; children: any }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="my-3 rounded-xl border border-slate-800 bg-slate-950/20 backdrop-blur-sm overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-bold text-slate-200 hover:bg-slate-900/40 transition-colors cursor-pointer"
      >
        <span>{title}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="px-4 pb-4 pt-2 border-t border-slate-900/60 text-sm text-slate-300 leading-relaxed overflow-hidden">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CustomTable = ({ children }: any) => {
  return (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20 backdrop-blur-sm shadow-xl">
      <table className="w-full text-left border-collapse text-sm text-slate-300">
        {children}
      </table>
    </div>
  );
};

const CustomThead = ({ children }: any) => {
  return <thead className="bg-slate-900/50 text-blue-200 font-semibold border-b border-slate-800">{children}</thead>;
};

const CustomTh = ({ children }: any) => {
  return <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">{children}</th>;
};

const CustomTr = ({ children }: any) => {
  return <tr className="border-b border-slate-800/40 hover:bg-slate-900/20 transition-colors">{children}</tr>;
};

const CustomTd = ({ children }: any) => {
  return <td className="px-4 py-3 leading-normal">{children}</td>;
};

const CustomLi = ({ children, checked, ...props }: any) => {
  const [isChecked, setIsChecked] = useState(checked);
  const isTodo = typeof checked === 'boolean';

  if (!isTodo) {
    return <li className="my-1.5 leading-relaxed" {...props}>{children}</li>;
  }

  return (
    <li className="flex items-start gap-2.5 my-2 leading-relaxed list-none">
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => setIsChecked(e.target.checked)}
        className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-950/40 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
      />
      <span className={`text-sm transition-all duration-300 ${isChecked ? 'line-through text-slate-500' : 'text-slate-200'}`}>
        {children}
      </span>
    </li>
  );
};

const CustomFlashcardsPreparing = ({ content }: { content: string }) => {
  const count = (content.match(/\{\s*['"]front['"]\s*:[\s\S]*?['"]back['"]\s*:[\s\S]*?\}/gi) || []).length;
  
  return (
    <div className="my-4 w-full max-w-sm mx-auto p-5 rounded-2xl border border-blue-500/20 bg-slate-900/35 backdrop-blur-md shadow-2xl flex flex-col items-center gap-3">
      <div className="relative w-10 h-10 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-blue-500/40 animate-ping opacity-75" />
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
      <div className="text-center">
        <h4 className="text-xs text-blue-400 font-bold uppercase tracking-wider mb-1 animate-pulse">Desteniz Dolduruluyor</h4>
        <p className="text-xs text-slate-400 font-medium">
          ÇMYO.AI hafıza kartlarını hazırlıyor...
        </p>
      </div>
      <div className="w-full flex flex-col gap-1.5 mt-1">
        <div className="flex justify-between text-[10px] text-slate-500 font-semibold px-1">
          <span>HAFİZA DESTE OLUŞTURUCU</span>
          <span className="text-blue-400">{count} Kart Tamam</span>
        </div>
        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden relative">
          <motion.div 
            className="h-full bg-blue-500 rounded-full"
            initial={{ left: "-30%", width: "30%" }}
            animate={{ left: "100%", width: "30%" }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            style={{ position: 'absolute' }}
          />
        </div>
      </div>
    </div>
  );
};

const CustomFlashcards = ({ content }: { content: string }) => {
  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<('learned' | 'repeat')[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    try {
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        const firstNewLine = cleaned.indexOf('\n');
        if (firstNewLine !== -1) {
          cleaned = cleaned.substring(firstNewLine + 1);
        } else {
          cleaned = cleaned.replace(/^```[a-zA-Z]*/, '');
        }
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.substring(0, cleaned.length - 3).trim();
      }
      cleaned = cleaned.trim();

      const startBracket = cleaned.indexOf('[');
      const endBracket = cleaned.lastIndexOf(']');
      if (startBracket !== -1 && endBracket !== -1 && startBracket < endBracket) {
        cleaned = cleaned.substring(startBracket, endBracket + 1);
      }

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (firstErr) {
        try {
          let corrected = cleaned
            .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
            .replace(/(:\s*)'([^']*)'(\s*[,}])/g, '$1"$2"$3');
          parsed = JSON.parse(corrected);
        } catch (secondErr) {
          const items: { front: string; back: string }[] = [];
          const itemRegex = /\{\s*['"]front['"]\s*:\s*['"]([\s\S]*?)['"]\s*,\s*['"]back['"]\s*:\s*['"]([\s\S]*?)['"]\s*\}/gi;
          let itemMatch;
          while ((itemMatch = itemRegex.exec(cleaned)) !== null) {
            items.push({
              front: itemMatch[1].trim(),
              back: itemMatch[2].trim()
            });
          }
          if (items.length > 0) {
            parsed = items;
          } else {
            throw secondErr;
          }
        }
      }

      if (Array.isArray(parsed)) {
        setCards(parsed);
        setResults([]);
        setCurrentIndex(0);
        setIsFlipped(false);
        setIsFinished(false);
      }
    } catch (e) {
      console.error('Failed to parse flashcards JSON:', e, 'Raw content was:', content);
    }
  }, [content]);

  if (cards.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
        Flashcard verisi ayrıştırılamadı.
      </div>
    );
  }

  const handleChoice = (type: 'learned' | 'repeat') => {
    const updatedResults = [...results, type];
    setResults(updatedResults);
    
    if (currentIndex + 1 < cards.length) {
      setIsFlipped(false);
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
      }, 150);
    } else {
      setIsFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setResults([]);
    setIsFinished(false);
  };

  const currentCard = cards[currentIndex];
  const progressPercent = (currentIndex / cards.length) * 100;
  const learnedCount = results.filter(r => r === 'learned').length;
  const repeatCount = results.filter(r => r === 'repeat').length;

  if (isFinished) {
    return (
      <div className="my-4 p-6 rounded-2xl border border-slate-800 bg-slate-950/30 backdrop-blur-md shadow-2xl flex flex-col items-center text-center max-w-md mx-auto">
        <Sparkles className="w-8 h-8 text-yellow-400 mb-3 animate-pulse" />
        <h3 className="text-lg font-bold text-white mb-2">Tebrikler!</h3>
        <p className="text-xs text-slate-400 mb-6">Kelime ezber kartları destesini başarıyla tamamladınız.</p>
        
        <div className="grid grid-cols-2 gap-4 w-full mb-6">
          <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <span className="block text-xs text-emerald-400 font-semibold mb-1">EZBERLENDİ</span>
            <span className="text-2xl font-black text-white">{learnedCount}</span>
          </div>
          <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5">
            <span className="block text-xs text-rose-400 font-semibold mb-1">TEKRAR EDİLECEK</span>
            <span className="text-2xl font-black text-white">{repeatCount}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRestart}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
        >
          Desteyi Yeniden Başlat
        </button>
      </div>
    );
  }

  return (
    <div className="my-4 w-full max-w-sm mx-auto flex flex-col items-center gap-4">
      <div className="w-full flex items-center justify-between text-xs text-slate-400 px-1">
        <span>Kart {currentIndex + 1} / {cards.length}</span>
        <span className="font-semibold text-blue-400">{Math.round(progressPercent)}% Tamamlandı</span>
      </div>
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-blue-500" 
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div 
        onClick={() => setIsFlipped(!isFlipped)}
        className="w-full h-56 relative cursor-pointer group"
        style={{ perspective: "1000px" }}
      >
        <motion.div
          className="w-full h-full relative"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div 
            className="absolute inset-0 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-slate-900/60 border border-slate-700/60 shadow-xl backdrop-blur-md"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="absolute top-3.5 right-4 text-[10px] text-slate-500 font-semibold flex items-center gap-1 group-hover:text-slate-300 transition-colors select-none">
              DÖNDÜR <Sparkles className="w-3 h-3 text-blue-400" />
            </span>
            <h4 className="text-xl font-black text-white tracking-wide uppercase px-2 select-text">{currentCard.front}</h4>
          </div>

          <div 
            className="absolute inset-0 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-slate-950/80 border border-blue-500/20 shadow-2xl backdrop-blur-md"
            style={{ 
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)"
            }}
          >
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-2 select-none">TANIM / CEVAP</span>
            <p className="text-sm text-slate-200 leading-relaxed font-medium px-2 select-text">{currentCard.back}</p>
          </div>
        </motion.div>
      </div>

      <div className="flex gap-3 w-full">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleChoice('repeat');
          }}
          className="flex-1 py-3 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
        >
          Tekrar Et
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleChoice('learned');
          }}
          className="flex-1 py-3 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
        >
          Öğrendim
        </button>
      </div>
    </div>
  );
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
  createdAt?: string;
};

type Attachment =
  | { name: string; kind: 'text'; content: string }
  | { name: string; kind: 'image'; imageDataUrl: string; mime: string };

type WeatherData = {
  lat: number;
  lon: number;
  locationName: string;
  temp: number | null;
  code: number | null;
  unit: string;
  error?: 'weather';
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const { toast } = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userRole, setUserRole] = useState<'student' | 'academic' | 'admin'>('student'); // Keep for API compatibility but derive from user
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);

  const { isListening, transcript, startListening, stopListening, resetTranscript, hasSupport } = useVoiceInput();
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [locationPermission, setLocationPermission] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [showLocationBanner, setShowLocationBanner] = useState(false);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTelegramBanner, setShowTelegramBanner] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Akademik Humanizer & AI Analizörü Eyaletleri
  const [showAcademicPanel, setShowAcademicPanel] = useState(false);
  const [academicInput, setAcademicInput] = useState('');
  const [academicVoiceSample, setAcademicVoiceSample] = useState('');
  const [showAcademicVoiceInput, setShowAcademicVoiceInput] = useState(false);
  const [academicAction, setAcademicAction] = useState<'detect' | 'humanize' | null>(null);
  const [academicResult, setAcademicResult] = useState<any>(null);
  const [academicResultType, setAcademicResultType] = useState<'detect' | 'humanize' | null>(null);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [academicLoadingPhase, setAcademicLoadingPhase] = useState('');
  const [academicActiveTab, setAcademicActiveTab] = useState<'before' | 'after'>('before');
  const [academicLanguage, setAcademicLanguage] = useState<'auto' | 'tr' | 'en'>('auto');
  const [showAcademicTips, setShowAcademicTips] = useState(false);
  const [academicTipsStep, setAcademicTipsStep] = useState(0);

  // İlk açılış tips kontrolü
  useEffect(() => {
    if (showAcademicPanel) {
      const tipsSeen = localStorage.getItem('cmyo_academic_tips_seen');
      if (!tipsSeen) {
        setShowAcademicTips(true);
        setAcademicTipsStep(0);
      }
    }
  }, [showAcademicPanel]);

  const dismissAcademicTips = () => {
    setShowAcademicTips(false);
    localStorage.setItem('cmyo_academic_tips_seen', 'true');
  };

  const nextAcademicTip = () => {
    if (academicTipsStep < 3) {
      setAcademicTipsStep(academicTipsStep + 1);
    } else {
      dismissAcademicTips();
    }
  };

  const handleAcademicProcess = async (action: 'detect' | 'humanize') => {
    if (!academicInput.trim()) {
      setAcademicError('Lütfen analiz edilecek veya dönüştürülecek bir metin girin.');
      return;
    }
    const wordCount = academicInput.trim().split(/\s+/).length;
    if (wordCount > 4000) {
      setAcademicError('Girdiğiniz metin en fazla 4000 kelime olabilir.');
      return;
    }
    setAcademicAction(action);
    setAcademicResult(null);
    setAcademicError(null);

    // Animasyonlu Yükleme Fazları — Multi-pass mimariye uygun
    const detectPhases = [
      'Metin morfolojisi ve 26 AI kalıbı taranıyor...',
      'Perplexity ve burstiness metrikleri hesaplanıyor...',
      'GPTZero/Turnitin akademik AI modelleri simüle ediliyor...'
    ];
    const humanizePhases = [
      'Metin morfolojisi ve 26 AI kalıbı taranıyor...',
      'İlk insansılaştırma geçişi uygulanıyor (Blader Playbook)...',
      'Audit denetimi: robotik kalıntılar aranıyor...',
      'İkinci geçiş: kalan AI izleri temizleniyor...',
      'Final AI skor kontrolü yapılıyor...',
      'Sonuçlar hazırlanıyor...'
    ];
    const phases = action === 'detect' ? detectPhases : humanizePhases;
    let currentPhaseIdx = 0;
    setAcademicLoadingPhase(phases[0]);

    const phaseInterval = setInterval(() => {
      currentPhaseIdx++;
      if (currentPhaseIdx < phases.length) {
        setAcademicLoadingPhase(phases[currentPhaseIdx]);
      }
    }, 3500);

    try {
      const response = await fetch('/api/humanizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text: academicInput,
          voiceSample: academicVoiceSample || undefined,
          targetLanguage: action === 'humanize' ? academicLanguage : undefined,
          email: currentUser?.email
        })
      });

      const resData = await response.json();
      clearInterval(phaseInterval);

      if (!response.ok) {
        throw new Error(resData.error || 'Analiz gerçekleştirilirken sunucu hatası oluştu.');
      }

      setAcademicResult(resData);
      setAcademicResultType(action);
      setAcademicActiveTab(action === 'humanize' ? 'after' : 'before');
    } catch (err: any) {
      clearInterval(phaseInterval);
      setAcademicError(err.message || 'Bir bağlantı hatası oluştu.');
    } finally {
      setAcademicAction(null);
      setAcademicLoadingPhase('');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const bannerDismissed = localStorage.getItem('telegram_banner_dismissed');
    if (!bannerDismissed) {
      setShowTelegramBanner(true);
    }
    // v1.6 "Yenilikler" modal'ı — her kullanıcıya bir kez göster
    const whatsNewSeen = localStorage.getItem('cmyo_whats_new_v1.6.1');
    if (!whatsNewSeen) {
      setShowWhatsNew(true);
    }
  }, []);

  const dismissTelegramBanner = () => {
    setShowTelegramBanner(false);
    localStorage.setItem('telegram_banner_dismissed', 'true');
  };

  const dismissWhatsNew = () => {
    setShowWhatsNew(false);
    localStorage.setItem('cmyo_whats_new_v1.6.1', 'true');
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
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`/api/chat/history?email=${currentUser.email}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    } finally {
      setIsHistoryLoading(false);
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
        toast('Sohbet silindi.', 'success');
      } else {
        toast('Sohbet silinemedi.', 'error');
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

    // Geocoding (best-effort, doesn't block weather data)
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=tr`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        locationName = geoData.address.town || geoData.address.city || geoData.address.village || geoData.address.province || geoData.address.district || "Bilinmeyen Bölge";
        if (geoData.address.county && locationName === "Bilinmeyen Bölge") locationName = geoData.address.county;
      }
    } catch (e) {
      console.error("Reverse geocoding failed", e);
    }

    // Set location immediately so AI has context even if weather fetch fails
    setWeatherData({ lat: latitude, lon: longitude, locationName, temp: null, code: null, unit: '°C' });

    // Weather (best-effort) — error flag'i UI'ya "Hava yüklenemedi" göstermek için kullanılıyor
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`);
      if (!response.ok) {
        setWeatherData({ lat: latitude, lon: longitude, locationName, temp: null, code: null, unit: '°C', error: 'weather' });
        return;
      }
      const data = await response.json();
      if (data?.current && typeof data.current.temperature_2m === 'number') {
        setWeatherData({
          temp: data.current.temperature_2m,
          code: typeof data.current.weather_code === 'number' ? data.current.weather_code : null,
          unit: data.current_units?.temperature_2m ?? '°C',
          lat: latitude,
          lon: longitude,
          locationName
        });
      } else {
        setWeatherData({ lat: latitude, lon: longitude, locationName, temp: null, code: null, unit: '°C', error: 'weather' });
      }
    } catch (e) {
      console.error("Failed to fetch weather", e);
      setWeatherData({ lat: latitude, lon: longitude, locationName, temp: null, code: null, unit: '°C', error: 'weather' });
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
    const showPromptBanner = () => {
      setLocationPermission('prompt');
      if (!localStorage.getItem('location_banner_dismissed')) {
        setShowLocationBanner(true);
      }
    };
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
            showPromptBanner();
          }
        } else {
          // Permissions API desteklenmiyor (Safari gibi) — direkt konum istemek yerine banner göster
          showPromptBanner();
        }
      } catch {
        // Permissions API query başarısız — yine de banner ile kullanıcıya sor
        showPromptBanner();
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

  // Auto-resize chat textarea to fit content (capped at max height, then internal scroll)
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 160; // ~6–7 satır, text-sm/base'te rahat okunur
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [input]);

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

      if (data.kind === 'image') {
        setAttachment({
          name: data.filename,
          kind: 'image',
          imageDataUrl: data.imageDataUrl,
          mime: data.mime,
        });
      } else {
        setAttachment({
          name: data.filename,
          kind: 'text',
          content: data.text,
        });
      }

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

  // Bekleme sırasında dönen durum yazıları (Claude tarzı shimmer ile)
  const LOADING_PHASES = ['Düşünüyor', 'Kaynakları inceliyor', 'Yanıt hazırlanıyor'];
  useEffect(() => {
    if (!isLoading) { setLoadingPhase(0); return; }
    const interval = setInterval(() => {
      setLoadingPhase((p) => (p + 1) % LOADING_PHASES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Not: Eski client-side daktilo efekti kaldırıldı — artık yanıtlar sunucudan
  // gerçek zamanlı (SSE) token-token akıyor; streamingText doğrudan stream'den beslenir.

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
      let attachmentImagePayload: { name: string; dataUrl: string } | undefined;
      if (currentAttachment) {
        if (currentAttachment.kind === 'text') {
          messageToSend = `[BELGE İÇERİĞİ BAŞLANGICI - ${currentAttachment.name}]\n${currentAttachment.content}\n[BELGE İÇERİĞİ SONU]\n\n${input}`;
        } else {
          // Görsel attachment: chat history için not ekle, gerçek data URL ayrı alanda gider
          messageToSend = `[GÖRSEL EKLİ: ${currentAttachment.name}]\n${input}`;
          attachmentImagePayload = {
            name: currentAttachment.name,
            dataUrl: currentAttachment.imageDataUrl,
          };
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          history: history,
          user: currentUser,
          weather: weatherData,
          conversationId,
          attachmentImage: attachmentImagePayload,
        }),
      });

      // Üretim öncesi hatalar (rate limit / kota / validasyon / sunucu) JSON döner.
      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const errData = await response.json();
          if (response.status === 429) setRemainingQuota(0);
          throw new Error(errData.error || `API Error: ${response.statusText}`);
        }
        const text = await response.text();
        throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}...`);
      }

      // Canlı asistan mesajı — stream geldikçe içeriği güncellenecek.
      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);
      setStreamingId(assistantId);
      setStreamingText('');

      let fullReply = '';
      let createdNewConvo = false;
      let streamError: string | null = null;
      let pendingAction: any = null;

      if (!response.body) {
        throw new Error('Yanıt akışı alınamadı.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const evt of events) {
          const trimmed = evt.trim();
          if (!trimmed.startsWith('data:')) continue;
          let payload: any;
          try {
            payload = JSON.parse(trimmed.slice(5).trim());
          } catch {
            continue;
          }
          if (payload.type === 'meta') {
            if (payload.remainingQuota !== null && payload.remainingQuota !== undefined) {
              setRemainingQuota(payload.remainingQuota);
            }
            if (payload.conversationId && payload.conversationId !== conversationId) {
              setConversationId(payload.conversationId);
              createdNewConvo = true;
            }
          } else if (payload.type === 'delta') {
            fullReply += payload.text;
            // Teknik aksiyon JSON'unu (tam/yarım) canlı görünümden gizle.
            setStreamingText(cleanStreamingContent(fullReply));
          } else if (payload.type === 'action') {
            // Yapısal tool_call (Faz 2) — dosya/FR-585 akışını tetikler.
            pendingAction = { action: payload.action, filename: payload.filename, data: payload.data };
          } else if (payload.type === 'error') {
            streamError = payload.error || 'Yanıt üretilemedi.';
          }
        }
      }

      if (streamError) {
        setStreamingId(null);
        setStreamingText('');
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: `⚠️ ${streamError}` } : m
        ));
        return;
      }

      let botContent = fullReply || (pendingAction ? '' : 'Cevap alınamadı.');
      let fileAttachment: string | null = null;

      // Aksiyon çözümle: önce yapısal tool_call (Faz 2), yoksa geriye dönük JSON bloğu (fallback).
      let actionData: any = pendingAction;
      if (!actionData) {
        const jsonMatch = botContent.match(JSON_CLEAN_REGEX);
        if (jsonMatch) {
          const lastMatch = jsonMatch[jsonMatch.length - 1];
          const jsonInside = lastMatch.match(/JSON_START\s*([\s\S]*?)\s*JSON_END/i);
          if (jsonInside) {
            try { actionData = JSON.parse(jsonInside[1].trim()); } catch {}
          }
        }
      }
      if (actionData) {
        try {
          const targetFilename = actionData.filename || actionData.file_name;
          botContent = stripJsonBlock(botContent);

            if (actionData.action === 'fill_kanit_formu') {
              // FR-585 Kanıt Formu — kullanıcının yüklediği kanıtla otomatik doldurma
              setMessages((prev) => [...prev, {
                id: 'fill-' + Date.now(),
                role: 'assistant',
                content: '📝 Kanıtınız analiz ediliyor ve FR-585 Kanıt Formu dolduruluyor...'
              }]);

              const fillRes = await fetch('/api/fill-kanit-formu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userMessage: input,
                  attachmentText:
                    currentAttachment?.kind === 'text' ? currentAttachment.content : undefined,
                  attachmentImage:
                    currentAttachment?.kind === 'image'
                      ? { name: currentAttachment.name, dataUrl: currentAttachment.imageDataUrl }
                      : undefined,
                }),
              });

              if (fillRes.ok) {
                const blob = await fillRes.blob();
                const url = window.URL.createObjectURL(blob);
                fileAttachment = url;

                const disposition = fillRes.headers.get('Content-Disposition') || '';
                const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)["']?/i);
                const serverFilename = nameMatch
                  ? decodeURIComponent(nameMatch[1].trim())
                  : 'FR-585 Kanit Formu (dolu).docx';

                const a = document.createElement('a');
                a.href = url;
                a.download = serverFilename;
                document.body.appendChild(a);
                a.click();
                a.remove();

                botContent += `\n\n✅ Doldurulmuş FR-585 Kanıt Formu hazırlandı ve indirildi.`;

                const warn = fillRes.headers.get('X-Fill-Warning');
                if (warn) {
                  try {
                    botContent += `\n\n⚠️ ${decodeURIComponent(warn)}`;
                  } catch {
                    botContent += `\n\n⚠️ ${warn}`;
                  }
                }
              } else {
                let errMsg = 'Form otomatik doldurulamadı.';
                try {
                  const errData = await fillRes.json();
                  if (errData.error) errMsg = errData.error;
                } catch {}
                botContent += `\n\n❌ ${errMsg} Boş formu indirmek için "FR-585 formunu indir" yazabilirsin.`;
              }
            } else if ((actionData.action === 'generate_file' || actionData.action === 'generate_pdf') && targetFilename) {
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
                fileAttachment = url;

                // Content-Disposition header'dan gerçek dosya adını al, yoksa targetFilename kullan
                const disposition = fileRes.headers.get('Content-Disposition') || '';
                const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)["']?/i);
                const serverFilename = nameMatch ? decodeURIComponent(nameMatch[1].trim()) : targetFilename;

                const a = document.createElement('a');
                a.href = url;
                a.download = serverFilename;
                document.body.appendChild(a);
                a.click();
                a.remove();

                const isPdf = serverFilename.toLowerCase().endsWith('.pdf');
                botContent += `\n\n✅ Belgeniz hazırlandı ve indirildi (${isPdf ? 'PDF' : 'Word'} formatında).`;
              } else {
                let errMsg = 'Belge oluşturulurken hata oluştu.';
                try {
                  const errData = await fileRes.json();
                  if (errData.error) errMsg = errData.error;
                } catch {}
                botContent += `\n\n❌ ${errMsg}`;
              }
            }
        } catch (e) {
          console.error("Action execution error", e);
        }
      }

      // Stream tamamlandı — canlı mesajı nihai içerikle (teknik JSON temizlenmiş) güncelle.
      const finalContent = cleanStreamingContent(botContent);
      setStreamingId(null);
      setStreamingText('');
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: finalContent, attachments: fileAttachment ? [fileAttachment] : undefined }
          : m
      ));
      if (createdNewConvo) fetchHistory();

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

  // Weather icon helper (WMO kodu karşılığı — Open-Meteo reference)
  const getWeatherIcon = (code: number | null) => {
    if (code === null) return <Cloud className="w-4 h-4 text-slate-400" />;
    if (code === 0 || code === 1) return <Sun className="w-4 h-4 text-yellow-400" />;
    if (code === 2 || code === 3) return <Cloud className="w-4 h-4 text-slate-400" />;
    if (code === 45 || code === 48) return <Cloud className="w-4 h-4 text-slate-300" />;
    if (code >= 51 && code <= 67) return <CloudRain className="w-4 h-4 text-blue-400" />;
    if (code === 68 || code === 69) return <CloudRain className="w-4 h-4 text-blue-300" />;
    if (code >= 71 && code <= 77) return <CloudSnow className="w-4 h-4 text-blue-200" />;
    if (code >= 80 && code <= 82) return <CloudRain className="w-4 h-4 text-blue-500" />;
    if (code === 85 || code === 86) return <CloudSnow className="w-4 h-4 text-blue-100" />;
    if (code >= 95) return <Zap className="w-4 h-4 text-yellow-400" />;
    return <Cloud className="w-4 h-4 text-slate-400" />;
  };

  // Quick start suggestions
  const quickSuggestions = [
    { icon: '📰', text: 'Bugünün haberleri', query: 'Okuldaki son haberler neler?' },
    { icon: '📅', text: 'Ders programını göster', query: 'Haftalık ders programını gösterir misin?' },
    { icon: '📝', text: 'Staj başvurusu nasıl yapılır?', query: 'Staj başvurusu nasıl yapılır?' },
    { icon: '🏫', text: 'Çiçekdağı MYO hakkında', query: 'Çiçekdağı MYO hakkında bilgi ver' },
    { icon: '📋', text: 'Kayıt dondurma süreci', query: 'Kayıt dondurma süreci nasıl işliyor?' },
  ];

  return (
    <>
      <div className="fixed inset-0 flex w-full overflow-hidden bg-[#050a14] text-white h-screen max-h-screen">
      {/* Premium Arka Plan Nebula Glow Küreleri */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none">
        <div className="nebula-glow bg-blue-600/20 top-[-10%] left-[-15%]" />
        <div className="nebula-glow bg-purple-600/15 bottom-[-10%] right-[-10%]" />
        <div className="nebula-glow bg-emerald-600/10 top-[30%] right-[-15%]" style={{ animationDelay: '-7s' }} />
      </div>

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
            {isHistoryLoading ? (
              <HistorySkeleton rows={6} />
            ) : history.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="w-7 h-7" />}
                title="Henüz sohbet yok"
                description="İlk sorunuzu sorun; sohbetleriniz burada görünecek."
              />
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

          {/* Mobile Apps Coming Soon Badge & Socials (Sidebar Footer) */}
          <div className="mt-auto pt-4 border-t border-slate-800/80 flex flex-col gap-3">
            <div className="flex justify-center">
              <div className="group relative flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/40 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all duration-300 w-full justify-center">
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-[0.95rem] w-auto text-slate-400 group-hover:text-white transition-colors" fill="currentColor">
                    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-1.956.04-3.766 1.146-4.773 2.926-2.04 3.593-.522 8.913 1.473 11.832 1.01 1.493 2.203 3.167 3.834 3.107 1.554-.06 2.146-.99 3.992-.99 1.826 0 2.373.99 3.992.95 1.666-.04 2.684-1.494 3.652-2.926 1.127-1.666 1.593-3.272 1.613-3.352-.04-.01-3.13-1.228-3.15-4.87-.02-3.05 2.455-4.52 2.573-4.58-1.434-2.126-3.666-2.414-4.472-2.473-2.022-.18-3.816 1.206-4.755 1.206-.92 0-2.39-1.206-4.027-1.166v.05zm1.5-3.674c.85-.996 1.423-2.385 1.258-3.785-1.185.05-2.656.79-3.526 1.805-.694.793-1.34 2.213-1.146 3.594 1.334.1 2.564-.626 3.414-1.614z"/>
                  </svg>
                  <svg viewBox="0 0 576 512" className="h-[0.9rem] w-auto text-green-500/80 group-hover:text-green-400 transition-colors" fill="currentColor">
                    <path d="M420.22 165.73l42.6-70.1c4.54-7.46 2.14-17.18-5.35-21.73-7.48-4.55-17.25-2.15-21.8 5.3L392.4 149.3c-31.5-13.84-66.23-21.65-103.14-21.65s-71.6 7.8-103.1 21.64L142.75 79.2C138.2 71.75 128.45 69.34 121 73.9c-7.5 4.54-9.9 14.26-5.35 21.73l42.6 70.1c-96.16 52.84-158.33 147.28-158.33 252.37H578.4c0-105-62.1-199.5-158.18-252.37zM186.27 341.25c-18.06 0-32.8-14.74-32.8-32.8 0-18.08 14.74-32.8 32.8-32.8 18.1 0 32.83 14.73 32.83 32.8 0 18.07-14.75 32.8-32.83 32.8zm203.46 0c-18.1 0-32.8-14.74-32.8-32.8 0-18.08 14.7-32.8 32.8-32.8 18.1 0 32.8 14.73 32.8 32.8 0 18.07-14.73 32.8-32.8 32.8z"/>
                  </svg>
                </div>
                <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                  Uygulamalarımız Yakında
                </span>
              </div>
            </div>

            <div className="flex justify-center items-center gap-3">
              <a href="https://github.com/drtaylanaktas" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.083-.729.083-.729 1.205.085 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/></svg>
              </a>
              <a href="https://www.linkedin.com/in/cmyo" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="https://www.instagram.com/cicekdagimeslekyuksekokulu/" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              </a>
              <a href="https://x.com/cicekdagimyo" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            </div>

            {currentUser && (
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
            )}
          </div>
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
            <Link
              href="/etkinlikler"
              className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
              title="Çiçekdağı + Ahi Evran Haber Takvimi"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Haber Takvimi</span>
            </Link>
            {/* Weather: temp available → full display */}
            {weatherData?.temp !== null && weatherData !== null && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs text-slate-300">
                {getWeatherIcon(weatherData.code)}
                <span className="font-medium">{Math.round(weatherData.temp)}{weatherData.unit}</span>
                <span className="text-slate-500 hidden md:inline">{weatherData.locationName}</span>
              </div>
            )}
            {/* Location icon: shows whenever temp is not loaded */}
            {(weatherData === null || weatherData.temp === null) && (
              <button
                onClick={() => {
                  if (locationPermission === 'denied') {
                    alert('Konum iznini etkinleştirmek için tarayıcı adres çubuğundaki kilit/bilgi ikonuna tıklayın, konum iznini "İzin Ver" olarak değiştirin ve sayfayı yenileyin.');
                  } else {
                    localStorage.removeItem('location_banner_dismissed');
                    requestLocation();
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                title={locationPermission === 'denied' ? 'Tarayıcı ayarlarından konum iznini etkinleştirin' : 'Konuma erişime izin ver'}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-xs">
                  {locationPermission === 'denied' ? 'Konum kapalı' : weatherData?.error === 'weather' ? 'Hava yüklenemedi' : 'Konum izni ver'}
                </span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 transition-colors"
              title="Çıkış Yap"
              aria-label="Çıkış Yap"
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
          {messages.length === 0 ? (
            <div className="max-w-5xl mx-auto h-full flex flex-col md:flex-row md:items-center md:justify-center gap-8 md:gap-12 opacity-90 relative z-10">
              {/* Sol: brand + quick cards */}
              <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
                <div className="relative w-24 h-24 md:w-28 md:h-28 mb-4 animate-float">
                  <Image
                    src="/logo.png"
                    alt="ÇMYO Logo"
                    fill
                    className="object-contain drop-shadow-[0_0_25px_rgba(0,128,255,0.3)]"
                  />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">ÇMYO.AI Asistan</h2>
                <p className="text-slate-400 max-w-md mb-6 text-sm">
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
                      className="flex items-center gap-3 p-3 premium-border-hover rounded-xl text-left text-sm text-slate-300 hover:text-white transition-all group cursor-pointer"
                    >
                      <span className="text-lg">{s.icon}</span>
                      <span className="group-hover:text-blue-300 transition-colors">{s.text}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Sağ: Haber Takvimi */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="shrink-0 flex justify-center"
              >
                <MiniCalendar />
              </motion.div>
            </div>
          ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            <AnimatePresence initial={false}>
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
                      ? 'bg-blue-600/90 backdrop-blur text-white rounded-tr-none border border-blue-500/20'
                      : 'bg-slate-800/85 backdrop-blur text-blue-50 rounded-tl-none border border-white/10'
                      }`}>
                      {/* Name & Role Badges */}
                      {msg.role === 'user' ? (
                        <div className="flex items-center gap-2 mb-1.5 text-[10px] tracking-wide uppercase font-bold text-blue-100/90">
                          <span>{currentUser?.name || 'Kullanıcı'}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold ${
                            currentUser?.role === 'admin'
                              ? 'badge-glow-admin'
                              : currentUser?.role === 'academic'
                              ? 'badge-glow-academic'
                              : 'badge-glow-student'
                          }`}>
                            {currentUser?.role === 'admin' ? 'YÖNETİCİ' : currentUser?.role === 'academic' ? 'HOCA' : 'ÖĞRENCİ'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-1.5 text-[10px] tracking-wide uppercase font-bold">
                          <span className="text-blue-400 neon-text-blue font-extrabold">ÇMYO.AI Yapay Zeka</span>
                        </div>
                      )}

                      {/* Copy Button */}
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        aria-label={copiedId === msg.id ? 'Kopyalandı' : 'Mesajı kopyala'}
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
                        <div
                          aria-live={streamingId === msg.id ? 'polite' : undefined}
                          className="prose prose-invert prose-sm max-w-none prose-headings:text-blue-200 prose-strong:text-blue-100 prose-a:text-blue-400 prose-code:text-green-300 prose-code:bg-slate-900/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-900/80 prose-pre:border prose-pre:border-slate-700/50 prose-table:border-collapse [&_th]:bg-slate-800/50 [&_th]:border [&_th]:border-slate-700/50 [&_th]:px-3 [&_th]:py-2 [&_td]:border [&_td]:border-slate-700/50 [&_td]:px-3 [&_td]:py-2 prose-li:marker:text-blue-400">

                          {(() => {
                            const rawContent = streamingId === msg.id ? streamingText : msg.content;
                            const cleanText = stripJsonBlock(rawContent);
                            const blocks = parseContentBlocks(cleanText);

                            const markdownComponents = {
                              a: ({ href, children }: any) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 underline underline-offset-2 hover:text-blue-300 transition-colors"
                                >
                                  {children}
                                </a>
                              ),
                              blockquote: CustomBlockquote,
                              table: CustomTable,
                              thead: CustomThead,
                              th: CustomTh,
                              tr: CustomTr,
                              td: CustomTd,
                              li: CustomLi
                            };

                            return (
                              <div className="flex flex-col gap-1.5">
                                {blocks.map((block, bIdx) => {
                                  if (block.type === 'flashcards') {
                                    if (block.isComplete === false) {
                                      return <CustomFlashcardsPreparing key={bIdx} content={block.content} />;
                                    }
                                    return <CustomFlashcards key={bIdx} content={block.content} />;
                                  }

                                  if (block.type === 'accordion') {
                                    return (
                                      <CustomAccordion key={bIdx} title={block.title || 'Detaylar'}>
                                        <ReactMarkdown
                                          remarkPlugins={[remarkGfm]}
                                          components={markdownComponents}
                                        >
                                          {block.content}
                                        </ReactMarkdown>
                                      </CustomAccordion>
                                    );
                                  }

                                  return (
                                    <div key={bIdx} className="relative">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={markdownComponents}
                                      >
                                        {block.content}
                                      </ReactMarkdown>
                                      {streamingId === msg.id && bIdx === blocks.length - 1 && (
                                        <span className="inline-block w-0.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex justify-start w-full gap-4"
              >
                {/* Avatar — mevcut asistan mesajlarıyla aynı stil, yumuşak nabız parıltısı */}
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 border border-blue-500/30 bg-slate-900 overflow-hidden mt-1 think-glow">
                  <Image src="/logo.png" alt="Bot" width={40} height={40} className="w-full h-full object-cover" />
                </div>

                {/* Shimmer text pill */}
                <div className="bg-slate-800/60 px-4 py-3 rounded-2xl rounded-tl-none border border-white/5 flex items-center min-h-[44px]">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={loadingPhase}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="think-shimmer text-sm font-medium select-none tracking-tight"
                    >
                      {LOADING_PHASES[loadingPhase]}
                    </motion.span>
                  </AnimatePresence>
                  <span className="think-shimmer text-sm font-medium select-none ml-0.5">…</span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
          )}
        </div>

        {/* Input Area */}
        <div className="mt-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] w-full bg-[#050a14] border-t border-white/5 shrink-0 z-20">
          <div className="max-w-3xl mx-auto w-full relative flex gap-2 sm:gap-3 items-end">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".docx,.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
            />

            {hasSupport && (
              <button
                type="button"
                onClick={handleMicClick}
                aria-label={isListening ? 'Dinlemeyi durdur' : 'Sesli giriş'}
                aria-pressed={isListening}
                className={`h-[50px] w-[50px] sm:h-[54px] sm:w-[54px] rounded-xl transition-all flex items-center justify-center shrink-0 ${isListening
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
              className={`h-[50px] w-[50px] sm:h-[54px] sm:w-[54px] rounded-xl transition-all flex items-center justify-center shrink-0 ${isUploading
                ? 'bg-blue-500/20 text-blue-400 animate-pulse border border-blue-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700'
                }`}
              title="Belge Ekle (.docx, .pdf)"
              aria-label="Belge ekle"
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

              {/* Academic Assistant Launcher */}
              <div className={`absolute -top-10 flex items-center gap-2 transition-all duration-300 ${attachment ? 'left-[180px]' : 'left-0'}`}>
                <button
                  type="button"
                  onClick={() => setShowAcademicPanel(true)}
                  className="px-3 py-1 bg-gradient-to-r from-blue-600/40 to-purple-600/40 hover:from-blue-600/60 hover:to-purple-600/60 border border-blue-500/45 rounded-lg text-xs text-blue-200 flex items-center gap-1.5 shadow-lg shadow-blue-500/10 hover:border-blue-400/80 transition-all font-semibold cursor-pointer whitespace-nowrap animate-in fade-in"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-300 animate-pulse" />
                  <span>Akademik Asistan <span className="hidden sm:inline">(Humanizer & AI)</span></span>
                </button>
              </div>

              {/* Quota Badge */}
              {userRole !== 'admin' && remainingQuota !== null && (
                <div className={`absolute -top-10 right-0 border rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs animate-in fade-in slide-in-from-bottom-2 ${remainingQuota === 0 ? 'bg-red-900/50 border-red-500/30 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-800/80 border-slate-600/50 text-slate-300'}`}>
                   <span className="font-medium">Kalan Mesaj: {remainingQuota}/100</span>
                </div>
              )}

              <div className={`relative w-full flex items-end rounded-xl border border-transparent transition-all p-1 ${remainingQuota === 0 ? 'bg-red-950/20' : 'bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:bg-slate-800/80'}`}>
                <textarea
                  ref={chatInputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter: gönder; Shift+Enter: yeni satır; IME bileşimi sırasında geç
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (!isLoading && (input.trim() || attachment)) {
                        handleSend();
                      }
                    }
                  }}
                  rows={1}
                  disabled={isBlocked || remainingQuota === 0}
                  placeholder={remainingQuota === 0 ? "Günlük limitiniz doldu. Lütfen yarın tekrar deneyin." : (isBlocked ? `Kısıtlandı: ${blockTimer}s` : (attachment ? "Belge hakkında bir şeyler sorun..." : "Bir şeyler yazın... (Shift+Enter: yeni satır)"))}
                  className="flex-1 bg-transparent border-0 px-3 sm:px-4 py-2 sm:py-2.5 text-white placeholder-slate-500 focus:ring-0 focus:outline-none min-w-0 text-sm sm:text-base leading-6 resize-none disabled:opacity-70"
                />
                <button
                  type="submit"
                  disabled={(!input.trim() && !attachment) || isLoading}
                  className="p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 disabled:opacity-50 disabled:bg-transparent disabled:text-slate-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center shrink-0 self-end mb-0.5"
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </form>
          </div>

          {/* Compact Disclaimer & Links */}
          <div className="text-center mt-2.5">
            <p className="text-[10px] text-slate-600 flex flex-wrap items-center justify-center gap-1.5">
              <span>ÇMYO.AI yanlış bilgiler gösterebilir. Verilen yanıtları doğrulayın.</span>
              <span className="text-slate-800 hidden sm:inline">•</span>
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-blue-400 transition-colors">Kullanım Koşulları</a>
              <span className="text-slate-800">•</span>
              <a href="/kvkk" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-blue-400 transition-colors">KVKK</a>
              <span className="text-slate-800">•</span>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-blue-400 transition-colors">Gizlilik</a>
            </p>
          </div>
        </div>
      </main>
    </div>

      <AnimatePresence>
          {showWhatsNew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={dismissWhatsNew} />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-blue-500/10 overflow-hidden pointer-events-auto"
            >
              {/* Gradient header strip */}
              <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500" />

              <div className="p-6 sm:p-8">
                {/* Title */}
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-blue-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    <Image src="/logo.png" alt="CMYO.AI" width={40} height={40} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{"\u00C7"}MYO.AI v1.6.1</h2>
                    <p className="text-xs text-slate-400">Haziran 2026</p>
                  </div>
                </div>

                <p className="text-sm text-slate-300 mt-4 mb-5 leading-relaxed">
                  Yeni nesil akademik asistan {"\u00F6"}zellikleri ve premium tasar{"\u0131"}m g{"\u00FC"}ncellemeleriyle kar{"\u015F"}{"\u0131"}n{"\u0131"}zday{"\u0131"}z!
                </p>

                {/* ★ HERO FEATURE: Humanizer — gradient-bordered premium card */}
                <div className="relative mb-4 rounded-xl p-[1px] bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500">
                  <div className="bg-slate-900 rounded-[11px] p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-white">Akademik AI Humanizer</h3>
                          <span className="text-[9px] font-bold bg-gradient-to-r from-blue-500 to-purple-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">T{"\u00FC"}rkiye{"\u2019"}de {"\u0130"}lk</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Turnitin ve GPTZero uyumlu {"\u00E7"}ok a{"\u015F"}amal{"\u0131"} insans{"\u0131"}la{"\u015F"}t{"\u0131"}rma motoru. 26 AI yaz{"\u0131"}m kal{"\u0131"}b{"\u0131"}n{"\u0131"} tespit eder, Blader Playbook ile metninizi do{"\u011F"}al akademik dile d{"\u00F6"}n{"\u00FC"}{"\u015F"}t{"\u00FC"}r{"\u00FC"}r. Ses kalibrasyonu, audit denetimi ve T{"\u00FC"}rk{"\u00E7"}e AI kal{"\u0131"}p tespiti dahil.
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md font-medium">Multi-Pass Engine</span>
                          <span className="text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md font-medium">Audit Loop</span>
                          <span className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md font-medium">TR + EN</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Other Features */}
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">3D D{"\u00F6"}nebilen Flashcard Kartlar{"\u0131"}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Kelime, terim ve konular{"\u0131"} ezberlerken kullanabilece{"\u011F"}iniz, canl{"\u0131"} y{"\u00FC"}kleme barl{"\u0131"} 3D interaktif kartlar.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">G{"\u00F6"}rsel Ak{"\u0131"}ll{"\u0131"} Yan{"\u0131"}t Kartlar{"\u0131"}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Callout kutular{"\u0131"}, interaktif akordeon a{"\u00E7"}{"\u0131"}l{"\u0131"}r-kapan{"\u0131"}r men{"\u00FC"}ler, premium tablolar ve g{"\u00F6"}rev listeleri.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Lightbulb className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Mobil Deste{"\u011F"}i ve H{"\u0131"}zl{"\u0131"} Altyap{"\u0131"}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Geli{"\u015F"}mi{"\u015F"} veritaban{"\u0131"} caching sistemi ve mobil WebView / Android tam uyumlulu{"\u011F"}u.</p>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={dismissWhatsNew}
                  className="w-full mt-6 py-2.5 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-500 hover:via-purple-500 hover:to-cyan-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20"
                >
                  Anlad{"\u0131"}m, Ke{"\u015F"}fetmeye Ba{"\u015F"}la
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAcademicPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ width: '100vw', height: '100vh', top: 0, left: 0 }}
          >
            {/* Backdrop — full viewport */}
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setShowAcademicPanel(false)} />

            {/* Modal Container — explicit sizing */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex flex-col bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl shadow-blue-500/5 overflow-hidden"
              style={{ width: 'min(90vw, 1200px)', height: 'min(88vh, 900px)' }}
            >
              {/* Premium Glow effects */}
              <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
              <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

              {/* Decorative top border */}
              <div className="h-1.5 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-500 w-full shrink-0" />

              {/* Header */}
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-950/40 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-lg shadow-blue-500/5">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      Akademik Asistan Paneli
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">v1.6.1 Premium</span>
                    </h2>
                    <p className="text-xs text-slate-400">Tez, makale ve ödevler için Turnitin/GPTZero uyumlu AI Analizi &amp; İnsansılaştırma</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAcademicPanel(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* First-Time Onboarding Tips Overlay */}
              {showAcademicTips && (
                <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ top: '60px' }}>
                  {/* Semi-transparent overlay */}
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" />
                  
                  {/* Tips Card */}
                  <motion.div
                    key={academicTipsStep}
                    initial={{ opacity: 0, y: 16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="relative w-full max-w-md mx-4 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-blue-500/10 overflow-hidden"
                  >
                    {/* Progress bar */}
                    <div className="h-1 bg-slate-800 w-full">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out" 
                        style={{ width: `${((academicTipsStep + 1) / 4) * 100}%` }} 
                      />
                    </div>

                    <div className="p-6">
                      {/* Step indicator */}
                      <div className="flex items-center gap-2 mb-4">
                        {[0, 1, 2, 3].map(i => (
                          <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${
                            i === academicTipsStep ? 'bg-blue-400 scale-125' : i < academicTipsStep ? 'bg-blue-600' : 'bg-slate-700'
                          }`} />
                        ))}
                        <span className="text-[10px] text-slate-500 ml-auto font-medium">Ad{"\u0131"}m {academicTipsStep + 1} / 4</span>
                      </div>

                      {/* Step Content */}
                      {academicTipsStep === 0 && (
                        <div>
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center mb-4">
                            <FileText className="w-7 h-7 text-blue-400" />
                          </div>
                          <h3 className="text-base font-bold text-white mb-2">Metninizi Yap{"\u0131"}{"\u015F"}t{"\u0131"}r{"\u0131"}n</h3>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            Sol paneldeki metin alan{"\u0131"}na analiz etmek veya insans{"\u0131"}la{"\u015F"}t{"\u0131"}rmak istedi{"\u011F"}iniz akademik metni yap{"\u0131"}{"\u015F"}t{"\u0131"}r{"\u0131"}n. Tez b{"\u00F6"}l{"\u00FC"}mleri, makale {"\u00F6"}zetleri, {"\u00F6"}dev metinleri gibi i{"\u00E7"}erikleri destekler.
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                            <Info className="w-3.5 h-3.5" />
                            <span>Maksimum 4000 kelime</span>
                          </div>
                        </div>
                      )}

                      {academicTipsStep === 1 && (
                        <div>
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center mb-4">
                            <Volume2 className="w-7 h-7 text-purple-400" />
                          </div>
                          <h3 className="text-base font-bold text-white mb-2">Ayarlar{"\u0131"}n{"\u0131"}z{"\u0131"} Yap{"\u0131"}n</h3>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            <strong className="text-slate-300">Ses Kalibrasyonu:</strong> Kendi yazd{"\u0131"}{"\u011F"}{"\u0131"}n{"\u0131"}z bir paragraf ekleyin — sistem sizin tarz{"\u0131"}n{"\u0131"}z{"\u0131"} taklit eder.
                          </p>
                          <p className="text-sm text-slate-400 leading-relaxed mt-2">
                            <strong className="text-slate-300">Dil Se{"\u00E7"}imi:</strong> {"\u0130"}nsans{"\u0131"}la{"\u015F"}t{"\u0131"}rma dilini se{"\u00E7"}in — Otomatik, T{"\u00FC"}rk{"\u00E7"}e veya {"\u0130"}ngilizce.
                          </p>
                        </div>
                      )}

                      {academicTipsStep === 2 && (
                        <div>
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 flex items-center justify-center mb-4">
                            <ShieldCheck className="w-7 h-7 text-emerald-400" />
                          </div>
                          <h3 className="text-base font-bold text-white mb-2">{"\u0130"}{"\u015F"}lemi Se{"\u00E7"}in</h3>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            <strong className="text-blue-300">{"\u201C"}AI Analiz Et{"\u201D"}</strong> — Metindeki yapay zeka kal{"\u0131"}plar{"\u0131"}n{"\u0131"} ve Turnitin risk skorunu g{"\u00F6"}r{"\u00FC"}n.
                          </p>
                          <p className="text-sm text-slate-400 leading-relaxed mt-2">
                            <strong className="text-purple-300">{"\u201C"}Metni {"\u0130"}nsans{"\u0131"}la{"\u015F"}t{"\u0131"}r{"\u201D"}</strong> — {"\u00C7"}ok a{"\u015F"}amal{"\u0131"} Blader Playbook motoru ile metni do{"\u011F"}al akademik dile d{"\u00F6"}n{"\u00FC"}{"\u015F"}t{"\u00FC"}r{"\u00FC"}n.
                          </p>
                        </div>
                      )}

                      {academicTipsStep === 3 && (
                        <div>
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center mb-4">
                            <Sparkles className="w-7 h-7 text-cyan-400" />
                          </div>
                          <h3 className="text-base font-bold text-white mb-2">Sonu{"\u00E7"}lar Sa{"\u011F"} Panelde</h3>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            Analiz sonu{"\u00E7"}lar{"\u0131"} ve insans{"\u0131"}la{"\u015F"}t{"\u0131"}r{"\u0131"}lm{"\u0131"}{"\u015F"} metin sa{"\u011F"} panelde g{"\u00F6"}r{"\u00FC"}necek. AI skorunuzu takip edin, orijinal-yeni metin kar{"\u015F"}{"\u0131"}la{"\u015F"}t{"\u0131"}rmas{"\u0131"} yap{"\u0131"}n ve sonucu kopyalay{"\u0131"}n veya sohbete aktar{"\u0131"}n.
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
                            <Check className="w-3.5 h-3.5" />
                            <span>Haz{"\u0131"}rs{"\u0131"}n{"\u0131"}z — hadi ba{"\u015F"}layal{"\u0131"}m!</span>
                          </div>
                        </div>
                      )}

                      {/* Navigation buttons */}
                      <div className="flex items-center justify-between mt-6">
                        <button
                          onClick={dismissAcademicTips}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                        >
                          Ge{"\u00E7"}
                        </button>
                        <button
                          onClick={nextAcademicTip}
                          className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 cursor-pointer flex items-center gap-1.5"
                        >
                          {academicTipsStep < 3 ? (
                            <><span>Sonraki</span><ChevronDown className="w-3.5 h-3.5 -rotate-90" /></>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" /><span>Ba{"\u015F"}la</span></>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              <div className="flex-1 min-h-0" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
                {/* Left Side: Input Panel */}
                <div className="flex flex-col border-r border-white/5 min-h-0 overflow-hidden">
                  <div className="flex-1 flex flex-col p-5 sm:p-6 overflow-y-auto min-h-0">
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <label className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-400" />
                        Akademik Metin Girişi
                      </label>
                      <span className={`text-xs ${
                        (academicInput.trim() === '' ? 0 : academicInput.trim().split(/\s+/).length) > 4000
                          ? 'text-rose-400 font-bold animate-pulse'
                          : 'text-slate-500 font-medium'
                      }`}>
                        {academicInput.trim() === '' ? 0 : academicInput.trim().split(/\s+/).length} / 4000 kelime
                      </span>
                    </div>

                    <textarea
                      value={academicInput}
                      onChange={(e) => setAcademicInput(e.target.value)}
                      placeholder="Analiz edilmesini veya Turnitin dedektörlerinden geçmesi için insansılaştırılmasını istediğiniz akademik metni buraya yapıştırın (Makale özeti, tez bölümleri, raporlar vb.)..."
                      className="w-full flex-1 min-h-[180px] bg-slate-950/60 border border-white/5 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm leading-relaxed resize-none"
                    />

                    {/* Voice Style Calibration Accordion */}
                    <div className="mt-3 border border-white/5 rounded-xl bg-slate-950/30 overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAcademicVoiceInput(!showAcademicVoiceInput)}
                        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium text-slate-300 hover:bg-white/5 transition-all"
                      >
                        <span className="flex items-center gap-2">
                          <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                          Ses ve Yazım Tarzı Kalibrasyonu <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full font-normal">Opsiyonel</span>
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showAcademicVoiceInput ? 'rotate-180' : ''}`} />
                      </button>
                      {showAcademicVoiceInput && (
                        <div className="px-4 pb-3 border-t border-white/5 bg-slate-950/20">
                          <p className="text-[11px] text-slate-400 mb-2 leading-relaxed pt-2">
                            Kendi yazdığınız 1-2 akademik paragraf ekleyin. Sistem sizin tarzınızı taklit eder.
                          </p>
                          <textarea
                            value={academicVoiceSample}
                            onChange={(e) => setAcademicVoiceSample(e.target.value)}
                            placeholder="Kendi yazım tarzınızdan örnek paragraflar yapıştırın..."
                            className="w-full h-20 bg-slate-950/80 border border-white/5 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Hedef Dil Seçimi */}
                    <div className="mt-3 border border-white/5 rounded-xl bg-slate-950/30 p-3 flex flex-col gap-2 shrink-0">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                        Hedef İnsansılaştırma Dili
                      </label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-white/5">
                        <button type="button" onClick={() => setAcademicLanguage('auto')} className={`py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${academicLanguage === 'auto' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Otomatik</button>
                        <button type="button" onClick={() => setAcademicLanguage('tr')} className={`py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${academicLanguage === 'tr' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Türkçe</button>
                        <button type="button" onClick={() => setAcademicLanguage('en')} className={`py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${academicLanguage === 'en' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>English</button>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-4 grid grid-cols-2 gap-3 shrink-0">
                      <button
                        onClick={() => handleAcademicProcess('detect')}
                        disabled={!!academicAction || !academicInput.trim() || (academicInput.trim().split(/\s+/).length) > 4000}
                        className="group py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 border border-white/10 hover:border-slate-500/50 rounded-xl text-white text-xs sm:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {academicAction === 'detect' ? (
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                        ) : (
                          <Activity className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                        )}
                        <span>AI Analizi Yap</span>
                      </button>
                      <button
                        onClick={() => handleAcademicProcess('humanize')}
                        disabled={!!academicAction || !academicInput.trim() || (academicInput.trim().split(/\s+/).length) > 4000}
                        className="group py-3 bg-gradient-to-r from-blue-600/90 to-purple-600/90 hover:from-blue-500 hover:to-purple-500 disabled:opacity-40 rounded-xl text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer border border-blue-400/20"
                      >
                        {academicAction === 'humanize' ? (
                          <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-purple-200 group-hover:animate-pulse" />
                        )}
                        <span>Metni İnsansılaştır</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side: Result & Analysis Display */}
                <div className="flex flex-col min-h-0 bg-slate-950/20 relative overflow-hidden">
                  {/* Loading overlay — outside scrollable area, covers full right panel */}
                  {academicAction && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-500 p-0.5 animate-spin mb-4">
                          <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-blue-400 animate-pulse" />
                          </div>
                        </div>
                      <div className="w-full max-w-xs h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4 border border-white/5 shadow-inner">
                        <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 animate-pulse rounded-full" style={{ width: '100%' }} />
                      </div>
                      <h3 className="text-white font-bold text-sm sm:text-base">İşlem Gerçekleştiriliyor</h3>
                      <p className="text-xs text-slate-400 mt-2 max-w-[280px] leading-relaxed italic">{academicLoadingPhase}</p>
                    </div>
                  )}
                  <div className="flex-1 flex flex-col p-5 sm:p-6 overflow-y-auto min-h-0">

                    {/* Error state */}
                    {academicError && (
                      <div className="p-4 border border-rose-500/20 rounded-xl bg-rose-500/10 text-rose-300 text-xs sm:text-sm flex items-start gap-2.5 mb-4 animate-in fade-in">
                        <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
                        <div className="flex-1">
                          <span className="font-bold block mb-0.5">Analiz Hatası</span>
                          {academicError}
                        </div>
                        <button onClick={() => setAcademicError(null)} className="hover:text-white"><X className="w-4 h-4" /></button>
                      </div>
                    )}

                    {/* Empty state */}
                    {!academicResult && !academicAction && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                        <div className="w-16 h-16 rounded-full bg-slate-800/40 border border-slate-700/50 flex items-center justify-center text-slate-500 mb-4">
                          <Bot className="w-8 h-8" />
                        </div>
                        <h3 className="text-slate-300 font-semibold text-sm sm:text-base">Analiz ve Çıktı Ekranı</h3>
                        <p className="text-xs text-slate-500 max-w-xs mt-2 leading-relaxed">
                          Metninizi soldaki kutuya yapıştırıp <span className="text-blue-400 font-medium">AI Analizi Yap</span> veya <span className="text-purple-400 font-medium">Metni İnsansılaştır</span> butonuna basarak işlemleri başlatın.
                        </p>
                      </div>
                    )}

                    {/* AI Detection Result */}
                    {academicResult && academicResultType === 'detect' && !academicAction && (
                      <div className="w-full flex-1 flex flex-col space-y-4 animate-in fade-in slide-in-from-right-3">
                        <div className="p-4 border rounded-2xl flex flex-col sm:flex-row items-center gap-4 bg-slate-900/60 border-white/5 shadow-xl">
                          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle cx="48" cy="48" r="40" className="stroke-slate-800 fill-transparent" strokeWidth="8" />
                              <circle cx="48" cy="48" r="40" className={`fill-transparent transition-all duration-1000 ${academicResult.score < 20 ? 'text-emerald-400 stroke-emerald-400 animate-pulse' : academicResult.score < 50 ? 'text-yellow-400 stroke-yellow-400' : academicResult.score < 80 ? 'text-orange-400 stroke-orange-400' : 'text-rose-500 stroke-rose-500'}`} strokeWidth="8" strokeDasharray={2 * Math.PI * 40} strokeDashoffset={(2 * Math.PI * 40) - (academicResult.score / 100) * (2 * Math.PI * 40)} strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-xl font-extrabold text-white">{academicResult.score}%</span>
                              <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">AI Skoru</span>
                            </div>
                          </div>
                          <div className="flex-1 text-center sm:text-left">
                            <div className="flex items-center justify-center sm:justify-start gap-2">
                              <span className="text-xs text-slate-400 font-medium">Genel Algılama Durumu:</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${academicResult.score < 20 ? 'bg-emerald-500/10 text-emerald-400' : academicResult.score < 50 ? 'bg-yellow-500/10 text-yellow-400' : academicResult.score < 80 ? 'bg-orange-500/10 text-orange-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {academicResult.score < 20 ? 'İnsansı Yazım (Güvenli)' : academicResult.score < 50 ? 'Kısmen AI (Şüpheli)' : academicResult.score < 80 ? 'Yüksek AI Olasılığı' : 'Yapay Zeka (Kritik Algılama)'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-2 leading-relaxed font-light">{academicResult.feedback}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-900/40 border border-white/5 rounded-xl text-center">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Perplexity</span>
                            <span className={`text-sm font-extrabold block mt-1 ${academicResult.metrics.perplexity === 'High' ? 'text-emerald-400' : academicResult.metrics.perplexity === 'Medium' ? 'text-yellow-400' : 'text-rose-400'}`}>
                              {academicResult.metrics.perplexity === 'High' ? 'Yüksek (İyi)' : academicResult.metrics.perplexity === 'Medium' ? 'Orta' : 'Düşük (Robotik)'}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900/40 border border-white/5 rounded-xl text-center">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Burstiness</span>
                            <span className={`text-sm font-extrabold block mt-1 ${academicResult.metrics.burstiness === 'High' ? 'text-emerald-400' : academicResult.metrics.burstiness === 'Medium' ? 'text-yellow-400' : 'text-rose-400'}`}>
                              {academicResult.metrics.burstiness === 'High' ? 'Yüksek (İnsan Ritmi)' : academicResult.metrics.burstiness === 'Medium' ? 'Orta' : 'Düşük (Tekdüze)'}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900/40 border border-white/5 rounded-xl text-center">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Tekrarlayan Sözcük</span>
                            <span className="text-sm font-extrabold text-white block mt-1">{academicResult.metrics.repetitiveWordsScore}/100</span>
                          </div>
                          <div className="p-3 bg-slate-900/40 border border-white/5 rounded-xl text-center">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Robotik Geçiş</span>
                            <span className="text-sm font-extrabold text-white block mt-1">{academicResult.metrics.roboticTransitionsScore}/100</span>
                          </div>
                        </div>

                        <div className="flex-1 flex flex-col min-h-[120px] bg-slate-900/30 border border-white/5 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-950/40 border-b border-white/5 shrink-0">
                            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-orange-400" />
                              İşaretlenen Robotik Cümleler ({academicResult.highlights.length})
                            </span>
                          </div>
                          <div className="p-4 flex-1 overflow-y-auto space-y-2 text-xs text-slate-300">
                            {academicResult.highlights.length === 0 ? (
                              <div className="h-full flex items-center justify-center text-slate-500 italic">Robotik kalıp algılanmadı. Harika!</div>
                            ) : (
                              academicResult.highlights.map((item: any, idx: number) => (
                                <div key={idx} className="p-3 border border-orange-500/10 bg-orange-500/5 rounded-lg flex flex-col gap-1 transition-all hover:bg-orange-500/10">
                                  <span className="font-serif italic text-slate-200 border-l-2 border-orange-400 pl-2 leading-relaxed">&ldquo;{item.originalText}&rdquo;</span>
                                  <span className="text-[10px] text-orange-300 font-medium bg-orange-500/20 px-2 py-0.5 rounded self-start">Neden: {item.reason}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {academicResult.score >= 20 && (
                          <button onClick={() => handleAcademicProcess('humanize')} className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-xs font-bold hover:from-blue-500 hover:to-purple-500 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10 border border-white/10 shrink-0">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Bu Metni Hemen İnsansılaştır</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Humanize Result */}
                    {academicResult && academicResultType === 'humanize' && !academicAction && (
                      <div className="w-full flex-1 flex flex-col space-y-3 animate-in fade-in slide-in-from-right-3">
                        {/* Header: Tabs + Score Badge + Pass Count */}
                        <div className="flex items-center justify-between border-b border-white/5 pb-2 shrink-0 flex-wrap gap-2">
                          <div className="bg-slate-900 p-0.5 rounded-lg border border-white/5 flex">
                            <button onClick={() => setAcademicActiveTab('before')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${academicActiveTab === 'before' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}>Orijinal Metin</button>
                            <button onClick={() => setAcademicActiveTab('after')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${academicActiveTab === 'after' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}>İnsansılaştırılmış Metin</button>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Pass Count Badge */}
                            {academicResult.passCount && (
                              <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2 py-1">
                                <span className="text-[10px] font-bold text-purple-300">{academicResult.passCount === 1 ? '1-Pass ✅' : '2-Pass ✅✅'}</span>
                              </div>
                            )}
                            {/* AI Score Badge */}
                            <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${
                              (academicResult.finalAiScore ?? academicResult.aiScoreAfter ?? 50) <= 20
                                ? 'bg-emerald-500/10 border border-emerald-500/20'
                                : (academicResult.finalAiScore ?? academicResult.aiScoreAfter ?? 50) <= 40
                                  ? 'bg-yellow-500/10 border border-yellow-500/20'
                                  : 'bg-rose-500/10 border border-rose-500/20'
                            }`}>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className={`text-[10px] font-bold ${
                                (academicResult.finalAiScore ?? academicResult.aiScoreAfter ?? 50) <= 20 ? 'text-emerald-300' : (academicResult.finalAiScore ?? academicResult.aiScoreAfter ?? 50) <= 40 ? 'text-yellow-300' : 'text-rose-300'
                              }`}>AI Skor: {academicResult.originalAiScore ?? '?'}% → {academicResult.finalAiScore ?? academicResult.aiScoreAfter ?? '?'}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Text Display */}
                        <div className="flex-1 min-h-[180px] bg-slate-950/60 border border-white/5 rounded-xl p-4 overflow-y-auto">
                          {academicActiveTab === 'before' ? (
                            <div className="text-xs sm:text-sm text-slate-400 leading-relaxed font-light whitespace-pre-wrap select-text">{academicInput}</div>
                          ) : (
                            <div className="text-xs sm:text-sm text-slate-100 leading-relaxed whitespace-pre-wrap select-text">{academicResult.humanizedText}</div>
                          )}
                        </div>

                        {/* Audit Log — Improvements List */}
                        {academicResult.auditLog && academicResult.auditLog.length > 0 && (
                          <div className="p-3 bg-slate-900/30 border border-white/5 rounded-xl shrink-0 max-h-[160px] overflow-y-auto">
                            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Blader Playbook — Yapılan İyileştirmeler ({academicResult.auditLog.length})</span>
                            <ul className="space-y-1 text-[11px]">
                              {academicResult.auditLog.map((log: string, idx: number) => (
                                <li key={idx} className="flex items-start gap-1.5 leading-relaxed text-slate-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                                  <span>{log}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                          <button
                            onClick={() => { navigator.clipboard.writeText(academicResult.humanizedText); alert('İnsansılaştırılmış metin panoya kopyalandı.'); }}
                            className="py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs sm:text-sm font-bold border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-4 h-4 text-slate-400" />
                            <span>Metni Kopyala</span>
                          </button>
                          <button
                            onClick={() => { setInput(academicResult.humanizedText); setShowAcademicPanel(false); }}
                            className="py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/10 hover:from-blue-500 hover:to-cyan-500 border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Share2 className="w-4 h-4 text-white" />
                            <span>Chate Aktar</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
