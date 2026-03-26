'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function KVKKPage() {
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
                    <h1 className="text-3xl font-bold text-white mb-2">KVKK Aydınlatma Metni</h1>
                    <p className="text-sm text-slate-500 mb-2">6698 Sayılı Kişisel Verilerin Korunması Kanunu Kapsamında</p>
                    <p className="text-sm text-slate-500 mb-8">Son güncelleme: 26 Mart 2026</p>

                    <div className="space-y-8 text-sm leading-relaxed">
                        {/* Giriş */}
                        <section>
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                                <p className="text-blue-200/80">
                                    Kırşehir Ahi Evran Üniversitesi Çiçekdağı Meslek Yüksekokulu olarak kişisel verilerinizin güvenliğine
                                    büyük önem vermekteyiz. Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;)
                                    kapsamında, kişisel verilerinizin işlenmesine ilişkin sizi bilgilendirmek amacıyla hazırlanmıştır.
                                </p>
                            </div>
                        </section>

                        {/* 1 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">1. Veri Sorumlusu</h2>
                            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                <p><strong className="text-white">Kurum:</strong> Kırşehir Ahi Evran Üniversitesi</p>
                                <p><strong className="text-white">Birim:</strong> Çiçekdağı Meslek Yüksekokulu</p>
                                <p><strong className="text-white">Adres:</strong> Çiçekdağı / Kırşehir, Türkiye</p>
                                <p><strong className="text-white">E-posta:</strong> <span className="text-blue-400">cmyo@ahievran.edu.tr</span></p>
                            </div>
                        </section>

                        {/* 2 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">2. İşlenen Kişisel Veriler</h2>
                            <p className="mb-3">ÇMYO.AI platformu kapsamında aşağıdaki kişisel verileriniz işlenmektedir:</p>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-700">
                                            <th className="py-3 px-4 text-white font-semibold text-xs uppercase tracking-wider">Veri Kategorisi</th>
                                            <th className="py-3 px-4 text-white font-semibold text-xs uppercase tracking-wider">Veriler</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        <tr>
                                            <td className="py-3 px-4 text-blue-300 font-medium">Kimlik Bilgileri</td>
                                            <td className="py-3 px-4">Ad, soyad, akademik unvan</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-blue-300 font-medium">İletişim Bilgileri</td>
                                            <td className="py-3 px-4">Kurumsal e-posta adresi</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-blue-300 font-medium">Mesleki Bilgiler</td>
                                            <td className="py-3 px-4">Akademik birim, rol (öğrenci/akademisyen)</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-blue-300 font-medium">Görsel Veriler</td>
                                            <td className="py-3 px-4">Profil fotoğrafı (opsiyonel)</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-blue-300 font-medium">Kullanım Verileri</td>
                                            <td className="py-3 px-4">Sohbet geçmişi, yüklenen belgeler, mesaj sayısı</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-blue-300 font-medium">Teknik Veriler</td>
                                            <td className="py-3 px-4">IP adresi, tarayıcı bilgileri, konum verisi (izin verildiğinde)</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-blue-300 font-medium">Güvenlik Verileri</td>
                                            <td className="py-3 px-4">Şifrelenmiş parola (hash), e-posta doğrulama durumu</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* 3 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">3. Kişisel Verilerin İşlenme Amaçları</h2>
                            <p className="mb-3">Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:</p>
                            <ul className="space-y-2">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Kullanıcı hesabının oluşturulması, kimlik doğrulama ve yetkilendirme işlemlerinin yürütülmesi</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Yapay zeka asistan hizmetinin kişiselleştirilmiş olarak sunulması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Sohbet geçmişinin saklanması ve önceki konuşmalara erişim sağlanması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Platformun güvenliğinin sağlanması (uygunsuz içerik tespiti, rate limiting)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Kullanım istatistiklerinin oluşturulması ve hizmet kalitesinin iyileştirilmesi</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Hava durumu gibi konuma dayalı bilgi hizmetlerinin sunulması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span>
                                    <span>Yasal yükümlülüklerin yerine getirilmesi</span>
                                </li>
                            </ul>
                        </section>

                        {/* 4 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">4. Kişisel Verilerin Aktarıldığı Taraflar</h2>
                            <p className="mb-3">
                                Kişisel verileriniz, hizmetin sunulabilmesi için aşağıdaki üçüncü taraf hizmet sağlayıcılara aktarılabilmektedir:
                            </p>

                            <div className="space-y-3">
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <p className="text-white font-medium">Vercel Inc.</p>
                                    <p className="text-slate-400 text-xs mt-1">Platform barındırma ve veritabanı hizmetleri (ABD merkezli)</p>
                                    <p className="text-slate-500 text-xs mt-1">Aktarılan veriler: Tüm platform verileri (şifrelenmiş iletim)</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <p className="text-white font-medium">Google LLC (Gemini API)</p>
                                    <p className="text-slate-400 text-xs mt-1">Yapay zeka yanıt üretimi hizmeti (ABD merkezli)</p>
                                    <p className="text-slate-500 text-xs mt-1">Aktarılan veriler: Sohbet mesajları, kullanıcı adı ve rolü, hava durumu bilgisi</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <p className="text-white font-medium">OpenStreetMap Foundation</p>
                                    <p className="text-slate-400 text-xs mt-1">Konum adı çözümleme hizmeti</p>
                                    <p className="text-slate-500 text-xs mt-1">Aktarılan veriler: Coğrafi koordinatlar (kullanıcı izni ile)</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <p className="text-white font-medium">Open-Meteo</p>
                                    <p className="text-slate-400 text-xs mt-1">Hava durumu veri hizmeti</p>
                                    <p className="text-slate-500 text-xs mt-1">Aktarılan veriler: Coğrafi koordinatlar (kullanıcı izni ile)</p>
                                </div>
                            </div>

                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mt-4">
                                <p className="text-yellow-200/80 text-xs">
                                    ⚠️ Yurt dışında bulunan hizmet sağlayıcılara veri aktarımı, KVKK m.9 kapsamında ve ilgili
                                    hizmet sağlayıcıların veri koruma politikaları çerçevesinde gerçekleştirilmektedir.
                                </p>
                            </div>
                        </section>

                        {/* 5 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">5. Kişisel Verilerin İşlenmesinin Hukuki Sebebi</h2>
                            <p>Kişisel verileriniz aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:</p>
                            <ul className="mt-2 space-y-2 text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="text-green-400 mt-0.5">✓</span>
                                    <span><strong className="text-white">KVKK m.5/2(a):</strong> Kanunlarda açıkça öngörülmesi</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-green-400 mt-0.5">✓</span>
                                    <span><strong className="text-white">KVKK m.5/2(c):</strong> Sözleşmenin kurulması veya ifası için gerekli olması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-green-400 mt-0.5">✓</span>
                                    <span><strong className="text-white">KVKK m.5/2(ç):</strong> Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-green-400 mt-0.5">✓</span>
                                    <span><strong className="text-white">KVKK m.5/2(f):</strong> Veri sorumlusunun meşru menfaatleri için zorunlu olması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-green-400 mt-0.5">✓</span>
                                    <span><strong className="text-white">KVKK m.5/1:</strong> Açık rıza (profil fotoğrafı, konum verisi gibi opsiyonel veriler için)</span>
                                </li>
                            </ul>
                        </section>

                        {/* 6 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">6. İlgili Kişi Hakları (KVKK m.11)</h2>
                            <p className="mb-3">KVKK&apos;nın 11. maddesi kapsamında aşağıdaki haklara sahipsiniz:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
                                    'İşlenmiş ise buna ilişkin bilgi talep etme',
                                    'İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme',
                                    'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme',
                                    'Eksik veya yanlış işlenmiş olması halinde düzeltilmesini isteme',
                                    'KVKK m.7 kapsamında silinmesini veya yok edilmesini isteme',
                                    'Düzeltme/silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme',
                                    'Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme',
                                    'Kanuna aykırı işlenmesi sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme',
                                ].map((right, i) => (
                                    <div key={i} className="flex items-start gap-2 bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                                        <span className="text-blue-400 font-bold text-xs mt-0.5">{i + 1}.</span>
                                        <span className="text-xs">{right}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 7 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">7. Veri Saklama Süreleri</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-700">
                                            <th className="py-3 px-4 text-white font-semibold text-xs uppercase tracking-wider">Veri Türü</th>
                                            <th className="py-3 px-4 text-white font-semibold text-xs uppercase tracking-wider">Saklama Süresi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        <tr>
                                            <td className="py-3 px-4">Hesap bilgileri</td>
                                            <td className="py-3 px-4 text-blue-300">Hesap aktif olduğu sürece</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4">Sohbet geçmişi</td>
                                            <td className="py-3 px-4 text-blue-300">Kullanıcı silene kadar veya hesap kapatılana kadar</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4">Yüklenen belgeler</td>
                                            <td className="py-3 px-4 text-blue-300">İşlem süresince (kalıcı olarak saklanmaz)</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4">Teknik loglar (IP vb.)</td>
                                            <td className="py-3 px-4 text-blue-300">En fazla 1 yıl</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4">Konum verisi</td>
                                            <td className="py-3 px-4 text-blue-300">Oturum süresince (kalıcı olarak saklanmaz)</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* 8 */}
                        <section>
                            <h2 className="text-lg font-semibold text-white mb-3">8. Başvuru Yöntemi</h2>
                            <p>
                                KVKK m.11 kapsamındaki haklarınızı kullanmak için aşağıdaki yöntemlerle başvurabilirsiniz:
                            </p>
                            <div className="mt-3 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 space-y-2">
                                <p><strong className="text-white">E-posta:</strong> <span className="text-blue-400">cmyo@ahievran.edu.tr</span></p>
                                <p><strong className="text-white">Konu:</strong> &quot;KVKK Bilgi Talebi&quot; ibaresi ile</p>
                                <p><strong className="text-white">Posta:</strong> Kırşehir Ahi Evran Üniversitesi, Çiçekdağı Meslek Yüksekokulu, Çiçekdağı / Kırşehir</p>
                            </div>
                            <p className="mt-3 text-slate-500 text-xs">
                                Başvurularınız en geç 30 (otuz) gün içinde ücretsiz olarak sonuçlandırılacaktır.
                                İşlemin ayrıca bir maliyeti gerektirmesi halinde, Kişisel Verileri Koruma Kurulu tarafından
                                belirlenen tarife üzerinden ücret alınabilir.
                            </p>
                        </section>

                        {/* Divider */}
                        <div className="border-t border-slate-700/50 pt-6">
                            <p className="text-xs text-slate-500 text-center">
                                Bu Aydınlatma Metni 26 Mart 2026 tarihinde yürürlüğe girmiştir.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Links */}
                <div className="flex justify-center gap-6 mt-8 text-xs text-slate-500">
                    <Link href="/terms" className="hover:text-blue-400 transition-colors">Kullanım Koşulları</Link>
                    <Link href="/privacy" className="hover:text-blue-400 transition-colors">Gizlilik Politikası</Link>
                </div>
            </div>
        </main>
    );
}
