import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { amountLooksRight, eventAmount, extractPaymentRefs, parseZumboError, paymentStatusOf, verifyZumbopaySignature } from '@/server/zumbopay-core';

const SECRET = 'whsec_test_123';
const sign = (body: string, secret = SECRET) => crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');

describe('verifyZumbopaySignature', () => {
    const body = JSON.stringify({ event: 'payment.succeeded', data: { reference: 'ZP_AB12CD34', amount: 1000 } });
    it('aceita a assinatura certa', () => {
        expect(verifyZumbopaySignature(body, sign(body), SECRET)).toBe(true);
        expect(verifyZumbopaySignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
        expect(verifyZumbopaySignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
    });
    it('recusa corpo alterado ou segredo errado', () => {
        expect(verifyZumbopaySignature(body + ' ', sign(body), SECRET)).toBe(false);
        expect(verifyZumbopaySignature(body, sign(body, 'outro'), SECRET)).toBe(false);
    });
    it('nunca lança com assinaturas mal formadas', () => {
        for (const bad of ['', 'abc', 'zz', 'a'.repeat(63), 'a'.repeat(65), '🙂', null, undefined]) {
            expect(verifyZumbopaySignature(body, bad as any, SECRET)).toBe(false);
        }
    });
    it('sem segredo configurado recusa tudo', () => {
        expect(verifyZumbopaySignature(body, sign(body), undefined)).toBe(false);
        expect(verifyZumbopaySignature(body, sign(body, ''), '')).toBe(false);
    });
});

describe('extractPaymentRefs', () => {
    it('apanha a nossa referência onde quer que venha', () => {
        const refs = extractPaymentRefs({ event: 'payment.succeeded', data: { description: 'RPXLZ4K9Q2ABCD · Fabrica Teste', amount: 1000 } });
        expect(refs).toContain('RPXLZ4K9Q2ABCD');
    });
    it('apanha os identificadores da ZumboPay em data, data.payment e no topo', () => {
        expect(extractPaymentRefs({ data: { reference: 'ZP_AB12CD34', id: 'uuid-1' } })).toEqual(expect.arrayContaining(['ZP_AB12CD34', 'uuid-1']));
        expect(extractPaymentRefs({ data: { payment: { slug: 'curso-excel', reference: 'ZP_X' } } })).toEqual(expect.arrayContaining(['curso-excel', 'ZP_X']));
        expect(extractPaymentRefs({ reference: 'ZP_TOP' })).toContain('ZP_TOP');
    });
    it('não rebenta com corpos estranhos', () => {
        expect(extractPaymentRefs(null)).toEqual([]);
        expect(extractPaymentRefs('texto')).toEqual([]);
        expect(extractPaymentRefs({ data: [1, 2] })).toEqual([]);
    });
});

describe('eventAmount / amountLooksRight', () => {
    it('lê o valor em vários sítios e formatos', () => {
        expect(eventAmount({ data: { amount: 1000 } })).toBe(1000);
        expect(eventAmount({ data: { amount: '1000.50' } })).toBe(1000.5);
        expect(eventAmount({ data: { payment: { amount: 5 } } })).toBe(5);
        expect(eventAmount({ data: {} })).toBeUndefined();
    });
    it('aceita o bruto e o líquido (menos 8%), recusa o resto', () => {
        expect(amountLooksRight(1000, undefined)).toBe(true);
        expect(amountLooksRight(1000, 1000)).toBe(true);
        expect(amountLooksRight(1000, 920)).toBe(true);
        expect(amountLooksRight(1000, 500)).toBe(false);
        expect(amountLooksRight(1000, 2000)).toBe(false);
    });
});

describe('paymentStatusOf', () => {
    it('só estados claros decidem', () => {
        expect(paymentStatusOf({ status: 'completed' })).toBe('paid');
        expect(paymentStatusOf({ status: 'SUCCEEDED' })).toBe('paid');
        expect(paymentStatusOf({ status: 'expired' })).toBe('failed');
        expect(paymentStatusOf({ status: 'active' })).toBe('pending');
        expect(paymentStatusOf({})).toBe('pending');
        expect(paymentStatusOf(null)).toBe('pending');
    });
});

describe('parseZumboError', () => {
    it('lê o formato uniforme de erros', () => {
        expect(parseZumboError(400, { error: { code: 'missing_wallet_id', message: 'wallet_id é obrigatório' } })).toEqual({ status: 400, code: 'missing_wallet_id', message: 'wallet_id é obrigatório' });
        expect(parseZumboError(502, null).code).toBe('http_502');
    });
});
