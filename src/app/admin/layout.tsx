import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Link from 'next/link';
import { LayoutDashboard, Database, LogOut, ArrowLeft } from 'lucide-react';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    // Protect all admin routes on the server
    if (!session || session.role !== 'admin') {
        redirect('/');
    }

    return (
        <div className="flex min-h-screen bg-neutral-950 text-neutral-100 font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col transition-all duration-300">
                <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Database size={18} />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-white">Admin Paneli</h1>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <Link href="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium transition-colors">
                        <LayoutDashboard size={18} />
                        Bilgi Tabanı
                    </Link>
                </nav>

                <div className="p-4 border-t border-neutral-800 space-y-2">
                    <Link href="/" className="flex items-center gap-3 px-3 py-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                        <ArrowLeft size={18} />
                        Uygulamaya Dön
                    </Link>
                    <div className="flex items-center gap-3 px-3 py-2 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer">
                        <LogOut size={18} />
                        Oturumu Kapat
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 bg-gradient-to-br from-neutral-950 to-neutral-900 relative">
                {/* Top header decoration */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />
                
                <div className="p-8 max-w-7xl mx-auto">
                    <header className="mb-8 hidden sm:flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                                ÇMYO.AI Yönetim
                            </h2>
                            <p className="text-sm text-neutral-400 mt-1">Yapay zeka asistanının veritabanı kontrolü.</p>
                        </div>
                        <div className="flex items-center gap-3 bg-neutral-800/50 px-4 py-2 rounded-full border border-neutral-700/50 backdrop-blur-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="text-sm font-medium text-neutral-300">{session.email}</span>
                        </div>
                    </header>

                    {children}
                </div>
            </main>
        </div>
    );
}
