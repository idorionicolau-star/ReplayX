import type { MetadataRoute } from 'next';

/** Manifesto da PWA: instalar no telemóvel/computador como uma app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/terminal',
    name: 'ReplayX — Bar Replay e backtest',
    short_name: 'ReplayX',
    description: 'Bar Replay com troca de intervalo, backtest, estratégias e alertas para índices sintéticos, forex, cripto e ações.',
    lang: 'pt',
    dir: 'ltr',
    start_url: '/terminal?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#131722',
    theme_color: '#131722',
    categories: ['finance', 'education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Bar Replay', short_name: 'Replay', url: '/terminal?action=replay', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Alertas', short_name: 'Alertas', url: '/terminal?tab=alerts', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
