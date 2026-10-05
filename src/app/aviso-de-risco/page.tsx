import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { Contact } from '@/components/legal/Contact';

export const metadata: Metadata = { title: 'Aviso de risco — ReplayX' };

export default function AvisoDeRisco() {
  return (
    <LegalLayout title="Aviso de risco">
      <p className="rounded-lg border border-warn/50 bg-warn/10 p-3">
        <b>Negociar em mercados financeiros envolve um risco elevado e pode levar à perda de todo o capital.</b> O ReplayX é uma ferramenta de estudo e simulação e não constitui aconselhamento
        financeiro, de investimento ou fiscal.
      </p>

      <h2>O ReplayX não é uma corretora</h2>
      <p>Todas as operações feitas no ReplayX são simuladas, com dinheiro fictício. Nenhuma ordem chega a um mercado real e a plataforma não recebe nem guarda dinheiro para investir.</p>

      <h2>Resultados simulados não garantem resultados reais</h2>
      <ul>
        <li>O passado não garante o futuro: uma estratégia que ganhou no replay ou no backtest pode perder em mercado real.</li>
        <li>Na vida real há spreads, comissões, derrapagem, atrasos de execução e falta de liquidez que a simulação só reproduz de forma aproximada.</li>
        <li>Os backtests podem sofrer de sobreajuste (otimizar demais para dados antigos) e de dados incompletos. O “walk-forward” ajuda, mas não elimina o problema.</li>
        <li>Operar a sério tem um peso emocional que não se sente numa simulação.</li>
      </ul>

      <h2>Índices sintéticos, forex e outros produtos</h2>
      <ul>
        <li>
          Os <b>índices sintéticos</b> (Volatility, Boom, Crash, Step, Jump…) são produtos de terceiros gerados por algoritmo: não representam mercados reais e têm risco muito elevado.
        </li>
        <li>O forex, os CFDs e produtos com alavancagem podem ampliar tanto os ganhos como as perdas, e é possível perder mais do que o valor inicial.</li>
        <li>As criptomoedas são muito voláteis.</li>
      </ul>

      <h2>Os dados e os alertas podem falhar</h2>
      <p>
        Os preços vêm de fontes de terceiros e podem estar atrasados, incorretos ou indisponíveis. Os alertas só são verificados com a aplicação aberta e podem não chegar ou chegar tarde. Nunca
        dependa só deles para decidir uma operação real.
      </p>

      <h2>A decisão é sua</h2>
      <p>Só arrisque dinheiro que pode perder. Antes de operar a sério, informe-se, comece com valores pequenos e, se necessário, fale com um profissional qualificado e licenciado.</p>

      <h2>Contacto</h2>
      <Contact />
    </LegalLayout>
  );
}
