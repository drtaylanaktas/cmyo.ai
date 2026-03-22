'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, MessageCircle, User, Bot, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Conversation {
    id: string;
    user_email: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: string;
}

interface Message {
    id: string;
    role: string;
    content: string;
    created_at: string;
}

export default function ChatsPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const limit = 20;

    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);

    const fetchConversations = async (resetPage = false) => {
        setLoading(true);
        try {
            const currentPage = resetPage ? 0 : page;
            const res = await fetch(`/api/admin/chats?limit=${limit}&offset=${currentPage * limit}`);
            const data = await res.json();
            
            if (res.ok) {
                setConversations(data.conversations);
                setTotal(data.total);
                if (resetPage) setPage(0);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConversations();
    }, [page]);

    const fetchMessages = async (id: string) => {
        setSelectedChatId(id);
        setMessagesLoading(true);
        setMessages([]); // clear old messages immediately
        try {
            const res = await fetch(`/api/admin/chats/${id}`);
            const data = await res.json();
            if (res.ok) {
                setMessages(data.messages);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setMessagesLoading(false);
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-500">
            {/* Left Sidebar: Conversatons List */}
            <div className="w-1/3 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl flex flex-col">
                <div className="p-4 border-b border-neutral-800/60 bg-neutral-900/50 flex justify-between items-center">
                    <h3 className="font-semibold text-neutral-200">Kullanıcı Sohbetleri</h3>
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md">
                        {total} Kayıt
                    </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {loading && conversations.length === 0 ? (
                        <div className="py-20 text-center text-neutral-500">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500/50" />
                            Yükleniyor...
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="py-20 text-center text-neutral-500 text-sm">
                            Kayıtlı sohbet bulunamadı.
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <div 
                                key={conv.id}
                                onClick={() => fetchMessages(conv.id)}
                                className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                                    selectedChatId === conv.id 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 border' 
                                    : 'hover:bg-neutral-800/50 border border-transparent'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-sm font-medium truncate pr-2 ${selectedChatId === conv.id ? 'text-emerald-400' : 'text-neutral-200'}`}>
                                        {conv.user_email}
                                    </span>
                                    <span className="text-[10px] text-neutral-500 whitespace-nowrap pt-0.5">
                                        {new Date(conv.updated_at).toLocaleDateString('tr-TR')}
                                    </span>
                                </div>
                                <p className="text-xs text-neutral-400 line-clamp-1 mb-2">
                                    {conv.title}
                                </p>
                                <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-medium">
                                    <MessageCircle size={12} className="text-neutral-600" />
                                    <span>{conv.message_count} Mesaj</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="p-3 border-t border-neutral-800/60 bg-neutral-900/50 flex justify-center gap-1">
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setPage(i)}
                                className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-all ${
                                    page === i 
                                        ? 'bg-emerald-500 text-white font-medium' 
                                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                                }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Side: Chat Messages */}
            <div className="w-2/3 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl flex flex-col relative">
                {!selectedChatId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 h-full">
                        <MessageCircle size={48} className="text-neutral-800 mb-4" />
                        <p>Detayını görmek istediğiniz bir sohbeti seçin.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-neutral-800/60 bg-neutral-900/50 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                <User size={20} />
                            </div>
                            <div className="overflow-hidden">
                                <h3 className="font-semibold text-neutral-200 truncate">
                                    {conversations.find(c => c.id === selectedChatId)?.user_email}
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-neutral-400">
                                    <Clock size={12} />
                                    <span>{new Date(conversations.find(c => c.id === selectedChatId)?.created_at || '').toLocaleString('tr-TR')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-neutral-950/30">
                            {messagesLoading ? (
                                <div className="py-20 text-center text-neutral-500">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-500/50" />
                                    Mesajlar Yükleniyor...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center text-neutral-500 text-sm py-10">Bu sohbette henüz mesaj yok.</div>
                            ) : (
                                <AnimatePresence initial={false}>
                                    {messages.map((msg, idx) => (
                                        <motion.div 
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(idx * 0.05, 0.5) }} // Cap animation delay
                                            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex flex-shrink-0 items-center justify-center ${
                                                msg.role === 'user' 
                                                ? 'bg-neutral-800 text-neutral-400' 
                                                : 'bg-emerald-500/20 text-emerald-400'
                                            }`}>
                                                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                                            </div>
                                            
                                            <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed relative ${
                                                    msg.role === 'user'
                                                    ? 'bg-neutral-800 text-neutral-200 rounded-tr-sm'
                                                    : 'bg-emerald-900/30 border border-emerald-500/20 text-emerald-50 rounded-tl-sm shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                                }`}>
                                                    <span className="whitespace-pre-wrap word-break">{msg.content}</span>
                                                </div>
                                                <span className="text-[10px] text-neutral-500 mt-1.5 px-1">
                                                    {new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute:'2-digit' })}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Custom Scrollbar Styles appended directly */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(255,255,255,0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(255,255,255,0.2);
                }
                .word-break {
                    word-break: break-word;
                }
            `}</style>
        </div>
    );
}
