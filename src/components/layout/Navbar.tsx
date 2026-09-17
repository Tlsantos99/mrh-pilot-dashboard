'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/data-management', label: 'Gestão de Dados' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return null;

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <nav className="bg-[#00305E] text-white shadow-md">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Image src="/ageas-logo.png" alt="Ageas" width={72} height={28} className="object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
              <span className="text-blue-300 text-lg font-light">|</span>
              <span className="font-bold text-base tracking-tight">
                Piloto MRH
                <span className="ml-2 text-xs font-normal text-blue-200">Ageas Portugal</span>
              </span>
            </div>
            <div className="flex gap-1">
              {navItems.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    pathname.startsWith(href)
                      ? 'bg-white/20 text-white'
                      : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Image src="/kaizen-logo.png" alt="Kaizen Institute" width={80} height={24} className="object-contain" style={{ filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
            <span className="text-xs text-blue-200">
              {new Date().toLocaleDateString('pt-PT')}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-blue-200 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
