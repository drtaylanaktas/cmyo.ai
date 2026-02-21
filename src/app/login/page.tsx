'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NeuralBackground from '@/components/NeuralBackground';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, CheckCircle, AlertCircle, Briefcase } from 'lucide-react';

import Image from 'next/image';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [title, setTitle] = useState('');
    const [avatar, setAvatar] = useState('');
    const [role, setRole] = useState<'student' | 'academic'>('student');
    const [academicUnit, setAcademicUnit] = useState('');


    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSuccessAnimation, setIsSuccessAnimation] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Check if already logged in
        const user = localStorage.getItem('cmyo_user');
        if (user) {
            router.push('/');
        }
    }, [router]);

    const validateEmail = (email: string) => {
        return email.endsWith('@ahievran.edu.tr');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                setError("Dosya boyutu 2MB'dan küçük olmalıdır.");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatar(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (password.length < 6) {
            setError('Şifre en az 6 karakter olmalıdır.');
            return;
        }

        // Validate email domain based on role (Only for Registration)
        if (!isLogin) {
            if (role === 'academic' && !email.endsWith('@ahievran.edu.tr')) {
                setError('Akademisyenler sadece @ahievran.edu.tr uzantılı mail adresi ile kayıt olabilir.');
                return;
            }

            if (role === 'student' && !email.endsWith('@ogr.ahievran.edu.tr')) {
                setError('Öğrenciler sadece @ogr.ahievran.edu.tr uzantılı mail adresi ile kayıt olabilir.');
                return;
            }
        }

        // Authentication Logic
        if (isLogin) {
            // Login Logic
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || 'Giriş başarısız.');
                    return;
                }

                // Login successful
                localStorage.setItem('cmyo_user', JSON.stringify(data.user));
                setIsSuccessAnimation(true);
                setTimeout(() => {
                    router.push('/');
                }, 2800); // 2.8s wait for the majestic slow animation before navigating
            } catch (err) {
                setError('Bir hata oluştu. Lütfen tekrar deneyin.');
            }
        } else {
            // Register Logic
            const hasUpperCase = /[A-Z]/.test(password);
            const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

            if (!hasUpperCase || !hasSpecialChar) {
                setError('Şifreniz en az bir büyük harf ve bir noktalama işareti içermelidir.');
                return;
            }

            if (!name || !surname) {
                setError('Lütfen ad ve soyad giriniz.');
                return;
            }

            if (role === 'academic' && !title) {
                setError('Lütfen ünvanınızı giriniz.');
                return;
            }

            if (!academicUnit) {
                setError('Lütfen bağlı olduğunuz birimi (Fakülte/MYO) seçiniz.');
                return;
            }

            try {
                const newUser = {
                    email,
                    password,
                    name,
                    surname,
                    role,
                    title: role === 'academic' ? title : '',
                    academicUnit,
                    avatar: avatar || ''
                };

                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newUser),
                });

                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || 'Kayıt başarısız.');
                    return;
                }

                if (data.requireVerification) {
                    setSuccess('Kayıt başarılı! Lütfen e-posta adresinize gönderilen doğrulama bağlantısına tıklayarak hesabınızı aktif edin.');
                } else {
                    setSuccess('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
                }
                setIsLogin(true); // Switch to login view
                setPassword('');
            } catch (err) {
                setError('Bir hata oluştu. Lütfen tekrar deneyin.');
            }
        }
    };

    return (
        <main className="relative w-full h-screen flex items-center justify-center overflow-hidden">
            <NeuralBackground />

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isSuccessAnimation ? {
                    opacity: 0,
                    scale: 0.95,
                    filter: "blur(10px)"
                } : {
                    opacity: 1,
                    scale: 1,
                    filter: "blur(0px)"
                }}
                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                className={`absolute z-10 w-full max-w-md p-8 bg-[#050a14]/80 backdrop-blur-2xl rounded-3xl border border-blue-500/30 shadow-[0_0_50px_rgba(0,128,255,0.2)] max-h-[90vh] overflow-y-auto ${isSuccessAnimation ? 'pointer-events-none' : ''}`}
            >
                <div className="flex flex-col items-center mb-6">
                    <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
                        <motion.div
                            className="w-full h-full relative"
                        >
                            <Image src="/logo.png" alt="Logo" fill className="object-contain drop-shadow-[0_0_15px_rgba(0,128,255,0.5)]" />
                        </motion.div>
                    </div>

                    <h1
                        className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-green-400 to-blue-400 tracking-tight"
                    >
                        KAEU.AI v1.0 (beta)
                    </h1>
                </div>

                <div>

                    <div className="flex gap-4 mb-6 bg-slate-900/50 p-1 rounded-xl">
                        <button
                            onClick={() => { setIsLogin(true); setError(''); setSuccess(''); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${isLogin ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Giriş Yap
                        </button>
                        <button
                            onClick={() => { setIsLogin(false); setError(''); setSuccess(''); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${!isLogin ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Kayıt Ol
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">

                        {!isLogin && (
                            <div className="flex gap-2 mb-2 p-1 bg-slate-900/50 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setRole('student')}
                                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${role === 'student' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                                >
                                    Öğrenci
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRole('academic')}
                                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${role === 'academic' ? 'bg-green-600 text-white' : 'text-slate-400'}`}
                                >
                                    Akademisyen
                                </button>
                            </div>
                        )}

                        {!isLogin && (
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Adınız"
                                    className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-3 px-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all"
                                />
                                <input
                                    type="text"
                                    value={surname}
                                    onChange={(e) => setSurname(e.target.value)}
                                    placeholder="Soyadınız"
                                    className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-3 px-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all"
                                />
                            </div>
                        )}

                        {!isLogin && (
                            <div className="relative group">
                                <label className="block text-xs text-slate-400 mb-1 ml-1">Profil Fotoğrafı (Opsiyonel)</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-2 px-4 text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-all"
                                />
                            </div>
                        )}

                        {!isLogin && role === 'academic' && (
                            <div className="relative">
                                <select
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-green-500/20 rounded-xl py-3 px-4 text-white appearance-none focus:outline-none focus:border-green-500/50 transition-all"
                                >
                                    <option value="" disabled>Ünvan Seçiniz</option>
                                    <option value="Araş. Gör.">Araş. Gör.</option>
                                    <option value="Araş. Gör. Dr.">Araş. Gör. Dr.</option>
                                    <option value="Öğr. Gör.">Öğr. Gör.</option>
                                    <option value="Öğr. Gör. Dr.">Öğr. Gör. Dr.</option>
                                    <option value="Dr. Öğr. Üyesi">Dr. Öğr. Üyesi</option>
                                    <option value="Doç. Dr.">Doç. Dr.</option>
                                    <option value="Prof. Dr.">Prof. Dr.</option>
                                </select>
                                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        )}

                        {/* Academic Unit Selection */}
                        {!isLogin && (
                            <div className="relative group">
                                <Briefcase className="absolute left-4 top-3.5 w-5 h-5 text-blue-400/50 group-focus-within:text-blue-400 transition-colors pointer-events-none z-10" />
                                <select
                                    value={academicUnit}
                                    onChange={(e) => setAcademicUnit(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-3 pl-12 pr-4 text-white appearance-none focus:outline-none focus:border-blue-500/50 focus:bg-slate-900/80 transition-all cursor-pointer"
                                    required
                                >
                                    <option value="" disabled className="text-slate-500">Bağlı Olduğunuz Birimi Seçiniz</option>

                                    <optgroup label="Enstitüler">
                                        <option value="Fen Bilimleri Enstitüsü">Fen Bilimleri Enstitüsü</option>
                                        <option value="Sağlık Bilimleri Enstitüsü">Sağlık Bilimleri Enstitüsü</option>
                                        <option value="Sosyal Bilimler Enstitüsü">Sosyal Bilimler Enstitüsü</option>
                                    </optgroup>

                                    <optgroup label="Fakülteler">
                                        <option value="Eğitim Fakültesi">Eğitim Fakültesi</option>
                                        <option value="Fen Edebiyat Fakültesi">Fen Edebiyat Fakültesi</option>
                                        <option value="İktisadi ve İdari Bilimler Fakültesi">İktisadi ve İdari Bilimler Fakültesi</option>
                                        <option value="İlahiyat Fakültesi">İlahiyat Fakültesi</option>
                                        <option value="Mühendislik Mimarlık Fakültesi">Mühendislik Mimarlık Fakültesi</option>
                                        <option value="Neşet Ertaş Güzel Sanatlar Fakültesi">Neşet Ertaş Güzel Sanatlar Fakültesi</option>
                                        <option value="Sağlık Bilimleri Fakültesi">Sağlık Bilimleri Fakültesi</option>
                                        <option value="Spor Bilimleri Fakültesi">Spor Bilimleri Fakültesi</option>
                                        <option value="Tıp Fakültesi">Tıp Fakültesi</option>
                                        <option value="Ziraat Fakültesi">Ziraat Fakültesi</option>
                                    </optgroup>

                                    <optgroup label="Yüksekokullar">
                                        <option value="Fizik Tedavi ve Rehabilitasyon Yüksekokulu">Fizik Tedavi ve Rehabilitasyon Yüksekokulu</option>
                                        <option value="Kaman Uygulamalı Bilimler Yüksekokulu">Kaman Uygulamalı Bilimler Yüksekokulu</option>
                                        <option value="Yabancı Diller Yüksekokulu">Yabancı Diller Yüksekokulu</option>
                                    </optgroup>

                                    <optgroup label="Meslek Yüksekokulları">
                                        <option value="Çiçekdağı MYO">Çiçekdağı MYO</option>
                                        <option value="Kaman MYO">Kaman MYO</option>
                                        <option value="Mucur MYO">Mucur MYO</option>
                                        <option value="Mucur Sağlık Hizmetleri MYO">Mucur Sağlık Hizmetleri MYO</option>
                                        <option value="Sağlık Hizmetleri MYO">Sağlık Hizmetleri MYO</option>
                                        <option value="Sosyal Bilimler MYO">Sosyal Bilimler MYO</option>
                                        <option value="Teknik Bilimler MYO">Teknik Bilimler MYO</option>
                                    </optgroup>

                                    <optgroup label="Rektörlüğe Bağlı Bölümler">
                                        <option value="Atatürk İlkeleri ve İnkılap Tarihi Bölümü">Atatürk İlkeleri ve İnkılap Tarihi Bölümü</option>
                                        <option value="Enformatik Bölümü">Enformatik Bölümü</option>
                                        <option value="Türk Dili Bölümü">Türk Dili Bölümü</option>
                                    </optgroup>
                                </select>
                                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        )}


                        <div className="relative group">
                            <Mail className="absolute left-4 top-3.5 w-5 h-5 text-blue-400/50 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder={isLogin ? "Mail adresiniz" : (role === 'academic' ? "kurumsal@ahievran.edu.tr" : "ogrenci@ogr.ahievran.edu.tr")}
                                required
                                className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:bg-slate-900/80 transition-all"
                            />
                        </div>

                        <div className="relative group">
                            <Lock className="absolute left-4 top-3.5 w-5 h-5 text-blue-400/50 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Şifreniz"
                                required
                                className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:bg-slate-900/80 transition-all"
                            />
                        </div>

                        {isLogin && (
                            <div className="flex justify-end mt-2 mb-4 relative z-10">
                                <Link
                                    href="/forgot-password"
                                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    Şifremi Unuttum
                                </Link>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                {success}
                            </div>
                        )}

                        <button
                            type="submit"
                            className={`w-full py-3.5 rounded-xl font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${isLogin
                                ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-blue-500/25'
                                : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 shadow-green-500/25'
                                }`}
                        >
                            {isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </form>

                    <p className="mt-6 text-center text-xs text-slate-500">
                        &copy; {new Date().getFullYear()} KAEU.AI - Kırşehir Ahi Evran Üniversitesi
                    </p>
                </div>
            </motion.div>

            {/* Premium Fullscreen Logo Expansion (Overlay) */}
            <motion.div
                className="fixed inset-0 pointer-events-none flex items-center justify-center z-[100]"
                initial={{ opacity: 0 }}
                animate={{ opacity: isSuccessAnimation ? 1 : 0 }}
                transition={{ duration: 0.1 }}
            >
                <motion.div
                    className="relative w-24 h-24"
                    initial={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    animate={isSuccessAnimation ? {
                        scale: [1, 0.95, 60],
                        opacity: [1, 1, 0],
                        filter: ["blur(0px)", "blur(0px)", "blur(5px)"]
                    } : {}}
                    transition={{
                        duration: 2.4, // Slower overlay explosion
                        times: [0, 0.15, 1],
                        ease: [0.16, 1, 0.3, 1]
                    }}
                >
                    <Image src="/logo.png" alt="Logo" fill className="object-contain drop-shadow-[0_0_20px_rgba(0,128,255,0.8)]" />
                </motion.div>
            </motion.div>
        </main>
    );
}
