'use client';
import type { ReactNode } from 'react';
import { useLang } from '@/i18n/react';

/** Mostra o conteúdo no idioma escolhido (o servidor pinta em português). */
export function ByLang({ pt, en }: { pt: ReactNode; en: ReactNode }) {
  return <>{useLang() === 'en' ? en : pt}</>;
}
