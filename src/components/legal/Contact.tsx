import { OPERATOR, SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '@/lib/legal';

/** Contacto de suporte (definido por variáveis de ambiente). */
export function Contact() {
  const wa = SUPPORT_WHATSAPP.replace(/\D/g, '');
  if (!SUPPORT_EMAIL && !wa) return <p>Para qualquer questão, contacte {OPERATOR} pelos canais de suporte indicados no site onde a plataforma está publicada.</p>;
  return (
    <ul>
      {SUPPORT_EMAIL && (
        <li>
          E-mail: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </li>
      )}
      {wa && (
        <li>
          WhatsApp: <a href={`https://wa.me/${wa}`}>{SUPPORT_WHATSAPP}</a>
        </li>
      )}
    </ul>
  );
}
