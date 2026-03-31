import type { NextConfig } from "next";

// Content Security Policy — izin verilen kaynakları kısıtlar
const CSP = [
    "default-src 'self'",
    // Script: Next.js inline scriptleri + hiçbir harici kaynak
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Style: Tailwind inline stilleri için unsafe-inline gerekli
    "style-src 'self' 'unsafe-inline'",
    // İzin verilen görsel kaynaklar
    "img-src 'self' data: blob: https://utfs.io",
    // Font kaynakları
    "font-src 'self' data:",
    // API bağlantıları: kendi domain + Vercel + OpenAI + Gemini + Telegram + Neon + UploadThing
    "connect-src 'self' https://*.vercel.app https://api.openai.com https://generativelanguage.googleapis.com https://api.telegram.org https://*.neon.tech https://uploadthing.com https://utfs.io https://api.uploadthing.com",
    // iframe: tamamen engelle
    "frame-src 'none'",
    // Obje/medya: engelle
    "object-src 'none'",
    "media-src 'self'",
    // Base URI kısıtlaması
    "base-uri 'self'",
    // Form hedefi kısıtlaması
    "form-action 'self'",
    // Yükseltilmiş güvensiz istekleri zorunlu kıl
    "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "utfs.io",
            },
        ],
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    // Temel güvenlik header'ları
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-XSS-Protection", value: "1; mode=block" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
                    // HSTS: 1 yıl, subdomain'ler dahil
                    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
                    // Content Security Policy
                    { key: "Content-Security-Policy", value: CSP },
                    // Cross-Origin izolasyon
                    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
                    // X-DNS-Prefetch-Control
                    { key: "X-DNS-Prefetch-Control", value: "off" },
                ],
            },
        ];
    },
};

export default nextConfig;
