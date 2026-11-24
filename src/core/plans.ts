import { tfSeconds } from './timeframes';
import { tr } from '@/i18n';

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
  { id: 'mensal', label: tr('Mensal'), months: 1, amount: 100 },
  { id: 'trimestral', label: tr('Trimestral'), months: 3, amount: 270, note: tr('Poupa 10%') },
  { id: 'anual', label: tr('Anual'), months: 12, amount: 1000, note: tr('Poupa 17%') },
];

export const planById = (id: string): Plan | undefined => PLANS.find((p) => p.id === id);

/** Dias de tolerância depois do fim do período pago. */
export const GRACE_DAYS = 2;
/** Dias de Pro grátis para contas novas (contados desde a criação da conta). */
export const TRIAL_DAYS = 30;

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
  layout: tr('Vários gráficos ao mesmo tempo são do plano Pro.'),
  replayTf: tr('No plano grátis o replay funciona a partir de {0}. O Pro desbloqueia 1m, 5m e todos os intervalos.', FREE_LIMITS.replayMinTf),
  indicators: tr('O plano grátis permite {0} indicadores por gráfico.', FREE_LIMITS.indicatorsPerChart),
  backtests: tr('O plano grátis permite {0} backtests por dia.', FREE_LIMITS.backtestsPerDay),
  optimizer: tr('Otimizador, walk-forward e teste em vários mercados são do plano Pro.'),
};

export const PRO_BENEFITS = [
  tr('Replay em todos os intervalos (1m, 5m…)'),
  tr('Até 4 gráficos sincronizados'),
  tr('Indicadores sem limite'),
  tr('Backtests sem limite'),
  tr('Otimizador, walk-forward e multi-mercado'),
];

/** Dados de faturação do utilizador (escritos só pelo servidor em `replayx_users/{uid}`). */
export interface BillingDoc {
  plan?: PlanId;
  subscriptionEndsAt?: string;
  paidUntilMs?: number;
}

export interface Entitlement {
  pro: boolean;
  reason: 'paid' | 'trial' | 'lifetime' | 'free';
  /** Fim do período pago ou do teste (ms). */
  endsAt: number | null;
  daysLeft: number | null;
}

/** Contas com Pro vitalício, sem pagamento (e-mails em minúsculas). */
export const LIFETIME_EMAILS: readonly string[] = ['idorionicolau@gmail.com'];

/** Só conta se o e-mail estiver verificado (Google verifica; uma conta de e-mail e palavra-passe criada por outra pessoa não herda o acesso). */
export function isLifetimeEmail(email: string | null | undefined, verified: boolean): boolean {
  return !!email && verified && LIFETIME_EMAILS.includes(email.trim().toLowerCase());
}

/** Que plano está ativo agora. O vitalício ganha a tudo, o pago ao teste; convidados ficam no grátis. */
export function entitlement(doc: BillingDoc | null, createdAt: number | null, now = Date.now(), lifetime = false): Entitlement {
  if (lifetime) return { pro: true, reason: 'lifetime', endsAt: null, daysLeft: null };
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
