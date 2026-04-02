'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NeuralBackground from '@/components/NeuralBackground';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, User, Shield, AlertCircle, CheckCircle, Lock } from 'lucide-react';
import Image from 'next/image';

import { UploadButton } from "@/lib/uploadthing";

export default function ProfilePage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [title, setTitle] = useState('');
    const [avatar, setAvatar] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmed, setDeleteConfirmed] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [passwordLoading, setPasswordLoading] = useState(false);

    useEffect(() => {
        const userStr = localStorage.getItem('cmyo_user');
        if (!userStr) {
            router.push('/login');
            return;
        }
        const userData = JSON.parse(userStr);
        setUser(userData);
        setName(userData.name || '');
        setSurname(userData.surname || '');
        setTitle(userData.title || '');
        setAvatar(userData.avatar || '');
    }, [router]);



    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!name || !surname) {
            setMessage({ type: 'error', text: 'Ad ve soyad zorunludur.' });
            return;
        }

        if (user.role === 'academic' && !title) {
            setMessage({ type: 'error', text: 'Ünvan zorunludur.' });
            return;
        }

        const updatedUser = {
            ...user,
            name,
            surname,
            title: user.role === 'academic' ? title : '',
            avatar
        };

        try {
            const res = await fetch('/api/auth/update-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUser)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Güncelleme başarısız.');
            }

            // Update local session only after successful DB update
            localStorage.setItem('cmyo_user', JSON.stringify(updatedUser)); // For persistent login
            setUser(updatedUser);
            setMessage({ type: 'success', text: 'Profiliniz başarıyla güncellendi!' });

        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordMessage(null);
        setPasswordLoading(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Şifre değiştirilemedi.');
            setPasswordMessage({ type: 'success', text: 'Şifreniz başarıyla güncellendi!' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            setPasswordMessage({ type: 'error', text: error.message });
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleRequestDeletion = async () => {
        setDeleteLoading(true);
        try {
            const res = await fetch('/api/auth/request-deletion', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
            setDeleteMessage({ type: 'success', text: 'Hesap silme talebiniz alındı. Yönetici onayından sonra hesabınız kaldırılacaktır.' });
            localStorage.removeItem('cmyo_user');
            localStorage.removeItem(`user_${user.email}`);
            setTimeout(() => router.push('/login'), 4000);
        } catch (error: any) {
            setDeleteMessage({ type: 'error', text: error.message });
            setDeleteLoading(false);
        }
    };

    if (!user) return null;

    return (
        <main className="relative w-full h-screen flex items-center justify-center overflow-hidden bg-[#050a14]">
            <NeuralBackground />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 w-full max-w-md p-8 bg-[#050a14]/90 backdrop-blur-2xl rounded-3xl border border-blue-500/30 shadow-[0_0_50px_rgba(0,128,255,0.2)]"
            >
                <button
                    onClick={() => router.push('/')}
                    className="absolute top-6 left-6 text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-sm"
                >
                    <ArrowLeft className="w-4 h-4" /> Geri
                </button>

                <div className="flex flex-col items-center mb-8 mt-4">
                    <div className="w-24 h-24 relative mb-4 rounded-full overflow-hidden border-2 border-blue-500/50 shadow-[0_0_20px_rgba(0,128,255,0.4)] bg-slate-800 group">
                        {avatar ? (
                            <Image src={avatar} alt="Profile" fill className="object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500">
                                <User className="w-10 h-10" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <UploadButton
                                endpoint="imageUploader"
                                onClientUploadComplete={(res) => {
                                    if (res && res[0]) {
                                        setAvatar(res[0].url);
                                        setMessage({ type: 'success', text: 'Resim yüklendi! Kaydet butonuna basarak profilinizi güncelleyin.' });
                                    }
                                }}
                                onUploadError={(error: Error) => {
                                    console.log(error);
                                    setMessage({ type: 'error', text: 'Resim yüklenirken hata oluştu.' });
                                }}
                                appearance={{
                                    button: "bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-medium hover:bg-blue-500 transition-colors after:bg-blue-400 focus-within:ring-0",
                                    container: "p-0 m-0",
                                    allowedContent: "hidden"
                                }}
                                content={{
                                    button: "Değiştir"
                                }}
                            />
                        </div>
                    </div>
                    <div className="text-center">
                        <h1 className="text-xl font-bold text-white mb-1">Profil Düzenle</h1>
                        <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-slate-400 ml-1 mb-1 block">Ad</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-2.5 px-4 text-white text-sm focus:border-blue-500/50 focus:outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 ml-1 mb-1 block">Soyad</label>
                            <input
                                type="text"
                                value={surname}
                                onChange={(e) => setSurname(e.target.value)}
                                className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-2.5 px-4 text-white text-sm focus:border-blue-500/50 focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    {user.role === 'academic' && (
                        <div>
                            <label className="text-xs text-slate-400 ml-1 mb-1 block">Ünvan</label>
                            <select
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-slate-900/50 border border-green-500/20 rounded-xl py-2.5 px-4 text-white text-sm appearance-none focus:outline-none focus:border-green-500/50 transition-all"
                            >
                                <option value="Araş. Gör.">Araş. Gör.</option>
                                <option value="Araş. Gör. Dr.">Araş. Gör. Dr.</option>
                                <option value="Öğr. Gör.">Öğr. Gör.</option>
                                <option value="Öğr. Gör. Dr.">Öğr. Gör. Dr.</option>
                                <option value="Dr. Öğr. Üyesi">Dr. Öğr. Üyesi</option>
                                <option value="Doç. Dr.">Doç. Dr.</option>
                                <option value="Prof. Dr.">Prof. Dr.</option>
                            </select>
                        </div>
                    )}

                    <div className="relative group opacity-60">
                        <label className="text-xs text-slate-500 ml-1 mb-1 block">Rol (Değiştirilemez)</label>
                        <div className="flex items-center gap-2 w-full bg-slate-900/30 border border-slate-700/30 rounded-xl py-2.5 px-4 text-slate-400 text-sm">
                            <Shield className="w-4 h-4" />
                            <span className="capitalize">{user.role === 'academic' ? 'Akademisyen' : 'Öğrenci'}</span>
                        </div>
                    </div>

                    {message && (
                        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${message.type === 'success' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {message.text}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 mt-4"
                    >
                        <Save className="w-4 h-4" />
                        Kaydet
                    </button>

                    <div className="pt-4 border-t border-slate-800 mt-6">
                        <form onSubmit={handleChangePassword} className="space-y-3">
                            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-blue-400" /> Şifre Değiştir
                            </h2>
                            <input
                                type="password"
                                placeholder="Mevcut şifre"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-2.5 px-4 text-white text-sm focus:border-blue-500/50 focus:outline-none transition-all"
                            />
                            <input
                                type="password"
                                placeholder="Yeni şifre"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-2.5 px-4 text-white text-sm focus:border-blue-500/50 focus:outline-none transition-all"
                            />
                            <input
                                type="password"
                                placeholder="Yeni şifre (tekrar)"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-2.5 px-4 text-white text-sm focus:border-blue-500/50 focus:outline-none transition-all"
                            />
                            {passwordMessage && (
                                <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${passwordMessage.type === 'success' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                                    {passwordMessage.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                                    {passwordMessage.text}
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={passwordLoading}
                                className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Lock className="w-4 h-4" />
                                {passwordLoading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                            </button>
                        </form>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={() => { setShowDeleteModal(true); setDeleteConfirmed(false); setDeleteMessage(null); }}
                            className="w-full py-3 rounded-xl font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            Hesabımı Sil
                        </button>
                    </div>
                </form>
            </motion.div>

            {/* Hesap Silme Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-sm mx-4 p-6 bg-[#050a14] border border-red-500/30 rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.15)]"
                    >
                        {deleteMessage ? (
                            <div className="text-center">
                                <div className={`flex items-center justify-center gap-2 text-sm p-4 rounded-xl mb-4 ${deleteMessage.type === 'success' ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}`}>
                                    {deleteMessage.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                                    <span>{deleteMessage.text}</span>
                                </div>
                                {deleteMessage.type === 'error' && (
                                    <button onClick={() => setShowDeleteModal(false)} className="text-sm text-slate-400 hover:text-white transition-colors">
                                        Kapat
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <AlertCircle className="w-5 h-5 text-red-400" />
                                    </div>
                                    <h2 className="text-lg font-bold text-white">Hesap Silme Talebi</h2>
                                </div>
                                <p className="text-sm text-slate-400 mb-5">
                                    Hesabınız ve tüm verileriniz kalıcı olarak silinecektir. Bu işlem yönetici onayından sonra gerçekleşir.
                                </p>
                                <label className="flex items-start gap-3 mb-6 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={deleteConfirmed}
                                        onChange={(e) => setDeleteConfirmed(e.target.checked)}
                                        className="mt-0.5 accent-red-500 w-4 h-4"
                                    />
                                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                                        Hesabımı silmek istediğimi onaylıyorum.
                                    </span>
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowDeleteModal(false)}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700 transition-all"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        onClick={handleRequestDeletion}
                                        disabled={!deleteConfirmed || deleteLoading}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {deleteLoading ? 'Gönderiliyor...' : 'Talep Gönder'}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </main>
    );
}
