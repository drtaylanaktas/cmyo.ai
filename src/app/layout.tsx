import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@uploadthing/react/styles.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";

// FOUC önleyici: ilk boyamadan önce kayıtlı temayı <html data-theme>'e uygular.
// Varsayılan koyu (markanın kimliği); kullanıcı toggle ile açığa geçebilir.
const themeInitScript = `(function(){try{var t=localStorage.getItem('cmyo-theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ÇMYO.AI v1.0 | Yapay Zeka Asistanı",
  description: "Kırşehir Ahi Evran Üniversitesi Çiçekdağı MYO Yapay Zeka Asistanı",
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-[100dvh] flex flex-col overflow-x-hidden`}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
