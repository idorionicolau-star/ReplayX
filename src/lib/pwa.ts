'use client';
import { create } from 'zustand';

/** Evento do Chrome/Android para mostrar o pedido de instalação quando o utilizador quiser. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Pode instalar com um botão (Chrome, Edge, Android). */
  canInstall: boolean;
  /** Já está a correr como app instalada. */
  standalone: boolean;
  /** iPhone/iPad: instala-se pelo menu Partilhar → Adicionar ao ecrã principal. */
  ios: boolean;
  /** Há uma versão nova à espera. */
  updateReady: boolean;
}

export const usePwa = create<PwaState>(() => ({ canInstall: false, standalone: false, ios: false, updateReady: false }));

let deferred: InstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;
let started = false;

/** Regista o service worker e acompanha a instalação e as atualizações. Chamar uma vez no arranque. */
export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  usePwa.setState({ standalone, ios });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    usePwa.setState({ canInstall: false, standalone: true });
  });

  if (!('serviceWorker' in navigator)) return;
  // em desenvolvimento o service worker só atrapalha (cache de ficheiros que mudam a toda a hora)
  if (process.env.NODE_ENV !== 'production') return;
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const track = (sw: ServiceWorker | null) => {
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            // só há "atualização" se já havia uma versão a controlar a página
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = sw;
              usePwa.setState({ updateReady: true });
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          usePwa.setState({ updateReady: true });
        }
        track(reg.installing);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // procura versões novas de hora a hora
        setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      })
      .catch(() => undefined);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !usePwa.getState().updateReady) return;
      reloaded = true;
      window.location.reload();
    });
  };
  // o arranque pode ser já depois do evento "load"
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Mostra o pedido de instalação do sistema. Devolve true se o utilizador aceitou. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  deferred = null;
  usePwa.setState({ canInstall: false });
  return choice.outcome === 'accepted';
}

/** Ativa a versão nova (a página recarrega sozinha). */
export function applyUpdate() {
  if (waiting) waiting.postMessage('SKIP_WAITING');
  else window.location.reload();
}
