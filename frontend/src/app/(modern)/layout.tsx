import localFont from "next/font/local";
import "@/modern/styles/globals.css";
import { ModernHeader } from "@/modern/components/ModernHeader";
const inter = localFont({ src: [{ path: "../../../public/fonts/InterVariable.woff2", weight: "100 900", style: "normal" }, { path: "../../../public/fonts/InterVariable-Italic.woff2", weight: "100 900", style: "italic" }], variable: "--font-inter", display: "swap" });
const mono = localFont({ src: "../../../public/fonts/JetBrainsMono-Regular.woff2", variable: "--font-mono-face", display: "swap" });
export default function Layout({ children }: { children: React.ReactNode }) {
 return <html lang="en" suppressHydrationWarning><body data-project="vlr" className={`${inter.variable} ${mono.variable}`}><ModernHeader /><main>{children}</main></body></html>;
}
