'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { ErrorBox } from '@/components/ui';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(new Error('Passwords do not match.'));
      return;
    }
    if (password.length < 8) {
      setError(new Error('Password must be at least 8 characters.'));
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password, displayName.trim() || undefined);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Registration failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container auth-wrap">
      <div className="card">
        <h1>Create account</h1>
        <p className="muted">Register for the 5sim Reseller platform. USD-only, 18+.</p>
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
            <label htmlFor="displayName">Display name (optional)</label>
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="field-hint">At least 8 characters.</span>
          </div>
          <div className="form-row">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <p className="small muted">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
