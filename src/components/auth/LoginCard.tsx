'use client';
import { useState } from 'react';
import { Loader2, Mail, UserRound } from 'lucide-react';
import { authError, enterAsGuest, loginEmail, loginGoogle, registerEmail, resetPassword } from '@/lib/auth';
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

export function LoginCard() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(authError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full max-w-[400px] rounded-2xl border border-line bg-elev p-6 shadow-pop">
      <h2 className="text-lg font-semibold">{mode === 'login' ? 'Entrar no ReplayX' : 'Criar conta'}</h2>
      <p className="mt-1 text-[13px] text-muted">Os seus gráficos, desenhos, sessões de replay e estratégias ficam guardados na sua conta.</p>

      <Button variant="outline" size="lg" block className="mt-5 bg-input" disabled={!!busy} onClick={() => run('google', loginGoogle)}>
        {busy === 'google' ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
        Continuar com Google
      </Button>

      <div className="my-5 flex items-center gap-3 text-[11px] text-muted uppercase">
        <span className="h-px flex-1 bg-line" />
        ou com e-mail
        <span className="h-px flex-1 bg-line" />
      </div>

      <Segmented
        className="mb-4 w-full"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError(null);
        }}
        items={[
          { value: 'login', label: 'Entrar' },
          { value: 'register', label: 'Criar conta' },
        ]}
      />

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'login') void run('email', () => loginEmail(email, password));
          else void run('email', () => registerEmail(name, email, password));
        }}
      >
        {mode === 'register' && <Input placeholder="Nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />}
        <Input type="email" required placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        <Input
          type="password"
          required
          minLength={6}
          placeholder="Palavra-passe"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10"
        />
        {error && <div className="rounded-md bg-down/10 px-3 py-2 text-xs text-down">{error}</div>}
        {info && <div className="rounded-md bg-up/10 px-3 py-2 text-xs text-up">{info}</div>}
        <Button variant="primary" size="lg" type="submit" disabled={!!busy}>
          {busy === 'email' ? <Loader2 size={18} className="animate-spin" /> : <Mail size={16} />}
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </Button>
      </form>

      {mode === 'login' && (
        <button
          type="button"
          className="mt-3 text-xs text-accent hover:underline"
          onClick={() => {
            if (!email) {
              setError('Escreva primeiro o seu e-mail.');
              return;
            }
            void run('reset', async () => {
              await resetPassword(email);
              setInfo('Enviámos um e-mail para redefinir a palavra-passe.');
            });
          }}
        >
          Esqueci-me da palavra-passe
        </button>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <Button variant="ghost" block onClick={enterAsGuest} disabled={!!busy}>
          <UserRound size={16} />
          Continuar sem conta (dados só neste dispositivo)
        </Button>
      </div>
    </div>
  );
}
