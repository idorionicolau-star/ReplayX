// Parte pura da integração ZumboPay (sem rede nem Firebase), para poder ser testada.
// Documentação: https://zumbopay.com/app/developers/docs — API REST em https://zumbopay.com/api/public/v1,
// "Authorization: Bearer zk_live_…" + "X-Merchant-Id: MCH_…", webhooks com "x-zumbopay-signature" (HMAC-SHA256 hex do corpo bruto).
import crypto from 'crypto';

/** Verifica a assinatura do webhook (hex do HMAC-SHA256 do corpo bruto). Nunca lança: assinatura mal formada = inválida. */
export function verifyZumbopaySignature(rawBody: string, signature: string | null | undefined, secret: string | undefined): boolean {
    if (!secret || !signature) return false;
    const given = signature.trim().replace(/^sha256=/i, '').toLowerCase();
    if (!/^[0-9a-f]+$/.test(given)) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    // o exemplo da documentação rebenta quando os tamanhos diferem; aqui compara-se sempre com tamanhos iguais
    if (given.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

/** A nossa referência (RPX…) vai na descrição do pagamento; se o webhook a devolver, apanha-se em qualquer parte do corpo. */
const OUR_REF = /\bRPX[A-Z0-9]{6,}\b/g;
const ID_KEYS = new Set(['reference', 'payment_reference', 'paymentreference', 'slug', 'id', 'payment_id', 'paymentid', 'link_id', 'source_id', 'external_reference']);

/**
 * Todos os identificadores do pagamento que o webhook possa trazer. A documentação não descreve o corpo dos eventos,
 * por isso não se assume um formato: junta-se a referência nossa (onde quer que esteja) e os campos com nome de
 * identificador no evento e nos objectos `data` / `payment`. Quem chama procura cada um no índice de referências.
 */
export function extractPaymentRefs(evt: unknown): string[] {
    const out = new Set<string>();
    const text = JSON.stringify(evt ?? {});
    for (const m of text.match(OUR_REF) || []) out.add(m);
    const scan = (o: any) => {
        if (!o || typeof o !== 'object') return;
        for (const [k, v] of Object.entries(o)) {
            if (typeof v === 'string' && v && ID_KEYS.has(k.toLowerCase())) out.add(v);
        }
    };
    const e = evt as any;
    scan(e); scan(e?.data); scan(e?.data?.payment); scan(e?.payment); scan(e?.data?.link);
    return [...out];
}

/** Valor do evento, se vier. */
export function eventAmount(evt: any): number | undefined {
    const raw = evt?.data?.amount ?? evt?.data?.payment?.amount ?? evt?.amount;
    const n = typeof raw === 'string' ? parseFloat(raw) : raw;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * O valor do evento bate com o do plano? O link é criado pelo servidor com o valor fixo, por isso isto é só uma
 * rede de segurança — e o evento pode trazer o líquido (a ZumboPay retém 8%), não o bruto. Aceita de 85% a 105%.
 */
export function amountLooksRight(expected: number, got: number | undefined): boolean {
    if (got === undefined) return true;
    return got >= expected * 0.85 && got <= expected * 1.05;
}

const PAID = new Set(['paid', 'completed', 'complete', 'succeeded', 'success', 'successful', 'used']);
const DEAD = new Set(['failed', 'cancelled', 'canceled', 'expired', 'declined', 'rejected']);
/** Estado do link de pagamento (GET /payments/:ref). Só estados claros contam; o resto fica pendente. */
export function paymentStatusOf(data: any): 'paid' | 'failed' | 'pending' {
    const st = String(data?.status ?? '').toLowerCase();
    if (PAID.has(st)) return 'paid';
    if (DEAD.has(st)) return 'failed';
    return 'pending';
}

export type ZumboError = { code: string; message: string; status: number };
export function parseZumboError(status: number, body: any): ZumboError {
    return { status, code: String(body?.error?.code || `http_${status}`), message: String(body?.error?.message || body?.message || `ZumboPay ${status}`) };
}
