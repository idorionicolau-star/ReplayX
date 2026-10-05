import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Firestore em memória (só o que o servidor de pagamentos usa)
type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();
const snap = (path: string) => ({ exists: store.has(path), data: () => store.get(path), get: (k: string) => store.get(path)?.[k] });
const ref = (path: string) => ({
  path,
  get: async () => snap(path),
  set: async (d: Doc, o?: { merge?: boolean }) => void store.set(path, o?.merge ? { ...(store.get(path) ?? {}), ...d } : d),
  update: async (d: Doc) => void store.set(path, { ...(store.get(path) ?? {}), ...d }),
  collection: (n: string) => ({ doc: (id: string) => ref(`${path}/${n}/${id}`) }),
});
const fakeDb = {
  doc: ref,
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      get: async (r: { path: string }) => snap(r.path),
      update: (r: { path: string }, d: Doc) => void store.set(r.path, { ...(store.get(r.path) ?? {}), ...d }),
      set: (r: { path: string }, d: Doc, o?: { merge?: boolean }) => void store.set(r.path, o?.merge ? { ...(store.get(r.path) ?? {}), ...d } : d),
    }),
};
vi.mock('@/server/firebase-admin', () => ({ adminDb: () => fakeDb }));

import { applyPaidPayment, findPaymentByRef } from '@/server/billing';

const DAY = 86_400_000;
const seed = (opts: { amount?: number; planId?: string; user?: Doc } = {}) => {
  store.clear();
  store.set('replayxBillingRefs/RPXABC', { uid: 'u1', reference: 'RPXABC' });
  store.set('replayxBillingRefs/zumbo-slug', { uid: 'u1', reference: 'RPXABC' });
  store.set('replayx_users/u1/payments/RPXABC', { reference: 'RPXABC', planId: opts.planId ?? 'mensal', months: 1, amount: opts.amount ?? 100, status: 'pending' });
  if (opts.user) store.set('replayx_users/u1', opts.user);
};

describe('pagamentos do ReplayX Pro', () => {
  beforeEach(() => seed());

  it('encontra o pagamento por qualquer identificador', async () => {
    expect(await findPaymentByRef('RPXABC')).toEqual({ uid: 'u1', reference: 'RPXABC' });
    expect(await findPaymentByRef('zumbo-slug')).toEqual({ uid: 'u1', reference: 'RPXABC' });
    expect(await findPaymentByRef('outro')).toBeNull();
    expect(await findPaymentByRef('a/b')).toBeNull();
  });

  it('pagar ativa o Pro por um mês (+2 dias de tolerância)', async () => {
    const t0 = Date.now();
    const r = await applyPaidPayment('RPXABC', { amount: 100, providerId: 'p1' });
    expect(r.ok).toBe(true);
    const u = store.get('replayx_users/u1')!;
    const end = Date.parse(u.subscriptionEndsAt as string);
    expect(u.plan).toBe('mensal');
    expect(end - t0).toBeGreaterThan(27 * DAY);
    expect(end - t0).toBeLessThan(32 * DAY);
    expect(u.paidUntilMs).toBe(end + 2 * DAY);
    expect(store.get('replayx_users/u1/payments/RPXABC')).toMatchObject({ status: 'paid', providerId: 'p1' });
  });

  it('é idempotente: o mesmo aviso duas vezes não prolonga duas vezes', async () => {
    await applyPaidPayment('RPXABC', { amount: 100 });
    const first = store.get('replayx_users/u1')!.subscriptionEndsAt;
    const again = await applyPaidPayment('RPXABC', { amount: 100 });
    expect(again).toMatchObject({ ok: true, already: true });
    expect(store.get('replayx_users/u1')!.subscriptionEndsAt).toBe(first);
  });

  it('pagar antes do fim soma ao fim atual (não perde dias)', async () => {
    const currentEnd = new Date(Date.now() + 10 * DAY).toISOString();
    seed({ user: { plan: 'mensal', subscriptionEndsAt: currentEnd } });
    await applyPaidPayment('RPXABC', { amount: 100 });
    const end = Date.parse(store.get('replayx_users/u1')!.subscriptionEndsAt as string);
    expect(end - Date.parse(currentEnd)).toBeGreaterThan(27 * DAY);
    expect(end - Date.parse(currentEnd)).toBeLessThan(32 * DAY);
  });

  it('plano anual dá 12 meses', async () => {
    seed({ planId: 'anual', amount: 1000 });
    await applyPaidPayment('RPXABC', { amount: 1000 });
    const end = Date.parse(store.get('replayx_users/u1')!.subscriptionEndsAt as string);
    expect(end - Date.now()).toBeGreaterThan(360 * DAY);
  });

  it('valor muito diferente do plano não ativa nada', async () => {
    const r = await applyPaidPayment('RPXABC', { amount: 10 });
    expect(r).toMatchObject({ ok: false, reason: 'amount-mismatch' });
    expect(store.get('replayx_users/u1')).toBeUndefined();
    expect(store.get('replayx_users/u1/payments/RPXABC')).toMatchObject({ status: 'amount-mismatch' });
  });

  it('referência desconhecida é ignorada', async () => {
    expect(await applyPaidPayment('NAOEXISTE', { amount: 100 })).toMatchObject({ ok: false, reason: 'unknown-reference' });
  });

  it('o valor líquido (a ZumboPay retém 8%) ainda é aceite', async () => {
    const r = await applyPaidPayment('RPXABC', { amount: 92 });
    expect(r.ok).toBe(true);
  });
});
