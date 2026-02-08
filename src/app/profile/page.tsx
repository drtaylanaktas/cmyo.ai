'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NeuralBackground from '@/components/NeuralBackground';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, User, Mail, Shield, AlertCircle, CheckCircle } from 'lucide-react';
import Image from 'next/image';

export default function ProfilePage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [title, setTitle] = useState('');
    const [avatar, setAvatar] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                setMessage({ type: 'error', text: "Dosya boyutu 2MB'dan küçük olmalıdır." });
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatar(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = (e: React.FormEvent) => {
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

        // Update current session
        localStorage.setItem('cmyo_user', JSON.stringify(updatedUser));

        // Update permanent storage
        localStorage.setItem(`user_${user.email}`, JSON.stringify(updatedUser));

        setMessage({ type: 'success', text: 'Profiliniz başarıyla güncellendi!' });

        // Update state to reflect changes immediately
        setUser(updatedUser);
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
                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                            <span className="text-xs text-white font-medium">Değiştir</span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                        </label>
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
                        <button
                            type="button"
                            onClick={() => {
                                if (confirm('Hesabınızı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
                                    localStorage.removeItem('cmyo_user');
                                    localStorage.removeItem(`user_${user.email}`);
                                    router.push('/login');
                                }
                            }}
                            className="w-full py-3 rounded-xl font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            Hesabımı Sil
                        </button>
                    </div>
                </form>
            </motion.div>
        </main>
    );
}
