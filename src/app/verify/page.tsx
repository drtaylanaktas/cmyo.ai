'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

function VerifyContent() {
    const searchParams = useSearchParams();
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success) {
        return (
            <div className="text-center">
                <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">E-posta Doğrulandı!</h2>
                <p className="text-slate-400 mb-6">Hesabınız başarıyla doğrulandı. Artık giriş yapabilirsiniz.</p>
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl transition-colors"
                >
                    Giriş Yap <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        );
    }

    if (error) {
        let errorMessage = "Doğrulama işlemi başarısız oldu.";
        if (error === 'missing_token') errorMessage = "Doğrulama kodu bulunamadı.";
        if (error === 'invalid_token') errorMessage = "Geçersiz veya süresi dolmuş doğrulama kodu.";
        if (error === 'server_error') errorMessage = "Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.";

        return (
            <div className="text-center">
                <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <XCircle className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Doğrulama Başarısız</h2>
                <p className="text-slate-400 mb-6">{errorMessage}</p>
                <Link
                    href="/login"
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                    Giriş sayfasına dön
                </Link>
            </div>
        );
    }

    return (
        <div className="text-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-medium text-white">Doğrulanıyor...</h2>
        </div>
    );
}

export default function VerifyPage() {
    return (
        <div className="min-h-screen bg-[#050a14] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <Suspense fallback={<div className="text-white text-center">Yükleniyor...</div>}>
                    <VerifyContent />
                </Suspense>
            </div>
        </div>
    );
}
