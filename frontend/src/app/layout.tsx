import type { Metadata } from "next";
import "./globals.css";
import { RegisterPWA } from "../features/pwa/Register";

export const metadata: Metadata = {
  title: "Untukmu — Ruang untuk Pesan, Kenangan, dan Doa",
  description: "Ruang digital untuk pesan pribadi, kenangan, dan galaksi yang bermakna.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}<RegisterPWA /></body></html>;
}
