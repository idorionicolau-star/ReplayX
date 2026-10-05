export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { adminDb, verifyUser } from '@/server/firebase-admin';
import { zumbopay } from '@/server/billing';
import { planById } from '@/core/plans';

/**
 * Cria um pagamento na ZumboPay (checkout alojado: M-Pesa e cartão) para o utilizador autenticado
 * e devolve o `checkoutUrl` para onde se redireciona o cliente. O preço vem sempre do servidor.
 */
export async function POST(req: Request) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: 'Inicie sessão para assinar o Pro.' }, { status: 401 });

  const { planId } = (await req.json().catch(() => ({}))) as { planId?: string };
  const plan = planById(String(planId));
  if (!plan) return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 });

  const walletId = process.env.ZUMBOPAY_WALLET_ID;
  if (!walletId || !process.env.ZUMBOPAY_API_KEY || !process.env.ZUMBOPAY_MERCHANT_ID) {
    return NextResponse.json({ error: 'Os pagamentos ainda não estão configurados neste servidor.' }, { status: 503 });
  }

  const db = adminDb();
  const now = new Date();
  const reference = `RPX${Date.now().toString(36).toUpperCase()}${user.uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}`;
  const userRef = db.doc(`replayx_users/${user.uid}`);
  const payRef = userRef.collection('payments').doc(reference);

  // índice referência → utilizador, para o webhook encontrar o pagamento sem confiar no que vem no corpo
  await db.doc(`replayxBillingRefs/${reference}`).set({ uid: user.uid, reference, createdAt: now.toISOString() });
  await payRef.set({ reference, provider: 'zumbopay', planId: plan.id, months: plan.months, amount: plan.amount, status: 'pending', createdAt: now.toISOString() });

  try {
    const r = await zumbopay<{ data: { id?: string; reference?: string; slug?: string; checkout_url: string } }>('/payments', {
      method: 'POST',
      headers: { 'Idempotency-Key': reference },
      body: JSON.stringify({
        title: `ReplayX Pro — ${plan.label}`.slice(0, 80),
        // a nossa referência vai aqui: se o webhook devolver a descrição, é por ela que se encontra o pagamento
        description: `${reference} · ${user.email ?? user.uid}`.slice(0, 200),
        amount: plan.amount,
        currency: 'MZN',
        channels: ['mpesa', 'card'],
        wallet_id: walletId,
        max_uses: 1,
        expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString(),
      }),
    });
    const d = r.data;
    if (!d?.checkout_url) throw new Error('A ZumboPay não devolveu o link de pagamento.');
    await payRef.update({ providerId: d.id || null, providerReference: d.reference || null, slug: d.slug || null, checkoutUrl: d.checkout_url });
    // todos os identificadores que o webhook possa usar apontam para o mesmo pagamento
    await Promise.all(
      [d.reference, d.slug, d.id]
        .filter((k): k is string => !!k && !k.includes('/') && k !== reference)
        .map((k) => db.doc(`replayxBillingRefs/${k}`).set({ uid: user.uid, reference, createdAt: now.toISOString() })),
    );
    return NextResponse.json({ reference, checkoutUrl: d.checkout_url, amount: plan.amount });
  } catch (e) {
    await payRef.update({ status: 'error', error: String((e as Error)?.message || e).slice(0, 300) });
    return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente outra vez daqui a pouco.' }, { status: 502 });
  }
}
