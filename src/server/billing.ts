import 'server-only';
import { adminDb } from './firebase-admin';
import { extendSubscription, GRACE_DAYS, planById } from '@/core/plans';
import { amountLooksRight, parseZumboError } from './zumbopay-core';

const DEFAULT_BASE = 'https://zumbopay.com/api/public/v1';

/** Chamada à API da ZumboPay (só no servidor: a chave nunca vai para o navegador). */
export async function zumbopay<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.ZUMBOPAY_API_KEY;
  const merchant = process.env.ZUMBOPAY_MERCHANT_ID;
  if (!key || !merchant) throw new Error('ZUMBOPAY_API_KEY / ZUMBOPAY_MERCHANT_ID não configurados.');
  const base = (process.env.ZUMBOPAY_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}`, 'X-Merchant-Id': merchant, ...(init.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* não é JSON */
  }
  if (!res.ok) {
    const e = parseZumboError(res.status, json);
    throw new Error(`${e.code}: ${e.message}`);
  }
  return json as T;
}

/**
 * Índice referência → utilizador (`replayxBillingRefs/{ref}`), que só o servidor lê e escreve.
 * A chave pode ser a nossa referência, a da ZumboPay, o slug ou o id.
 */
export async function findPaymentByRef(refKey: string): Promise<{ reference: string; uid: string } | null> {
  if (!refKey || refKey.includes('/')) return null;
  const snap = await adminDb().doc(`replayxBillingRefs/${refKey}`).get();
  if (!snap.exists) return null;
  const d = snap.data() as { uid: string; reference?: string };
  return { uid: d.uid, reference: d.reference || refKey };
}

/**
 * Marca um pagamento como pago (idempotente) e prolonga o Pro do utilizador.
 * O novo período começa no mais tardio entre "agora" e o fim atual (pagar antes do fim não perde dias).
 */
export async function applyPaidPayment(reference: string, info: { providerId?: string; transactionId?: string; amount?: number }) {
  const db = adminDb();
  const found = await findPaymentByRef(reference);
  if (!found) return { ok: false as const, reason: 'unknown-reference' as const };
  const userRef = db.doc(`replayx_users/${found.uid}`);
  const payRef = userRef.collection('payments').doc(found.reference);
  return db.runTransaction(async (tx) => {
    const [pSnap, uSnap] = await Promise.all([tx.get(payRef), tx.get(userRef)]);
    if (!pSnap.exists) return { ok: false as const, reason: 'missing-payment' as const };
    const p = pSnap.data()!;
    if (p.status === 'paid') return { ok: true as const, already: true as const };
    if (!amountLooksRight(Number(p.amount), info.amount)) {
      tx.update(payRef, { status: 'amount-mismatch', paidAmount: info.amount ?? null, updatedAt: new Date().toISOString() });
      return { ok: false as const, reason: 'amount-mismatch' as const };
    }
    const months = planById(p.planId)?.months || p.months || 1;
    const now = new Date();
    const { start, end } = extendSubscription(uSnap.get('subscriptionEndsAt'), months, now);
    tx.update(payRef, {
      status: 'paid',
      paidAt: now.toISOString(),
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      ...(info.providerId ? { providerId: info.providerId } : {}),
      ...(info.transactionId ? { transactionId: info.transactionId } : {}),
    });
    tx.set(
      userRef,
      {
        plan: p.planId,
        subscriptionEndsAt: end.toISOString(),
        // cópia numérica para a app: fim + tolerância
        paidUntilMs: end.getTime() + GRACE_DAYS * 86_400_000,
      },
      { merge: true },
    );
    return { ok: true as const, end: end.toISOString() };
  });
}
