'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-[#050a14] text-slate-300">
            <div className="max-w-4xl mx-auto px-6 py-12">
                {/* Back Button */}
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors mb-8 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm">Geri Dön</span>
                </Link>

                <div className="bg-slate-900/50 border border-blue-500/20 rounded-2xl p-8 md:p-12 backdrop-blur-sm">
                    <h1 className="text-3xl font-bold text-white mb-2">Gizlilik Politikası</h1>
                    <p className="text-sm text-slate-500 mb-8">Son güncelleme: 26 Mart 2026</p>

                    <div className="space-y-8 text-sm leading-relaxed">
                        {/* Giriş */}
                        <section>
                            <p>
                                Kırşehir Ahi Evran Üniversitesi Çiçekdağı Meslek Yüksekokulu (&quot;Kurum&quot;) olarak,
                                ÇMYO.AI platformunu (&quot;Platform&quot;) kullanan kullanıcılarımızın gizliliğini korumaya büyük önem
                                veriyoruz. Bu Gizlilik Politikası, verilerinizin nasıl toplandığını, kullanıldığını,
                                saklandığını ve korunduğunu açıklamaktadır.
                            </p>
                        </section>

                        {/* 1 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">1. Toplanan Veriler ve Yöntemler</h2>

                            <h3 className="text-sm font-semibold text-blue-300 mb-2 mt-4">1.1 Doğrudan Sağlanan Veriler</h3>
                            <p>Kayıt ve kullanım sürecinde doğrudan sizden aldığımız veriler:</p>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                                <li>Ad, soyad ve akademik unvan</li>
                                <li>Kurumsal e-posta adresi</li>
                                <li>Şifre (bcrypt algoritması ile şifrelenerek saklanır, açık metin olarak kaydedilmez)</li>
                                <li>Akademik birim ve rol bilgisi</li>
                                <li>Profil fotoğrafı (opsiyonel, Base64 formatında)</li>
                                <li>Sohbet mesajları ve yüklenen belgeler</li>
                            </ul>

                            <h3 className="text-sm font-semibold text-blue-300 mb-2 mt-4">1.2 Otomatik Toplanan Veriler</h3>
                            <p>Platform kullanımınız sırasında otomatik olarak toplanan veriler:</p>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                                <li>IP adresi (güvenlik ve rate limiting amaçlı)</li>
                                <li>Tarayıcı türü ve sürümü</li>
                                <li>Coğrafi konum (yalnızca izin verdiğinizde, hava durumu hizmeti için)</li>
                                <li>Oturum bilgileri</li>
                            </ul>
                        </section>

                        {/* 2 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">2. Çerez (Cookie) ve LocalStorage Kullanımı</h2>

                            <h3 className="text-sm font-semibold text-blue-300 mb-2 mt-4">2.1 LocalStorage</h3>
                            <p>
                                Platform, oturum yönetimi için tarayıcınızın <code className="bg-slate-800 px-1.5 py-0.5 rounded text-green-300 text-xs">LocalStorage</code> özelliğini
                                kullanmaktadır. Saklanan veriler:
                            </p>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-green-300 text-xs">cmyo_user</code>: Oturum bilgileriniz (ad, e-posta, rol)</li>
                            </ul>
                            <p className="mt-2 text-slate-500 text-xs">
                                Bu veriler tarayıcınızda saklanır ve çıkış yaptığınızda otomatik olarak silinir.
                            </p>

                            <h3 className="text-sm font-semibold text-blue-300 mb-2 mt-4">2.2 Çerezler</h3>
                            <p>
                                Platform şu anda kullanıcı takibi amacıyla çerez (cookie) kullanmamaktadır.
                                Yalnızca güvenlik ve oturum yönetimi için gerekli teknik çerezler kullanılabilir.
                            </p>
                        </section>

                        {/* 3 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">3. Yapay Zeka Sohbet Verilerinin İşlenmesi</h2>

                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-3">
                                <p className="text-blue-200/80 text-xs">
                                    ℹ️ Sohbet verileriniz, yapay zeka yanıtlarının üretilmesi için Google Gemini API&apos;ye gönderilmektedir.
                                </p>
                            </div>

                            <ul className="space-y-2 text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Sohbet mesajlarınız, kişiselleştirilmiş yanıt üretmek için yapay zeka modeline gönderilir.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Mesajlarınız ile birlikte adınız, rolünüz ve hava durumu bilgisi de yapay zekaya bağlam olarak iletilir.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Sohbet geçmişiniz veritabanında saklanır ve önceki konuşmalarınıza erişmenizi sağlar.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Sohbet geçmişinizi istediğiniz zaman silebilirsiniz.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Yüklenen belgeler yalnızca ilgili sohbet oturumunda analiz edilir ve kalıcı olarak saklanmaz.</span>
                                </li>
                            </ul>
                        </section>

                        {/* 4 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">4. Üçüncü Taraf Hizmetler</h2>
                            <p className="mb-3">Platform, aşağıdaki üçüncü taraf hizmetleri kullanmaktadır:</p>

                            <div className="space-y-3">
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-medium">Vercel</p>
                                        <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded">Hosting & Veritabanı</span>
                                    </div>
                                    <p className="text-slate-400 text-xs mt-2">Web uygulamasının barındırılması ve PostgreSQL veritabanı hizmeti. Tüm veri aktarımı HTTPS üzerinden şifrelenmiş olarak gerçekleşir.</p>
                                    <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs hover:underline mt-1 inline-block">Vercel Gizlilik Politikası →</a>
                                </div>

                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-medium">Google Gemini API</p>
                                        <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded">Yapay Zeka</span>
                                    </div>
                                    <p className="text-slate-400 text-xs mt-2">Yapay zeka tabanlı sohbet yanıtlarının üretilmesi. Mesajlarınız API üzerinden işlenir.</p>
                                    <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs hover:underline mt-1 inline-block">Google AI Kullanım Koşulları →</a>
                                </div>

                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-medium">OpenStreetMap (Nominatim)</p>
                                        <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded">Konum</span>
                                    </div>
                                    <p className="text-slate-400 text-xs mt-2">Coğrafi koordinatlardan okunabilir adres bilgisi elde etmek için kullanılır. Yalnızca konum izni verdiğinizde çalışır.</p>
                                </div>

                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-medium">Open-Meteo</p>
                                        <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded">Hava Durumu</span>
                                    </div>
                                    <p className="text-slate-400 text-xs mt-2">Anlık hava durumu bilgisi sağlamak için kullanılır. Yalnızca konum izni verdiğinizde çalışır.</p>
                                </div>
                            </div>
                        </section>

                        {/* 5 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">5. Veri Güvenliği Önlemleri</h2>
                            <p className="mb-3">Verilerinizin güvenliği için aşağıdaki teknik ve idari önlemler alınmaktadır:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    { icon: '🔐', title: 'Şifre Güvenliği', desc: 'bcrypt (12 round) algoritması ile hash\'leme' },
                                    { icon: '🔒', title: 'HTTPS', desc: 'Tüm veri aktarımı SSL/TLS ile şifrelenir' },
                                    { icon: '🛡️', title: 'Rate Limiting', desc: 'Brute-force saldırılarına karşı istek sınırlandırma' },
                                    { icon: '✉️', title: 'E-posta Doğrulama', desc: 'Hesap aktivasyonu için e-posta doğrulaması zorunludur' },
                                    { icon: '🚫', title: 'İçerik Filtreleme', desc: 'Uygunsuz içerik otomatik tespit ve engelleme' },
                                    { icon: '📊', title: 'Kota Yönetimi', desc: 'Günlük mesaj limiti ile kötüye kullanım önleme' },
                                ].map((item, i) => (
                                    <div key={i} className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span>{item.icon}</span>
                                            <p className="text-white font-medium text-xs">{item.title}</p>
                                        </div>
                                        <p className="text-slate-400 text-xs">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 6 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">6. Çocukların Gizliliği</h2>
                            <p>
                                ÇMYO.AI platformu, yükseköğretim kurumu bünyesinde hizmet vermekte olup 18 yaşın altındaki
                                bireylere yönelik değildir. 18 yaşından küçük bireylerin Platform&apos;a kayıt olması ve Platform&apos;u
                                kullanması yasaktır. Bilgimiz dahilinde 18 yaşından küçük bir kullanıcıya ait veri toplandığı
                                tespit edilirse, söz konusu hesap ve veriler derhal silinecektir.
                            </p>
                        </section>

                        {/* 7 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">7. Veri Saklama ve Silme</h2>
                            <ul className="space-y-2 text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Hesap bilgileriniz, hesabınız aktif olduğu sürece saklanır.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Sohbet geçmişinizi dilediğiniz zaman uygulama içinden silebilirsiniz.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Hesabınızın silinmesi talebi için <span className="text-blue-400">cmyo@ahievran.edu.tr</span> adresine başvurabilirsiniz.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Hesap silme talebi sonrasında tüm kişisel verileriniz ve sohbet geçmişiniz kalıcı olarak silinir.</span>
                                </li>
                            </ul>
                        </section>

                        {/* 8 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">8. Politika Değişiklikleri</h2>
                            <p>
                                Bu Gizlilik Politikası zaman zaman güncellenebilir. Önemli değişiklikler yapılması halinde,
                                Platform üzerinden veya e-posta yoluyla bilgilendirileceksiniz. Güncellenmiş politikayı
                                kullanmaya devam etmeniz, değişiklikleri kabul ettiğiniz anlamına gelir.
                            </p>
                            <p className="mt-2 text-slate-500 text-xs">
                                Politikanın son güncelleme tarihi sayfanın üst kısmında belirtilmektedir.
                            </p>
                        </section>

                        {/* 9 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">9. İletişim</h2>
                            <p>Gizlilik ile ilgili sorularınız ve talepleriniz için:</p>
                            <div className="mt-3 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                <p className="text-white font-medium">Kırşehir Ahi Evran Üniversitesi</p>
                                <p className="text-slate-400">Çiçekdağı Meslek Yüksekokulu</p>
                                <p className="text-slate-400 mt-1">Çiçekdağı / Kırşehir, Türkiye</p>
                                <p className="text-blue-400 mt-1">cmyo@ahievran.edu.tr</p>
                            </div>
                        </section>

                        {/* Divider */}
                        <div className="border-t border-slate-700/50 pt-6">
                            <p className="text-xs text-slate-500 text-center">
                                Bu Gizlilik Politikası 26 Mart 2026 tarihinde yürürlüğe girmiştir.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Links */}
                <div className="flex justify-center gap-6 mt-8 text-xs text-slate-500">
                    <Link href="/terms" className="hover:text-blue-400 transition-colors">Kullanım Koşulları</Link>
                    <Link href="/kvkk" className="hover:text-blue-400 transition-colors">KVKK Aydınlatma Metni</Link>
                </div>
            </div>
        </main>
    );
}
