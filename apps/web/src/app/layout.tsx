import type { Metadata } from "next";
import { Onest } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const onest = Onest({
  display: "swap",
  subsets: ["cyrillic", "latin"],
  variable: "--font-onest",
});

export const metadata: Metadata = {
  title: "Notes AI - рабочее пространство",
  description: "Заметки, файлы и AI в одном рабочем пространстве",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html className={onest.variable} lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
