'use client';
import { useEffect } from 'react';
import { startPwa } from '@/lib/pwa';

/** Regista o service worker em todas as páginas. */
export function PwaRegister() {
  useEffect(() => startPwa(), []);
  return null;
}
