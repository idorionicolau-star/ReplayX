export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb, verifyUser } from '@/server/firebase-admin';
import { applyPaidPayment, zumbopay } from '@/server/billing';
import { paymentStatusOf } from '@/server/zumbopay-core';

/**
 * Estado de um pagamento (usado enquanto o cliente espera). O webhook é a via principal; se ainda não chegou,
 * pergunta-se à ZumboPay pelo link de pagamento.
 */
export async function GET(req: Request) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const reference = new URL(req.url).searchParams.get('ref') || '';
  if (!reference || reference.includes('/')) return NextResponse.json({ error: 'Referência inválida.' }, { status: 400 });

  const payRef = adminDb().doc(`replayx_users/${user.uid}/payments/${reference}`);
  const snap = await payRef.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pagamento não encontrado.' }, { status: 404 });
  let p = snap.data()!;

  const lookup = p.providerReference || p.slug;
  if (p.status === 'pending' && lookup) {
    try {
      const r = await zumbopay<{ data: unknown }>(`/payments/${encodeURIComponent(lookup)}`);
      const st = paymentStatusOf(r?.data);
      if (st === 'paid') await applyPaidPayment(reference, { providerId: p.providerId || undefined });
      else if (st === 'failed') await payRef.update({ status: 'failed', updatedAt: new Date().toISOString() });
      p = (await payRef.get()).data()!;
    } catch {
      /* fica pendente: o webhook confirma */
    }
  }
  return NextResponse.json({ status: p.status, planId: p.planId, amount: p.amount, periodEnd: p.periodEnd || null });
}
