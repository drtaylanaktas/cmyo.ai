'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, FileText, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface Document {
    id: number;
    filename: string;
    content?: string; // Content is only fetched when editing to save bandwidth
    category: string;
    priority: number;
    updated_at: string;
}

export default function AdminDashboard() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const limit = 15;

    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [error, setError] = useState('');
    
    // Form state
    const [currentDoc, setCurrentDoc] = useState<Partial<Document>>({
        filename: '',
        content: '',
        category: 'genel',
        priority: 0
    });

    const fetchDocuments = async (resetPage = false) => {
        setLoading(true);
        try {
            const currentPage = resetPage ? 0 : page;
            const res = await fetch(`/api/admin/knowledge?search=${search}&limit=${limit}&offset=${currentPage * limit}`);
            const data = await res.json();
            
            if (res.ok) {
                setDocuments(data.documents);
                setTotal(data.total);
                if (resetPage) setPage(0);
            } else {
                console.error(data.error);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchDocuments(true);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch on page change
    useEffect(() => {
        fetchDocuments();
    }, [page]);

    const handleEdit = async (doc: Document) => {
        setLoading(true);
        try {
            // Fetch the full content
            const res = await fetch(`/api/admin/knowledge/${doc.id}`);
            const data = await res.json();
            
            if (res.ok) {
                setCurrentDoc(data.document);
                setModalMode('edit');
                setError('');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Bu belgeyi silmek istediğinize emin misiniz? Yapay zeka bu belgeye artık erişemeyecek.')) return;
        
        try {
            const res = await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchDocuments();
            } else {
                alert('Silme işlemi başarısız');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitLoading(true);
        setError('');

        const isEdit = modalMode === 'edit';
        const url = isEdit ? `/api/admin/knowledge/${currentDoc.id}` : '/api/admin/knowledge';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentDoc)
            });
            const data = await res.json();

            if (res.ok) {
                setModalMode(null);
                fetchDocuments();
            } else {
                setError(data.error || 'Bir hata oluştu');
            }
        } catch (err) {
            setError('Sunucu bağlantı hatası');
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        setError('');
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload-and-parse', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (res.ok) {
                setCurrentDoc(prev => ({
                    ...prev,
                    content: (prev.content ? prev.content + '\n\n' : '') + data.text,
                    filename: prev.filename || data.filename
                }));
            } else {
                setError(data.error || 'Dosya yüklenirken bir hata oluştu');
            }
        } catch (err) {
            setError('Sunucu bağlantı hatası');
        } finally {
            setUploadingFile(false);
            e.target.value = '';
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:w-96 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
                    <input 
                        type="text" 
                        placeholder="Belge adı veya içerik ara..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-neutral-900/50 border border-neutral-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-neutral-200 placeholder:text-neutral-600 transition-all outline-none backdrop-blur-sm"
                    />
                </div>
                
                <button 
                    onClick={() => {
                        setCurrentDoc({ filename: '', content: '', category: 'genel', priority: 0 });
                        setModalMode('create');
                        setError('');
                    }}
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto justify-center"
                >
                    <Plus size={18} />
                    <span>Yeni Ekle</span>
                </button>
            </div>

            {/* Data Table */}
            <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-800/50 border-b border-neutral-800 text-sm font-medium text-neutral-400 uppercase tracking-wider">
                                <th className="p-4 pl-6">Dosya Adı</th>
                                <th className="p-4 w-32">Kategori</th>
                                <th className="p-4 w-24 text-center">Öncelik</th>
                                <th className="p-4 w-48">Güncellenme</th>
                                <th className="p-4 w-24 text-right pr-6">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/50 text-sm">
                            {loading && documents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-neutral-500 py-24">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-500/50" />
                                        Yükleniyor...
                                    </td>
                                </tr>
                            ) : documents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-neutral-500 py-24">
                                        Sonuç bulunamadı
                                    </td>
                                </tr>
                            ) : (
                                documents.map((doc, idx) => (
                                    <motion.tr 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        key={doc.id} 
                                        className="hover:bg-neutral-800/30 transition-colors group"
                                    >
                                        <td className="p-4 pl-6 font-medium text-neutral-200 break-all flex items-center gap-3">
                                            <FileText className="text-neutral-500 group-hover:text-emerald-400 transition-colors shrink-0" size={16} />
                                            {doc.filename}
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2.5 py-1 bg-neutral-800 text-neutral-300 rounded-md text-xs font-medium border border-neutral-700/50">
                                                {doc.category}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            {doc.priority >= 100 ? (
                                                <span className="text-emerald-400 font-bold">{doc.priority}</span>
                                            ) : (
                                                <span className="text-neutral-500">{doc.priority}</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-neutral-500 text-xs">
                                            {new Date(doc.updated_at).toLocaleString('tr-TR')}
                                        </td>
                                        <td className="p-4 pr-6 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => handleEdit(doc)}
                                                    className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-emerald-400 transition-colors"
                                                    title="Düzenle"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(doc.id)}
                                                    className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-rose-400 transition-colors"
                                                    title="Sil"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-neutral-800/60 bg-neutral-900/50 flex items-center justify-between text-sm">
                        <span className="text-neutral-500">
                            Toplam <span className="text-neutral-300 font-medium">{total}</span> belge
                        </span>
                        <div className="flex gap-1">
                            {Array.from({ length: totalPages }).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setPage(i)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                        page === i 
                                            ? 'bg-emerald-500 text-white font-medium' 
                                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                                    }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Form Modal */}
            <AnimatePresence>
                {modalMode && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setModalMode(null)}
                        />
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-neutral-800 bg-neutral-900/50">
                                <h3 className="text-xl font-bold">
                                    {modalMode === 'create' ? 'Yeni Bilgi Ekle' : 'Bilgiyi Düzenle'}
                                </h3>
                                <p className="text-sm text-neutral-400 mt-1">
                                    Yapay zeka asistanının okuyabileceği formattaki içeriği girin.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
                                {error && (
                                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm font-medium">
                                        {error}
                                    </div>
                                )}
                                
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Dosya / Bilgi Adı</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={currentDoc.filename}
                                        onChange={e => setCurrentDoc({...currentDoc, filename: e.target.value})}
                                        placeholder="Örn: CMYO_Akademik_Takvim.txt"
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Kategori</label>
                                        <input 
                                            type="text" 
                                            value={currentDoc.category}
                                            onChange={e => setCurrentDoc({...currentDoc, category: e.target.value})}
                                            placeholder="kurumsal, duyuru vb."
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Öncelik (1-100)</label>
                                        <input 
                                            type="number" 
                                            value={currentDoc.priority}
                                            onChange={e => setCurrentDoc({...currentDoc, priority: parseInt(e.target.value) || 0})}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-sm font-medium text-neutral-300">Ham İçerik</label>
                                        <div className="relative">
                                            <input 
                                                type="file" 
                                                id="file-upload" 
                                                className="hidden" 
                                                accept=".pdf,.docx,.xlsx,.xls"
                                                onChange={handleFileUpload}
                                                disabled={uploadingFile}
                                            />
                                            <label 
                                                htmlFor="file-upload" 
                                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                                                    uploadingFile 
                                                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' 
                                                    : 'border-neutral-700 text-neutral-400 hover:text-emerald-400 hover:border-emerald-500/50 bg-neutral-900'
                                                }`}
                                            >
                                                {uploadingFile ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                                {uploadingFile ? 'İşleniyor...' : 'Dosyadan Aktar'}
                                            </label>
                                        </div>
                                    </div>
                                    <textarea 
                                        required
                                        value={currentDoc.content}
                                        onChange={e => setCurrentDoc({...currentDoc, content: e.target.value})}
                                        placeholder="Yapay zekanın okuyacağı bilgileri buraya girin..."
                                        className="w-full h-64 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all font-mono text-sm leading-relaxed whitespace-pre-wrap"
                                    />
                                </div>
                                
                                <div className="pt-4 flex justify-end gap-3 border-t border-neutral-800">
                                    <button 
                                        type="button" 
                                        onClick={() => setModalMode(null)}
                                        className="px-5 py-2.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl font-medium transition-colors"
                                    >
                                        İptal
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={submitLoading}
                                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {submitLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : null}
                                        {modalMode === 'create' ? 'Oluştur ve Kaydet' : 'Değişiklikleri Kaydet'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
