'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { ErrorBox } from '@/components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Login failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container auth-wrap">
      <div className="card">
        <h1>Log in</h1>
        <p className="muted">Sign in to your 5sim Reseller account.</p>
        <ErrorBox error={error} onDismiss={() => setError(null)} />
        <form className="form" onSubmit={onSubmit}>
          <div className="form-row">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="small muted">
          No account yet? <Link href="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
