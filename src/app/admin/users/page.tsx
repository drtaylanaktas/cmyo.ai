'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Users, MessageCircle, User, Bot, Clock, Mail, Building, Calendar, ArrowLeft, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UserRecord {
    id: number;
    name: string;
    surname: string;
    email: string;
    role: string;
    title: string | null;
    academic_unit: string | null;
    created_at: string;
    email_verified: boolean;
    conversation_count: string;
}

interface Conversation {
    id: string;
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

const roleLabel = (role: string) => {
    if (role === 'academic') return 'Akademisyen';
    if (role === 'student') return 'Öğrenci';
    return role;
};

export default function UsersPage() {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const limit = 20;

    const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [convsLoading, setConvsLoading] = useState(false);

    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [msgsLoading, setMsgsLoading] = useState(false);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(0);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                limit: String(limit),
                offset: String(page * limit),
                ...(search ? { search } : {}),
            });
            const res = await fetch(`/api/admin/users?${params}`);
            const data = await res.json();
            if (res.ok) {
                setUsers(data.users);
                setTotal(data.total);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const selectUser = async (user: UserRecord) => {
        setSelectedUser(user);
        setSelectedConv(null);
        setMessages([]);
        setConvsLoading(true);
        try {
            const res = await fetch(`/api/admin/users/conversations?email=${encodeURIComponent(user.email)}`);
            const data = await res.json();
            if (res.ok) setConversations(data.conversations);
        } catch (err) {
            console.error(err);
        } finally {
            setConvsLoading(false);
        }
    };

    const selectConv = async (conv: Conversation) => {
        setSelectedConv(conv);
        setMessages([]);
        setMsgsLoading(true);
        try {
            const res = await fetch(`/api/admin/chats/${conv.id}`);
            const data = await res.json();
            if (res.ok) setMessages(data.messages);
        } catch (err) {
            console.error(err);
        } finally {
            setMsgsLoading(false);
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-500">
            {/* Left: Users List */}
            <div className="w-1/3 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl flex flex-col">
                <div className="p-4 border-b border-neutral-800/60 bg-neutral-900/50">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-neutral-200">Kayıtlı Kullanıcılar</h3>
                        <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md">
                            {total} Kullanıcı
                        </span>
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                            type="text"
                            placeholder="Ad veya e-posta ara..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full bg-neutral-800/50 border border-neutral-700/50 rounded-lg pl-8 pr-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {loading ? (
                        <div className="py-20 text-center text-neutral-500">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500/50" />
                            Yükleniyor...
                        </div>
                    ) : users.length === 0 ? (
                        <div className="py-20 text-center text-neutral-500 text-sm">Kullanıcı bulunamadı.</div>
                    ) : (
                        users.map((user) => (
                            <div
                                key={user.id}
                                onClick={() => selectUser(user)}
                                className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                                    selectedUser?.id === user.id
                                        ? 'bg-emerald-500/10 border border-emerald-500/30'
                                        : 'hover:bg-neutral-800/50 border border-transparent'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${selectedUser?.id === user.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                                        <User size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium truncate ${selectedUser?.id === user.id ? 'text-emerald-400' : 'text-neutral-200'}`}>
                                            {user.name} {user.surname}
                                        </p>
                                        <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <span className="text-[10px] text-neutral-500">{roleLabel(user.role)}</span>
                                        <span className="flex items-center gap-1 text-[10px] text-neutral-600">
                                            <MessageCircle size={10} />
                                            {user.conversation_count}
                                        </span>
                                    </div>
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

            {/* Right: Detail Panel */}
            <div className="w-2/3 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl flex flex-col">
                {!selectedUser ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
                        <Users size={48} className="text-neutral-800 mb-4" />
                        <p>İncelemek istediğiniz bir kullanıcı seçin.</p>
                    </div>
                ) : selectedConv ? (
                    /* Messages View */
                    <>
                        <div className="p-4 border-b border-neutral-800/60 bg-neutral-900/50 flex items-center gap-3">
                            <button
                                onClick={() => { setSelectedConv(null); setMessages([]); }}
                                className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-neutral-200 truncate">{selectedConv.title}</p>
                                <p className="text-xs text-neutral-500">{selectedUser.name} {selectedUser.surname} · {selectedConv.message_count} mesaj</p>
                            </div>
                            <span className="text-xs text-neutral-600 shrink-0">
                                {new Date(selectedConv.updated_at).toLocaleDateString('tr-TR')}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-neutral-950/30">
                            {msgsLoading ? (
                                <div className="py-20 text-center text-neutral-500">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-500/50" />
                                    Mesajlar Yükleniyor...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center text-neutral-500 text-sm py-10">Bu sohbette mesaj yok.</div>
                            ) : (
                                <AnimatePresence initial={false}>
                                    {messages.map((msg, idx) => (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                                            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center ${msg.role === 'user' ? 'bg-neutral-800 text-neutral-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                                            </div>
                                            <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed ${msg.role === 'user' ? 'bg-neutral-800 text-neutral-200 rounded-tr-sm' : 'bg-emerald-900/30 border border-emerald-500/20 text-emerald-50 rounded-tl-sm'}`}>
                                                    <span className="whitespace-pre-wrap word-break">{msg.content}</span>
                                                </div>
                                                <span className="text-[10px] text-neutral-500 mt-1.5 px-1">
                                                    {new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            )}
                        </div>
                    </>
                ) : (
                    /* User Info + Conversations */
                    <>
                        <div className="p-5 border-b border-neutral-800/60 bg-neutral-900/50">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                    <User size={22} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-white text-lg leading-tight">
                                        {selectedUser.name} {selectedUser.surname}
                                    </h3>
                                    {selectedUser.title && (
                                        <p className="text-sm text-neutral-400 mt-0.5">{selectedUser.title}</p>
                                    )}
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-neutral-500">
                                        <span className="flex items-center gap-1.5">
                                            <Mail size={11} /> {selectedUser.email}
                                        </span>
                                        {selectedUser.academic_unit && (
                                            <span className="flex items-center gap-1.5">
                                                <Building size={11} /> {selectedUser.academic_unit}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1.5">
                                            <Calendar size={11} />
                                            {new Date(selectedUser.created_at).toLocaleDateString('tr-TR')}
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <Clock size={11} />
                                            {selectedUser.email_verified ? 'E-posta doğrulandı' : 'E-posta doğrulanmadı'}
                                        </span>
                                    </div>
                                </div>
                                <span className={`text-xs px-2.5 py-1 rounded-full border shrink-0 ${
                                    selectedUser.role === 'academic'
                                        ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                                        : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                                }`}>
                                    {roleLabel(selectedUser.role)}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800/40">
                            <h4 className="text-sm font-semibold text-neutral-300">Sohbet Geçmişi</h4>
                            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                                {conversations.length} sohbet
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                            {convsLoading ? (
                                <div className="py-16 text-center text-neutral-500">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500/50" />
                                    Yükleniyor...
                                </div>
                            ) : conversations.length === 0 ? (
                                <div className="py-16 text-center text-neutral-500 text-sm">
                                    Bu kullanıcıya ait sohbet yok.
                                </div>
                            ) : (
                                conversations.map((conv) => (
                                    <div
                                        key={conv.id}
                                        onClick={() => selectConv(conv)}
                                        className="p-3 rounded-xl cursor-pointer hover:bg-neutral-800/50 border border-transparent hover:border-neutral-700/50 transition-all duration-200 flex items-center gap-3"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-500 flex items-center justify-center shrink-0">
                                            <MessageCircle size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-neutral-200 font-medium truncate">{conv.title}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">{conv.message_count} mesaj</p>
                                        </div>
                                        <span className="text-[10px] text-neutral-600 shrink-0">
                                            {new Date(conv.updated_at).toLocaleDateString('tr-TR')}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.2); }
                .word-break { word-break: break-word; }
            `}</style>
        </div>
    );
}
