'use client';

/** Notificações do sistema (telemóvel/computador). Usa o service worker da PWA quando existe. */

export type NotifyPermission = NotificationPermission | 'unsupported';

export function notifyPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === 'unsupported') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Mostra uma notificação. Não faz nada sem permissão. */
export async function notifyDevice(title: string, body: string, tag?: string): Promise<boolean> {
  if (notifyPermission() !== 'granted') return false;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    vibrate: [200, 100, 200],
    renotify: !!tag,
    data: { url: '/terminal' },
  };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
