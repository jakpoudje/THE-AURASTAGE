import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The AuraStage — AI Film Production Studio",
  description:
    "The complete AI film production studio. Turn your ideas into professional films with intelligent tools for scriptwriting, casting, scenes, visuals, sound and final edit — all in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-aura-bg text-white antialiased">{children}</body>
    </html>
  );
}
