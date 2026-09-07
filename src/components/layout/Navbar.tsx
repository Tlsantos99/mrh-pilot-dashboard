'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/data-management', label: 'Gestão de Dados' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-[#00305E] text-white shadow-md">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <span className="font-bold text-base tracking-tight">
              Piloto MRH
              <span className="ml-2 text-xs font-normal text-blue-200">Ageas Portugal</span>
            </span>
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
          <span className="text-xs text-blue-200">
            {new Date().toLocaleDateString('pt-PT')}
          </span>
        </div>
      </div>
    </nav>
  );
}
