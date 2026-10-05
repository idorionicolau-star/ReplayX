import { describe, expect, it } from 'vitest';
import { entitlement, extendSubscription, freeReplayTfOk, GRACE_DAYS, PLANS, TRIAL_DAYS } from '@/core/plans';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 5, 12);

describe('planos', () => {
  it('preços coerentes (planos longos saem mais baratos por mês)', () => {
    const perMonth = PLANS.map((p) => p.amount / p.months);
    expect(perMonth[1]).toBeLessThan(perMonth[0]);
    expect(perMonth[2]).toBeLessThan(perMonth[1]);
  });

  it('conta nova tem teste do Pro', () => {
    const e = entitlement(null, NOW - 2 * DAY, NOW);
    expect(e).toMatchObject({ pro: true, reason: 'trial', daysLeft: TRIAL_DAYS - 2 });
  });

  it('teste acabado e sem pagamento = grátis', () => {
    expect(entitlement(null, NOW - (TRIAL_DAYS + 1) * DAY, NOW)).toMatchObject({ pro: false, reason: 'free' });
    expect(entitlement(null, null, NOW).pro).toBe(false);
  });

  it('pago ganha ao teste e conta até ao fim do período', () => {
    const end = NOW + 10 * DAY;
    const e = entitlement({ plan: 'mensal', subscriptionEndsAt: new Date(end).toISOString(), paidUntilMs: end + GRACE_DAYS * DAY }, NOW - DAY, NOW);
    expect(e).toMatchObject({ pro: true, reason: 'paid', endsAt: end, daysLeft: 10 });
  });

  it('período pago terminado (já sem tolerância) = grátis', () => {
    const e = entitlement({ paidUntilMs: NOW - 1 }, NOW - 100 * DAY, NOW);
    expect(e.pro).toBe(false);
  });

  it('replay grátis só a partir de 15m', () => {
    expect(freeReplayTfOk('1m')).toBe(false);
    expect(freeReplayTfOk('5m')).toBe(false);
    expect(freeReplayTfOk('15m')).toBe(true);
    expect(freeReplayTfOk('4h')).toBe(true);
    expect(freeReplayTfOk('1D')).toBe(true);
  });

  it('pagar antes do fim não perde dias', () => {
    const now = new Date(NOW);
    const cur = new Date(NOW + 5 * DAY).toISOString();
    const r = extendSubscription(cur, 1, now);
    expect(r.start.toISOString()).toBe(cur);
    expect(extendSubscription(undefined, 3, now).start.getTime()).toBe(NOW);
    expect(extendSubscription(new Date(NOW - DAY).toISOString(), 1, now).start.getTime()).toBe(NOW);
  });
});
