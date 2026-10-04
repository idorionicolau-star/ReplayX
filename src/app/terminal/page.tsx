'use client';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startAuth, useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/Spinner';
import { Logo } from '@/components/Logo';

const Terminal = dynamic(() => import('@/components/terminal/Terminal').then((m) => m.Terminal), {
  ssr: false,
  loading: () => <Loading />,
});

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg">
      <Logo size={36} />
      <Spinner size={22} className="text-accent" />
    </div>
  );
}

export default function TerminalPage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    startAuth();
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace('/');
  }, [ready, user, router]);

  if (!ready || !user) return <Loading />;
  return <Terminal />;
}
