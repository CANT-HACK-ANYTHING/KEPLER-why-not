import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OfflineMeshProvider } from "@/components/OfflineMeshContext";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PwaBanner } from "@/components/PwaBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RelayEV - Offline Rural EV Charging Mesh",
  description: "Decentralized, Peer-to-Peer EV charging mesh with cryptographic escrow over Web Bluetooth in cellular dead zones.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-512.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RelayEV",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-900 text-slate-100">
        <OfflineMeshProvider>
          <ServiceWorkerRegister />
          <PwaBanner />
          {children}
        </OfflineMeshProvider>
      </body>
    </html>
  );
}
