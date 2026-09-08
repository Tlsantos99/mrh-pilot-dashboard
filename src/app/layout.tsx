import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Dashboard Piloto MRH — Ageas Portugal',
  description: 'Acompanhamento do piloto do novo formulário de sinistros MRH',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className={`${inter.className} min-h-screen bg-gray-50`}>
        <Navbar />
        <main className="max-w-screen-2xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
