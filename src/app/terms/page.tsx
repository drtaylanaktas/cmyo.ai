'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
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
                    <h1 className="text-3xl font-bold text-white mb-2">Kullanım Koşulları</h1>
                    <p className="text-sm text-slate-500 mb-8">Son güncelleme: 26 Mart 2026</p>

                    <div className="space-y-8 text-sm leading-relaxed">
                        {/* 1 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">1. Taraflar ve Kapsam</h2>
                            <p>
                                Bu Kullanım Koşulları (&quot;Sözleşme&quot;), Kırşehir Ahi Evran Üniversitesi Çiçekdağı Meslek Yüksekokulu
                                (&quot;Kurum&quot;) tarafından geliştirilen ve işletilen <strong className="text-blue-300">ÇMYO.AI</strong> yapay zeka
                                asistan platformunu (&quot;Platform&quot;) kullanan tüm gerçek kişiler (&quot;Kullanıcı&quot;) için geçerlidir.
                            </p>
                            <p className="mt-2">
                                Platforma kayıt olarak ve/veya Platformu kullanarak bu Sözleşme&apos;nin tüm hükümlerini okuduğunuzu,
                                anladığınızı ve kabul ettiğinizi beyan ve taahhüt edersiniz.
                            </p>
                        </section>

                        {/* 2 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">2. Hizmet Tanımı</h2>
                            <p>
                                ÇMYO.AI, Kırşehir Ahi Evran Üniversitesi Çiçekdağı Meslek Yüksekokulu bünyesinde akademisyen ve
                                öğrencilere yapay zeka destekli bilgi asistanlığı hizmeti sunan bir web platformudur. Platform;
                            </p>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                                <li>Akademik ve idari süreçler hakkında bilgi sağlama,</li>
                                <li>Ders programı, staj, kayıt işlemleri gibi konularda rehberlik,</li>
                                <li>Belge hazırlama desteği (PDF/Word),</li>
                                <li>Dosya yükleme ve analiz,</li>
                                <li>Sesli giriş desteği</li>
                            </ul>
                            <p className="mt-2">hizmetlerini kapsamaktadır.</p>
                        </section>

                        {/* 3 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">3. Kayıt ve Hesap Koşulları</h2>
                            <ul className="list-disc list-inside space-y-2 text-slate-400">
                                <li>Platforma kayıt için Kırşehir Ahi Evran Üniversitesi kurumsal e-posta adresi zorunludur.</li>
                                <li>Akademisyenler <span className="text-blue-300">@ahievran.edu.tr</span>, öğrenciler <span className="text-blue-300">@ogr.ahievran.edu.tr</span> uzantılı e-posta adresi kullanmalıdır.</li>
                                <li>Kullanıcı, kayıt sırasında verdiği bilgilerin doğru ve güncel olduğunu taahhüt eder.</li>
                                <li>Her kullanıcı yalnızca bir hesap oluşturabilir.</li>
                                <li>Hesap bilgilerinin gizliliği ve güvenliği Kullanıcı&apos;nın sorumluluğundadır.</li>
                                <li>E-posta doğrulaması zorunludur; doğrulanmayan hesaplar aktif edilmez.</li>
                            </ul>
                        </section>

                        {/* 4 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">4. Kullanıcı Yükümlülükleri</h2>
                            <p>Kullanıcı, Platform&apos;u kullanırken aşağıdaki kurallara uymayı kabul eder:</p>
                            <ul className="list-disc list-inside mt-2 space-y-2 text-slate-400">
                                <li>Platformu yalnızca yasal ve etik amaçlarla kullanmak,</li>
                                <li>Hakaret, küfür, ayrımcılık veya nefret söylemi içeren ifadeler kullanmamak,</li>
                                <li>Platformun güvenliğini tehlikeye atacak eylemlerden kaçınmak,</li>
                                <li>Otomatik botlar veya script&apos;ler aracılığıyla toplu sorgu göndermemek,</li>
                                <li>Başkalarının hesap bilgilerini kullanmamak veya paylaşmamak,</li>
                                <li>Fikri mülkiyet haklarını ihlal edecek içerik paylaşmamak,</li>
                                <li>Günlük mesaj kotasını kötüye kullanmamak.</li>
                            </ul>
                        </section>

                        {/* 5 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">5. Yapay Zeka Yanıtları ve Sorumluluk Sınırlaması</h2>
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-3">
                                <p className="text-yellow-200/80 text-xs font-medium">⚠️ ÖNEMLİ UYARI</p>
                                <p className="text-yellow-100/70 mt-1">
                                    ÇMYO.AI yapay zeka tabanlı bir sistemdir ve ürettiği yanıtlar her zaman doğru veya güncel olmayabilir.
                                </p>
                            </div>
                            <ul className="list-disc list-inside space-y-2 text-slate-400">
                                <li>Platform tarafından verilen yanıtlar bilgi amaçlıdır ve resmi belge veya karar niteliği taşımaz.</li>
                                <li>Kurum, yapay zeka yanıtlarının doğruluğu, eksiksizliği veya güncelliği konusunda herhangi bir garanti vermez.</li>
                                <li>Kullanıcı, Platform&apos;dan aldığı bilgileri resmi kaynaklardan doğrulamakla yükümlüdür.</li>
                                <li>Platform yanıtlarına dayanılarak alınan kararlardan doğacak zararlardan Kurum sorumlu tutulamaz.</li>
                                <li>Belge oluşturma özelliği ile hazırlanan dokümanlar taslak niteliğindedir ve resmi geçerliliği yoktur.</li>
                            </ul>
                        </section>

                        {/* 6 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">6. Fikri Mülkiyet Hakları</h2>
                            <ul className="list-disc list-inside space-y-2 text-slate-400">
                                <li>ÇMYO.AI platformunun tasarımı, logosu, yazılım kodu ve içeriği Kırşehir Ahi Evran Üniversitesi&apos;nin mülkiyetindedir.</li>
                                <li>Kullanıcı, Platform&apos;un herhangi bir bölümünü kopyalayamaz, çoğaltamaz veya ticari amaçla kullanamaz.</li>
                                <li>Kullanıcının Platform üzerinden paylaştığı içeriklerin sorumluluğu kendisine aittir.</li>
                            </ul>
                        </section>

                        {/* 7 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">7. Hizmet Sürekliliği ve Değişiklikler</h2>
                            <ul className="list-disc list-inside space-y-2 text-slate-400">
                                <li>Kurum, Platform&apos;un kesintisiz veya hatasız çalışacağını garanti etmez.</li>
                                <li>Bakım, güncelleme veya teknik nedenlerle hizmet geçici olarak durdurulabilir.</li>
                                <li>Kurum, Platform&apos;un özelliklerini, kullanım koşullarını ve kotaları önceden bildirimde bulunarak veya bulunmaksızın değiştirme hakkını saklı tutar.</li>
                                <li>Günlük mesaj kotası (şu anda 100 mesaj/gün) Kurum tarafından değiştirilebilir.</li>
                            </ul>
                        </section>

                        {/* 8 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">8. Hesap Askıya Alma ve Sonlandırma</h2>
                            <p>Kurum, aşağıdaki durumlarda Kullanıcı hesabını askıya alabilir veya sonlandırabilir:</p>
                            <ul className="list-disc list-inside mt-2 space-y-2 text-slate-400">
                                <li>Kullanım Koşulları&apos;nın ihlal edilmesi,</li>
                                <li>Uygunsuz içerik veya küfürlü dil kullanımı (otomatik tespit sistemi mevcuttur),</li>
                                <li>Platformun güvenliğini tehdit eden eylemler,</li>
                                <li>Sahte veya yanıltıcı bilgilerle kayıt olunması,</li>
                                <li>Üniversite ile ilişiğin kesilmesi.</li>
                            </ul>
                        </section>

                        {/* 9 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">9. Uygulanacak Hukuk ve Uyuşmazlık Çözümü</h2>
                            <p>
                                Bu Sözleşme, Türkiye Cumhuriyeti kanunlarına tabidir. İşbu Sözleşme&apos;den doğan uyuşmazlıkların
                                çözümünde <strong className="text-white">Kırşehir Mahkemeleri ve İcra Daireleri</strong> yetkilidir.
                            </p>
                        </section>

                        {/* 10 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">10. İletişim</h2>
                            <p>Kullanım Koşulları ile ilgili sorularınız için:</p>
                            <div className="mt-3 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                <p className="text-white font-medium">Kırşehir Ahi Evran Üniversitesi</p>
                                <p className="text-slate-400">Çiçekdağı Meslek Yüksekokulu</p>
                                <p className="text-slate-400 mt-1">Çiçekdağı / Kırşehir, Türkiye</p>
                                <p className="text-blue-400 mt-1">cicekdagimyo@ahievran.edu.tr</p>
                            </div>
                        </section>

                        {/* Divider */}
                        <div className="border-t border-slate-700/50 pt-6">
                            <p className="text-xs text-slate-500 text-center">
                                Bu Kullanım Koşulları 26 Mart 2026 tarihinde yürürlüğe girmiştir.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Links */}
                <div className="flex justify-center gap-6 mt-8 text-xs text-slate-500">
                    <Link href="/kvkk" className="hover:text-blue-400 transition-colors">KVKK Aydınlatma Metni</Link>
                    <Link href="/privacy" className="hover:text-blue-400 transition-colors">Gizlilik Politikası</Link>
                </div>
            </div>
        </main>
    );
}
