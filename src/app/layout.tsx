import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegister } from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: 'ReplayX — Bar Replay, backtest e estratégias',
  description: 'Plataforma de gráficos e simulação: Bar Replay com troca de timeframe, backtest manual e automático, estratégias visuais e por script, índices sintéticos, forex, cripto e ações.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  applicationName: 'ReplayX',
  appleWebApp: { capable: true, title: 'ReplayX', statusBarStyle: 'black' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#131722' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

// aplica o tema antes de pintar (evita flash)
const themeScript = `try{var s=JSON.parse(localStorage.getItem('rx-settings')||'{}');var t=(s.state&&s.state.theme)||'dark';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
