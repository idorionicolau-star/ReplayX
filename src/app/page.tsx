'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, BrainCircuit, CalendarClock, Code2, History, Layers, PencilRuler, Rewind } from 'lucide-react';
import { startAuth, useAuth } from '@/lib/auth';
import { LoginCard } from '@/components/auth/LoginCard';
import { Logo } from '@/components/Logo';
import { Spinner } from '@/components/ui/Spinner';
import { LegalFooter } from '@/components/legal/LegalFooter';

const FEATURES = [
  { icon: Rewind, title: 'Bar Replay completo', text: 'Volte a qualquer data, avance barra a barra ou em reprodução, e troque de timeframe a meio do replay sem perder o ponto.' },
  { icon: Layers, title: 'Todos os mercados', text: 'Índices sintéticos (Volatility, Boom & Crash, Step, Jump…), forex, ouro, índices, cripto e ações.' },
  { icon: PencilRuler, title: 'Ferramentas de desenho completas', text: 'Linhas, Fibonacci, canais, pitchfork, retângulos, texto, posição longa/curta e medições.' },
  { icon: BarChart3, title: '35+ indicadores', text: 'Médias, Bollinger, RSI, MACD, Ichimoku, Supertrend, VWAP, ADX, volume e mais.' },
  { icon: History, title: 'Backtest manual', text: 'Compre e venda durante o replay com SL/TP, veja o diário, estatísticas e curva de capital.' },
  { icon: BrainCircuit, title: 'Estratégias visuais', text: 'Monte regras "SE … ENTÃO …" sem programar, otimize os parâmetros e valide em walk-forward.' },
  { icon: Code2, title: 'Scripts', text: 'Escreva indicadores e estratégias em JavaScript ao estilo Pine Script.' },
  { icon: CalendarClock, title: 'Notícias e calendário', text: 'Calendário económico e manchetes de forex, cripto e ações.' },
];

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    startAuth();
  }, []);

  useEffect(() => {
    if (ready && user) router.replace('/terminal');
  }, [ready, user, router]);

  return (
    <main className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 py-6 lg:px-8">
        <header className="flex items-center justify-between">
          <Logo size={30} />
          <span className="hidden text-xs text-muted sm:block">Bar Replay · Backtest · Estratégias</span>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_1fr] lg:py-16">
          <div>
            <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-[42px]">
              Treine no passado.
              <br />
              <span className="text-accent">Opere melhor no futuro.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
              Uma plataforma de gráficos profissional, feita para praticar: Bar Replay com troca de timeframe, operações simuladas, diário de trading e
              backtest automático de estratégias — incluindo os índices sintéticos.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-3 rounded-xl border border-line bg-elev/60 p-3">
                  <f.icon size={20} className="mt-0.5 shrink-0 text-accent" />
                  <div>
                    <div className="text-[13px] font-semibold">{f.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted">{f.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">{!ready || user ? <Spinner size={28} className="text-accent" /> : <LoginCard />}</div>
        </section>

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[11px] text-muted">Dados de mercado: Deriv (sintéticos, forex, metais, índices), Binance (cripto) e Yahoo Finance (ações e futuros).</p>
          <LegalFooter />
        </div>
      </div>
    </main>
  );
}
