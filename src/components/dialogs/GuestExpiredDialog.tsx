'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2, Mail, Sparkles, UserRound } from 'lucide-react';
import { authError, loginEmail, loginGoogle, registerEmail, useAuth, logout } from '@/lib/auth';
import { useGuestTimer } from '@/lib/guestTimer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Tabs';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GuestExpiredDialog() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const { isExpired, dialogOpen, setDialogOpen, tick } = useGuestTimer();

  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Monitoriza o tempo a cada segundo quando é convidado
  useEffect(() => {
    if (!user?.guest) return;
    tick();
    const interval = setInterval(() => {
      tick();
    }, 1000);
    return () => clearInterval(interval);
  }, [user?.guest, tick]);

  if (!user?.guest || (!isExpired && !dialogOpen)) {
    return null;
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setDialogOpen(false);
    } catch (e) {
      setError(authError(e));
    } finally {
      setBusy(null);
    }
  };

  const handleExit = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-y-auto rounded-2xl border border-line bg-elev p-6 text-text shadow-pop animate-pop"
      >
        <div className="flex items-center gap-2 text-accent">
          <Sparkles size={20} className="animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider">A sua experiência continua</span>
        </div>

        <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          Não terminou! <span className="text-accent">A sua jornada está só a começar</span>
        </h2>

        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          O seu tempo de demonstração terminou, mas as suas análises continuam aqui. Registe-se agora para continuar o seu teste grátis sem perder os seus desenhos, configurações e sessões de treino!
        </p>

        {/* Card de Bónus Pro */}
        <div className="my-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft p-3 text-[13px]">
          <Gift size={20} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <div className="font-semibold text-text">Bónus Imediato de Boas-Vindas</div>
            <div className="mt-0.5 text-xs text-muted">
              Ao criar a sua conta gratuita, recebe automaticamente <b>14 dias de ReplayX Pro Grátis</b> (Replay em 1m, multi-gráficos e backtests ilimitados).
            </div>
          </div>
        </div>

        {/* Botão Google com 1 clique */}
        <Button variant="outline" size="lg" block className="bg-input" disabled={!!busy} onClick={() => run('google', loginGoogle)}>
          {busy === 'google' ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
          Continuar com Google
        </Button>

        <div className="my-4 flex items-center gap-3 text-[11px] uppercase text-muted">
          <span className="h-px flex-1 bg-line" />
          ou com e-mail
          <span className="h-px flex-1 bg-line" />
        </div>

        <Segmented
          className="mb-3 w-full"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(null);
          }}
          items={[
            { value: 'register', label: 'Criar conta gratuita' },
            { value: 'login', label: 'Já tenho conta' },
          ]}
        />

        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'login') void run('email', () => loginEmail(email, password));
            else void run('email', () => registerEmail(name, email, password));
          }}
        >
          {mode === 'register' && (
            <Input placeholder="Nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-[13px]" />
          )}
          <Input type="email" required placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 text-[13px]" />
          <Input
            type="password"
            required
            minLength={6}
            placeholder="Palavra-passe (mínimo 6 caracteres)"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 text-[13px]"
          />

          {error && <div className="rounded-md bg-down/10 px-3 py-2 text-xs text-down">{error}</div>}

          <Button variant="primary" size="lg" type="submit" disabled={!!busy} className="mt-1">
            {busy === 'email' ? <Loader2 size={18} className="animate-spin" /> : <Mail size={16} />}
            {mode === 'register' ? 'Criar conta e guardar progresso' : 'Entrar na minha conta'}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
          <span>Os seus dados ficam guardados</span>
          <button type="button" onClick={handleExit} className="hover:text-down hover:underline">
            Sair para a página inicial
          </button>
        </div>
      </div>
    </div>
  );
}
