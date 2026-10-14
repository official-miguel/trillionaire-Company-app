import type { Metadata, Viewport } from "next";
import { Inter, Grand_Hotel } from "next/font/google";
import "./globals.css";
import IntroLoader from "@/components/IntroLoader";
import { ServiceWorker } from "@/components/InstallApp";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const grandHotel = Grand_Hotel({
  variable: "--font-grand-hotel",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: { default: "Trillionaire Designs", template: "%s · Trillionaire Designs" },
  description: "Ledgers, pay and approvals for Trillionaire Designs and Bidii.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Trillionaire", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${grandHotel.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Before the first paint: skip the intro if this device has seen it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('td-intro-seen')==='1')document.documentElement.setAttribute('data-intro-seen','')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <IntroLoader />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
