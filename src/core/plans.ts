import { tfSeconds } from './timeframes';

/** Planos do ReplayX Pro (MZN), pagos pela ZumboPay (M-Pesa e cartão). Preços num único sítio. */
export type PlanId = 'mensal' | 'trimestral' | 'anual';
export interface Plan {
  id: PlanId;
  label: string;
  months: number;
  amount: number;
  note?: string;
}

export const PLANS: Plan[] = [
  { id: 'mensal', label: 'Mensal', months: 1, amount: 100 },
  { id: 'trimestral', label: 'Trimestral', months: 3, amount: 270, note: 'Poupa 10%' },
  { id: 'anual', label: 'Anual', months: 12, amount: 1000, note: 'Poupa 17%' },
];

export const planById = (id: string): Plan | undefined => PLANS.find((p) => p.id === id);

/** Dias de tolerância depois do fim do período pago. */
export const GRACE_DAYS = 2;
/** Dias de Pro grátis para contas novas (contados desde a criação da conta). */
export const TRIAL_DAYS = 7;

/** Limites do plano grátis. */
export const FREE_LIMITS = {
  /** Intervalo mínimo do gráfico (e do passo) durante o replay. */
  replayMinTf: '15m',
  /** Indicadores por gráfico. */
  indicatorsPerChart: 3,
  /** Backtests no Testador por dia. */
  backtestsPerDay: 3,
};

export type ProFeature = 'layout' | 'replayTf' | 'indicators' | 'backtests' | 'optimizer';

export const FEATURE_TEXT: Record<ProFeature, string> = {
  layout: 'Vários gráficos ao mesmo tempo são do plano Pro.',
  replayTf: `No plano grátis o replay funciona a partir de ${FREE_LIMITS.replayMinTf}. O Pro desbloqueia 1m, 5m e todos os intervalos.`,
  indicators: `O plano grátis permite ${FREE_LIMITS.indicatorsPerChart} indicadores por gráfico.`,
  backtests: `O plano grátis permite ${FREE_LIMITS.backtestsPerDay} backtests por dia.`,
  optimizer: 'Otimizador, walk-forward e teste em vários mercados são do plano Pro.',
};

export const PRO_BENEFITS = [
  'Replay em todos os intervalos (1m, 5m…)',
  'Até 4 gráficos sincronizados',
  'Indicadores sem limite',
  'Backtests sem limite',
  'Otimizador, walk-forward e multi-mercado',
];

/** Dados de faturação do utilizador (escritos só pelo servidor em `replayx_users/{uid}`). */
export interface BillingDoc {
  plan?: PlanId;
  subscriptionEndsAt?: string;
  paidUntilMs?: number;
}

export interface Entitlement {
  pro: boolean;
  reason: 'paid' | 'trial' | 'free';
  /** Fim do período pago ou do teste (ms). */
  endsAt: number | null;
  daysLeft: number | null;
}

/** Que plano está ativo agora. O pago ganha ao teste; convidados ficam no grátis. */
export function entitlement(doc: BillingDoc | null, createdAt: number | null, now = Date.now()): Entitlement {
  const paidUntil = Number(doc?.paidUntilMs) || 0;
  if (paidUntil > now) {
    const end = doc?.subscriptionEndsAt ? Date.parse(doc.subscriptionEndsAt) : paidUntil;
    const endsAt = Number.isFinite(end) ? end : paidUntil;
    return { pro: true, reason: 'paid', endsAt, daysLeft: Math.max(0, Math.ceil((endsAt - now) / 86_400_000)) };
  }
  if (createdAt) {
    const trialEnd = createdAt + TRIAL_DAYS * 86_400_000;
    if (trialEnd > now) return { pro: true, reason: 'trial', endsAt: trialEnd, daysLeft: Math.ceil((trialEnd - now) / 86_400_000) };
  }
  return { pro: false, reason: 'free', endsAt: null, daysLeft: null };
}

/** Intervalo permitido no replay do plano grátis? */
export function freeReplayTfOk(tf: string): boolean {
  return tfSeconds(tf) >= tfSeconds(FREE_LIMITS.replayMinTf);
}

/** Prolonga a subscrição: o novo período começa no mais tardio entre agora e o fim atual (pagar antes não perde dias). */
export function extendSubscription(currentEnd: string | undefined, months: number, now = new Date()): { start: Date; end: Date } {
  const cur = currentEnd ? new Date(currentEnd) : null;
  const start = cur && !isNaN(cur.getTime()) && cur > now ? cur : now;
  const end = new Date(start.getTime());
  end.setMonth(end.getMonth() + months);
  return { start, end };
}
