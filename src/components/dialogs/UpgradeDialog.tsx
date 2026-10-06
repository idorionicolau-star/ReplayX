'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Crown, Loader2, ShieldCheck, Smartphone, XCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { toast } from '@/components/ui/Toast';
import { auth } from '@/lib/firebase';
import { logout, useAuth } from '@/lib/auth';
import { backtestsLeftToday, closeUpgrade, featureText, useBilling, usePlan } from '@/lib/billing';
import { FREE_LIMITS, PLANS, PRO_BENEFITS, TRIAL_DAYS, type PlanId } from '@/core/plans';

const PENDING_KEY = 'rx-pending-payment';
const mzn = (n: number) => `${n.toLocaleString('pt-PT')} MT`;
const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

type PayState = { ref: string; status: 'pending' | 'paid' | 'failed' } | null;

function readPending(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { ref: string; at: number };
    return Date.now() - p.at < 30 * 60_000 ? p.ref : null;
  } catch {
    return null;
  }
}

function writePending(ref: string | null) {
  try {
    if (ref) localStorage.setItem(PENDING_KEY, JSON.stringify({ ref, at: Date.now() }));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* sem armazenamento */
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await auth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function UpgradeDialog() {
  const { open, feature } = useBilling((s) => s.upgrade);
  if (!open) return null;
  return <UpgradeDialogInner feature={feature} />;
}

function UpgradeDialogInner({ feature }: { feature: Parameters<typeof featureText>[0] }) {
  const user = useAuth((s) => s.user);
  const plan = usePlan();
  const router = useRouter();
  const [selected, setSelected] = useState<PlanId>('trimestral');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<PayState>(() => {
    const ref = readPending();
    return ref ? { ref, status: 'pending' } : null;
  });
  const reason = featureText(feature);
  const payRef = pay?.status === 'pending' ? pay.ref : null;

  // acompanha o pagamento até ficar pago ou falhar (≈ 2 min); o plano também muda sozinho pelo Firestore
  useEffect(() => {
    if (!payRef) return;
    let stop = false;
    let tries = 0;
    const tick = async () => {
      try {
        const r = await fetch(`/api/billing/status?ref=${encodeURIComponent(payRef)}`, { headers: await authHeader() });
        const j = (await r.json().catch(() => ({}))) as { status?: string };
        if (stop) return;
        if (j.status === 'paid') {
          writePending(null);
          setPay({ ref: payRef, status: 'paid' });
          toast('Pagamento confirmado', { kind: 'success', body: 'O plano Pro já está ativo.' });
          return;
        }
        if (j.status === 'failed') {
          writePending(null);
          setPay({ ref: payRef, status: 'failed' });
          return;
        }
      } catch {
        /* tenta outra vez */
      }
      if (!stop && ++tries < 40) setTimeout(tick, 3000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [payRef]);

  const checkout = async () => {
    setError(null);
    setBusy(true);
    // abre já a janela (no telemóvel uma janela aberta depois de esperar pela rede é bloqueada)
    const win = window.open('', '_blank');
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ planId: selected }),
      });
      if (r.status === 404) throw new Error('Os pagamentos ainda não estão ativos neste servidor.');
      const j = (await r.json().catch(() => ({}))) as { reference?: string; checkoutUrl?: string; error?: string };
      if (!r.ok || !j.checkoutUrl || !j.reference) throw new Error(j.error || 'Não foi possível iniciar o pagamento.');
      writePending(j.reference);
      setPay({ ref: j.reference, status: 'pending' });
      if (win) win.location.href = j.checkoutUrl;
      else window.location.href = j.checkoutUrl;
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const current = plan.reason === 'lifetime' ? 'Pro vitalício' : plan.reason === 'paid' ? `Pro até ${fmtDate(plan.endsAt)}` : plan.reason === 'trial' ? `Teste do Pro: falta${plan.daysLeft === 1 ? '' : 'm'} ${plan.daysLeft} dia${plan.daysLeft === 1 ? '' : 's'}` : 'Plano grátis';

  return (
    <Dialog
      open
      onClose={closeUpgrade}
      width={640}
      title={
        <span className="flex items-center gap-2">
          <Crown size={18} className="text-warn" /> ReplayX Pro
        </span>
      }
    >
      <div className="space-y-4" data-testid="upgrade-dialog">
        {reason && <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]">{reason}</div>}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px]">
          <span>
            Agora: <b>{current}</b>
          </span>
          {plan.reason === 'free' && <span className="text-xs text-muted">Backtests restantes hoje: {backtestsLeftToday()} de {FREE_LIMITS.backtestsPerDay}</span>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ul className="space-y-1.5 text-[13px]">
            {PRO_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-up" /> {b}
              </li>
            ))}
            <li className="pt-1 text-xs text-muted">
              Grátis: replay a partir de {FREE_LIMITS.replayMinTf}, 1 gráfico, {FREE_LIMITS.indicatorsPerChart} indicadores por gráfico e {FREE_LIMITS.backtestsPerDay} backtests por dia. Contas novas têm {TRIAL_DAYS} dias de Pro grátis.
            </li>
          </ul>

          <div className="space-y-2">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors', selected === p.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover')}
                data-testid={`plan-${p.id}`}
              >
                <span>
                  <span className="block text-[13px] font-semibold">{p.label}</span>
                  <span className="block text-xs text-muted">{p.months === 1 ? 'por mês' : `${p.months} meses · ${mzn(Math.round(p.amount / p.months))}/mês`}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] font-bold tabular-nums">{mzn(p.amount)}</span>
                  {p.note && <span className="block text-[11px] font-medium text-up">{p.note}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>

        {pay?.status === 'pending' && (
          <div className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px]">
            <Loader2 size={15} className="animate-spin text-accent" /> À espera da confirmação do pagamento ({pay.ref}). Pode fechar esta janela; o plano ativa-se sozinho.
          </div>
        )}
        {pay?.status === 'paid' && (
          <div className="flex items-center gap-2 rounded-lg bg-up/10 px-3 py-2 text-[13px] text-up">
            <CheckCircle2 size={15} /> Pagamento confirmado. Obrigado!
          </div>
        )}
        {pay?.status === 'failed' && (
          <div className="flex items-center gap-2 rounded-lg bg-down/10 px-3 py-2 text-[13px] text-down">
            <XCircle size={15} /> O pagamento não foi concluído. Pode tentar de novo.
          </div>
        )}
        {error && <div className="rounded-lg bg-down/10 px-3 py-2 text-[13px] text-down">{error}</div>}

        {user?.guest ? (
          <Button
            variant="primary"
            size="lg"
            block
            onClick={async () => {
              closeUpgrade();
              await logout();
              router.replace('/');
            }}
          >
            Criar conta para assinar o Pro
          </Button>
        ) : (
          <Button variant="primary" size="lg" block disabled={busy} onClick={checkout} data-testid="pay-button">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
            Pagar {mzn(PLANS.find((p) => p.id === selected)!.amount)} com M-Pesa ou cartão
          </Button>
        )}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
          <ShieldCheck size={13} /> Pagamento seguro pela ZumboPay. Renovação manual: nada é cobrado sem confirmar.
        </div>
        <div className="text-center text-[11px] text-muted">
          Ao pagar aceita os{' '}
          <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Termos
          </a>{' '}
          (sem reembolso, exceto cobrança indevida) e o{' '}
          <a href="/aviso-de-risco" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Aviso de risco
          </a>
          .
        </div>
      </div>
    </Dialog>
  );
}
