'use client';
import { LANGS, setLang } from '@/i18n';
import { useLang } from '@/i18n/react';
import { cn } from '@/components/ui/cn';

/** Botões PT / EN (página de entrada). */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLang();
  return (
    <div className={cn('inline-flex rounded-md border border-line p-0.5', className)} role="group" aria-label="Idioma / Language">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          title={l.label}
          aria-pressed={lang === l.id}
          onClick={() => setLang(l.id)}
          className={cn('h-6 rounded px-2 text-xs font-semibold uppercase', lang === l.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-text')}
        >
          {l.id}
        </button>
      ))}
    </div>
  );
}
