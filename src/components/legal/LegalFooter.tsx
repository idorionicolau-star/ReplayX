import Link from 'next/link';
import { OPERATOR, TRADINGVIEW_URL } from '@/lib/legal';
import { cn } from '@/components/ui/cn';

/** Ligações legais e atribuição ao TradingView (exigida pela licença do Lightweight Charts™). */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('text-xs leading-relaxed text-muted', className)}>
      <nav className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/termos" className="hover:text-text hover:underline">
          Termos de utilização
        </Link>
        <Link href="/privacidade" className="hover:text-text hover:underline">
          Política de privacidade
        </Link>
        <Link href="/aviso-de-risco" className="hover:text-text hover:underline">
          Aviso de risco
        </Link>
      </nav>
      <p className="mt-3">
        <b className="text-text">ReplayX</b> é um produto de {OPERATOR}. © {new Date().getFullYear()} {OPERATOR}. Todos os direitos reservados.
      </p>
      <p className="mt-2">
        O ReplayX é uma ferramenta de estudo e simulação: não envia ordens a corretoras nem constitui aconselhamento financeiro. Os gráficos usam o{' '}
        <a href={TRADINGVIEW_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          Lightweight Charts™ da TradingView, Inc.
        </a>{' '}
        — Copyright © TradingView, Inc. O ReplayX não é afiliado ao TradingView; “TradingView” é marca de TradingView, Inc.
      </p>
    </footer>
  );
}
