import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { Contact } from '@/components/legal/Contact';
import { OPERATOR } from '@/lib/legal';
import { PLANS, TRIAL_DAYS, FREE_LIMITS } from '@/core/plans';

export const metadata: Metadata = { title: 'Termos de utilização — ReplayX' };

const mzn = (n: number) => `${n.toLocaleString('pt-PT')} MT`;

export default function Termos() {
  return (
    <LegalLayout title="Termos de utilização">
      <p>
        Estes termos aplicam-se ao uso do ReplayX (“a plataforma”), disponibilizado e detido por {OPERATOR}, titular da plataforma e da marca ReplayX. Ao criar conta, entrar como convidado ou usar a plataforma, aceita estes termos, a{' '}
        <a href="/privacidade">Política de privacidade</a> e o <a href="/aviso-de-risco">Aviso de risco</a>.
      </p>

      <h2>1. O que é o ReplayX</h2>
      <p>
        O ReplayX é uma ferramenta de gráficos, estudo e simulação: permite ver mercados, rever o passado em “Bar Replay”, fazer operações <b>simuladas</b>, testar estratégias e criar
        alertas. <b>Não é uma corretora</b>, não recebe dinheiro para investir, não envia ordens a nenhum mercado e não presta aconselhamento financeiro.
      </p>

      <h2>2. Conta</h2>
      <ul>
        <li>Pode entrar com Google, com e-mail e palavra-passe, ou como convidado (neste caso os dados ficam só no seu dispositivo).</li>
        <li>Tem de ter pelo menos 18 anos.</li>
        <li>É responsável por manter a sua palavra-passe em segurança e por tudo o que se fizer na sua conta.</li>
        <li>Deve dar informação verdadeira e não partilhar a conta com terceiros para contornar os limites do plano.</li>
      </ul>

      <h2>3. Planos e pagamentos</h2>
      <ul>
        <li>
          <b>Plano grátis:</b> replay a partir de {FREE_LIMITS.replayMinTf}, 1 gráfico, {FREE_LIMITS.indicatorsPerChart} indicadores por gráfico e {FREE_LIMITS.backtestsPerDay} backtests por dia.
        </li>
        <li>
          <b>Teste do Pro:</b> as contas novas têm {TRIAL_DAYS} dias de Pro grátis.
        </li>
        <li>
          <b>Plano Pro:</b> {PLANS.map((p) => `${p.label.toLowerCase()} ${mzn(p.amount)}`).join(', ')}.
        </li>
        <li>O pagamento é feito em meticais (MZN), por M-Pesa ou cartão, através da ZumboPay. Nós não vemos nem guardamos o seu número de telefone nem os dados do cartão.</li>
        <li>
          <b>Não há renovação automática.</b> O Pro dura o período que pagou (mais 2 dias de tolerância). Pagar antes do fim soma ao período em curso. Nada é cobrado sem que o confirme.
        </li>
        <li>Podemos alterar os preços e os limites dos planos, avisando antes. As alterações não afetam períodos já pagos.</li>
        <li>
          <b>Reembolsos:</b> os pagamentos não são reembolsáveis, exceto em caso de cobrança indevida ou duplicada, ou quando a lei o exigir. Se achar que houve um erro, contacte o suporte
          em 7 dias.
        </li>
        <li>Quando o Pro termina, a conta passa ao plano grátis. Os seus dados mantêm-se.</li>
      </ul>

      <h2>4. Uso aceitável</h2>
      <p>Não pode:</p>
      <ul>
        <li>usar a plataforma para fins ilegais ou para prejudicar outras pessoas;</li>
        <li>tentar aceder a contas ou dados de outros utilizadores, ou ao servidor, fora do uso normal;</li>
        <li>copiar em massa, revender ou redistribuir os dados de mercado, as estratégias ou o conteúdo da plataforma;</li>
        <li>contornar os limites do plano, o pagamento ou as proteções técnicas.</li>
      </ul>

      <h2>5. Dados de mercado</h2>
      <p>
        Os preços vêm de fontes de terceiros (por exemplo Deriv, Binance e Yahoo Finance) e há também mercados simulados. Podem ter atrasos, falhas ou erros, e podem ficar indisponíveis
        sem aviso. Não garantimos que sejam exatos, completos ou contínuos. Os índices sintéticos são produtos de terceiros e não têm relação com mercados reais.
      </p>

      <h2>6. Simulações e resultados</h2>
      <p>
        As operações, os backtests e as estatísticas do ReplayX são simulações. Resultados simulados <b>não garantem</b> resultados reais: a execução real tem spreads, derrapagem, liquidez
        e emoções que a simulação não reproduz. Leia o <a href="/aviso-de-risco">Aviso de risco</a>.
      </p>

      <h2>7. Propriedade e atribuições</h2>
      <p>
        O software, a marca ReplayX e o conteúdo próprio são propriedade de {OPERATOR}, que detém todos os direitos sobre eles. Os desenhos, estratégias e notas que cria continuam a ser seus. Os gráficos usam o Lightweight Charts™ da TradingView,
        Inc. (Copyright © TradingView, Inc.). O ReplayX não é afiliado, patrocinado nem aprovado por TradingView, Inc., Deriv, Binance ou Yahoo; os nomes pertencem aos respetivos donos.
      </p>

      <h2>8. Disponibilidade e responsabilidade</h2>
      <p>
        A plataforma é fornecida “como está”. Esforçamo-nos por mantê-la a funcionar, mas pode haver interrupções, erros ou perda de dados. Os alertas só são verificados enquanto a aplicação
        está aberta e podem falhar ou chegar atrasados; <b>não deve depender deles para decisões financeiras</b>. Na medida permitida pela lei, não somos responsáveis por perdas ou danos
        resultantes do uso da plataforma, incluindo decisões de investimento tomadas com base nela.
      </p>

      <h2>9. Suspensão e encerramento</h2>
      <p>Pode deixar de usar a plataforma e pedir a eliminação da conta quando quiser. Podemos suspender ou encerrar contas que violem estes termos, avisando sempre que possível.</p>

      <h2>10. Alterações a estes termos</h2>
      <p>Podemos atualizar estes termos. A data de atualização está no topo; se a mudança for importante, avisamos na plataforma. Continuar a usá-la depois da mudança significa que a aceita.</p>

      <h2>11. Lei aplicável</h2>
      <p>Estes termos regem-se pelas leis da República de Moçambique.</p>

      <h2>12. Contacto</h2>
      <Contact />
    </LegalLayout>
  );
}
