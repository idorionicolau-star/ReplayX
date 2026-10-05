import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEGAL_UPDATED } from '@/lib/legal';
import { Logo } from '@/components/Logo';
import { LegalFooter } from './LegalFooter';

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="h-full overflow-y-auto bg-bg text-text">
      <div className="mx-auto max-w-3xl px-5 py-6">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="ReplayX">
            <Logo size={28} />
          </Link>
          <Link href="/terminal" className="text-sm text-accent hover:underline">
            Abrir a plataforma
          </Link>
        </header>
        <h1 className="mt-8 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-xs text-muted">Atualizado em {LEGAL_UPDATED}</p>
        <div className="mt-6 space-y-3 text-[14px] leading-relaxed [&_a]:text-accent [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
          {children}
        </div>
        <LegalFooter className="mt-12 border-t border-line pt-6" />
      </div>
    </main>
  );
}
