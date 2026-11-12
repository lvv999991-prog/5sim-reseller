'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/ui';

/** Root: send logged-in users to the dashboard, everyone else to login. */
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) router.replace(user ? '/dashboard' : '/login');
  }, [loading, user, router]);

  return (
    <div className="container">
      <Loading label="Loading…" />
    </div>
  );
}
