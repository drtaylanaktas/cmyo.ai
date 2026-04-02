'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserX, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

interface DeletionRequest {
    id: number;
    user_email: string;
    user_name: string;
    requested_at: string;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_at: string | null;
    reviewed_by: string | null;
    role: string | null;
    academic_unit: string | null;
}

export default function DeletionsPage() {
    const [requests, setRequests] = useState<DeletionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/deletions');
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    const handleAction = async (id: number, action: 'approve' | 'reject') => {
        const label = action === 'approve' ? 'onaylamak' : 'reddetmek';
        if (!confirm(`Bu isteği ${label} istediğinize emin misiniz?`)) return;
        setActionLoading(id);
        try {
            const res = await fetch('/api/admin/deletions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            if (res.ok) await fetchRequests();
        } finally {
            setActionLoading(null);
        }
    };

    const pending = requests.filter(r => r.status === 'pending');
    const reviewed = requests.filter(r => r.status !== 'pending');

    const StatusBadge = ({ status }: { status: string }) => {
        if (status === 'pending') return (
            <span className="flex items-center gap-1 text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 text-xs px-2 py-0.5 rounded-full">
                <Clock size={11} /> Bekliyor
            </span>
        );
        if (status === 'approved') return (
            <span className="flex items-center gap-1 text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 text-xs px-2 py-0.5 rounded-full">
                <CheckCircle size={11} /> Onaylandı
            </span>
        );
        return (
            <span className="flex items-center gap-1 text-red-400 bg-red-400/10 border border-red-400/20 text-xs px-2 py-0.5 rounded-full">
                <XCircle size={11} /> Reddedildi
            </span>
        );
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
                        <UserX size={18} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Hesap Silme İstekleri</h1>
                        <p className="text-sm text-neutral-400">
                            {pending.length} bekleyen istek
                        </p>
                    </div>
                </div>
                <button
                    onClick={fetchRequests}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                >
                    <RefreshCw size={14} /> Yenile
                </button>
            </div>

            {loading ? (
                <div className="text-center py-16 text-neutral-500">Yükleniyor...</div>
            ) : requests.length === 0 ? (
                <div className="text-center py-16 text-neutral-500">
                    <UserX size={40} className="mx-auto mb-3 opacity-30" />
                    <p>Henüz hesap silme isteği yok.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {pending.length > 0 && (
                        <section>
                            <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider mb-3">Bekleyen İstekler</h2>
                            <div className="border border-neutral-800 rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Kullanıcı</th>
                                            <th className="px-4 py-3 text-left">Rol</th>
                                            <th className="px-4 py-3 text-left">Talep Tarihi</th>
                                            <th className="px-4 py-3 text-left">Durum</th>
                                            <th className="px-4 py-3 text-right">İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {pending.map(r => (
                                            <tr key={r.id} className="bg-neutral-950 hover:bg-neutral-900 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-white">{r.user_name || '—'}</p>
                                                    <p className="text-neutral-400 text-xs">{r.user_email}</p>
                                                </td>
                                                <td className="px-4 py-3 text-neutral-300">
                                                    {r.role === 'academic' ? 'Akademisyen' : r.role === 'student' ? 'Öğrenci' : r.role || '—'}
                                                    {r.academic_unit && <p className="text-xs text-neutral-500">{r.academic_unit}</p>}
                                                </td>
                                                <td className="px-4 py-3 text-neutral-400 text-xs">
                                                    {new Date(r.requested_at).toLocaleString('tr-TR')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={r.status} />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleAction(r.id, 'approve')}
                                                            disabled={actionLoading === r.id}
                                                            className="px-3 py-1 text-xs font-medium text-emerald-400 hover:text-white hover:bg-emerald-500 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-40"
                                                        >
                                                            {actionLoading === r.id ? '...' : 'Onayla'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction(r.id, 'reject')}
                                                            disabled={actionLoading === r.id}
                                                            className="px-3 py-1 text-xs font-medium text-red-400 hover:text-white hover:bg-red-500 border border-red-500/30 rounded-lg transition-colors disabled:opacity-40"
                                                        >
                                                            {actionLoading === r.id ? '...' : 'Reddet'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {reviewed.length > 0 && (
                        <section>
                            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">Geçmiş İstekler</h2>
                            <div className="border border-neutral-800 rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Kullanıcı</th>
                                            <th className="px-4 py-3 text-left">Talep Tarihi</th>
                                            <th className="px-4 py-3 text-left">Durum</th>
                                            <th className="px-4 py-3 text-left">İşlem Tarihi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {reviewed.map(r => (
                                            <tr key={r.id} className="bg-neutral-950 opacity-70">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-neutral-300">{r.user_name || '—'}</p>
                                                    <p className="text-neutral-500 text-xs">{r.user_email}</p>
                                                </td>
                                                <td className="px-4 py-3 text-neutral-500 text-xs">
                                                    {new Date(r.requested_at).toLocaleString('tr-TR')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={r.status} />
                                                </td>
                                                <td className="px-4 py-3 text-neutral-500 text-xs">
                                                    {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('tr-TR') : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}
