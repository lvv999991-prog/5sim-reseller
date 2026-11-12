import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import { Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: '5sim Reseller',
  description: 'Buy virtual numbers for SMS verification. Wallet-funded, USD-only.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Nav />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
