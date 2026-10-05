export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb } from '@/server/firebase-admin';
import { applyPaidPayment, findPaymentByRef } from '@/server/billing';
import { eventAmount, extractPaymentRefs, verifyZumbopaySignature } from '@/server/zumbopay-core';

/**
 * Webhook da ZumboPay (Painel → Programadores): URL = https://<o-seu-site>/api/billing/webhook
 * Eventos: payment.succeeded, payment.failed, payment.refunded.
 * Verifica a assinatura (`x-zumbopay-signature`: HMAC-SHA256 hex do corpo bruto) antes de fazer seja o que for.
 * Pagamentos que não são nossos (a mesma conta pode receber outros, ex.: do MajorStockX) são ignorados com 200,
 * para a ZumboPay não repetir a entrega.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyZumbopaySignature(raw, req.headers.get('x-zumbopay-signature'), process.env.ZUMBOPAY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  let evt: Record<string, any>;
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const eventName = String(evt?.event || evt?.type || '');
  const db = adminDb();
  const refs = extractPaymentRefs(evt);
  let outcome: Record<string, unknown> = { ok: true, ignored: 'event' };
  let matched: { reference: string; uid: string } | null = null;
  try {
    for (const r of refs) {
      matched = await findPaymentByRef(r);
      if (matched) break;
    }
    if (!matched) {
      outcome = { ok: true, ignored: 'unknown reference' };
    } else if (eventName === 'payment.succeeded') {
      outcome = await applyPaidPayment(matched.reference, {
        providerId: typeof evt?.data?.id === 'string' ? evt.data.id : undefined,
        transactionId: evt?.data?.transaction_id || evt?.data?.reference || undefined,
        amount: eventAmount(evt),
      });
    } else if (eventName === 'payment.failed') {
      const pRef = db.doc(`replayx_users/${matched.uid}/payments/${matched.reference}`);
      const cur = await pRef.get();
      if (cur.exists && cur.get('status') === 'pending') await pRef.update({ status: 'failed', updatedAt: new Date().toISOString() });
      outcome = { ok: true };
    } else if (eventName === 'payment.refunded') {
      // não se retira o Pro sozinho: fica registado para decisão humana
      await db.doc(`replayx_users/${matched.uid}/payments/${matched.reference}`).set({ refundedAt: new Date().toISOString() }, { merge: true });
      outcome = { ok: true, note: 'refund recorded' };
    }
  } catch (e) {
    console.error('ZumboPay webhook error', e);
    await db.collection('replayxBillingEvents').add({ receivedAt: new Date().toISOString(), event: eventName, refs, error: String((e as Error)?.message || e).slice(0, 300) }).catch(() => undefined);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 }); // a ZumboPay repete
  }
  // guarda (sem números de telefone) o evento, para confirmar o formato no início
  await db
    .collection('replayxBillingEvents')
    .add({ receivedAt: new Date().toISOString(), event: eventName, refs, matched: matched?.reference || null, outcome, payload: raw.replace(/\d{9,}/g, '***').slice(0, 4000) })
    .catch(() => undefined);
  return NextResponse.json(outcome);
}
