'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/buy', label: 'Buy Number' },
  { href: '/orders', label: 'Orders' },
  { href: '/deposits', label: 'Deposits' },
] as const;

export function Nav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <header className="nav">
      <Link href="/dashboard" className="brand">
        5sim Reseller
      </Link>
      <nav className="nav-links">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href || pathname.startsWith(`${l.href}/`) ? 'active' : ''}
          >
            {l.label}
          </Link>
        ))}
        {user.role === 'ADMIN' && (
          <Link href="/admin" className={pathname.startsWith('/admin') ? 'active' : ''}>
            Admin
          </Link>
        )}
      </nav>
      <div className="nav-user">
        <span className="nav-email" title={user.email}>
          {user.displayName ?? user.email}
          {user.role === 'ADMIN' && <span className="badge badge-admin">ADMIN</span>}
        </span>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
}
