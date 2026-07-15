import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Great_Vibes } from "next/font/google";
import "./globals.css";
import "@uploadthing/react/styles.css";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// "Ecosystems" marka kelimesi için premium el yazısı fontu.
// next/font build sırasında self-host eder → CSP güvenli, dış istek yok.
const greatVibes = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-ecosystems",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ÇMYO.AI | Yapay Zeka Ekosistemi",
  description: "Kırşehir Ahi Evran Üniversitesi Çiçekdağı MYO yapay zeka ekosistemi — asistan, ÇMYO.AI FİT ve akademik araçlar.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050a14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${greatVibes.variable} antialiased min-h-[100dvh] flex flex-col overflow-x-hidden`}
      >
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
