'use client';
import { useUi } from '@/store/ui';
import { Dialog } from '@/components/ui/Dialog';
import { tr } from '@/i18n';

const ROWS: [string, string][] = [
  ['Shift + →', tr('Replay: avançar uma barra')],
  ['Shift + ←', tr('Replay: recuar uma barra')],
  ['Shift + ↓', tr('Replay: reproduzir / pausa')],
  [tr('Escrever letras'), tr('Procurar símbolo')],
  [tr('Escrever números + Enter'), tr('Mudar intervalo (ex.: 15 → 15m, 4h, 1D)')],
  ['/', tr('Indicadores')],
  ['Alt + T', tr('Linha de tendência')],
  ['Alt + H', tr('Linha horizontal')],
  ['Alt + V', tr('Linha vertical')],
  ['Alt + F', tr('Retração de Fibonacci')],
  ['Alt + Shift + R', tr('Retângulo')],
  ['Alt + L / Alt + S', tr('Posição longa / curta')],
  ['Ctrl + Z / Ctrl + Y', tr('Desfazer / refazer desenhos')],
  ['Ctrl + C / Ctrl + V', tr('Copiar / colar o desenho selecionado')],
  [tr('Shift (a desenhar)'), tr('Alinhar a linha de 15 em 15°')],
  [tr('Ctrl (a desenhar, premido)'), tr('Inverte o íman: com o íman desligado liga-o, com ele ligado desliga-o')],
  [tr('Alt (a desenhar, premido)'), tr('Íman de preço: prende ao pavio mais próximo na vertical, mesmo sem velas ao lado')],
  ['Delete', tr('Apagar desenho selecionado')],
  ['Esc', tr('Cancelar desenho / sair da seleção')],
  ['Alt + R', tr('Repor vista do gráfico')],
  ['Alt + B / Alt + N', tr('Comprar / vender a mercado (quantidade padrão)')],
];

export function Shortcuts() {
  const open = useUi((s) => s.shortcuts);
  return (
    <Dialog open={open} onClose={() => useUi.getState().set({ shortcuts: false })} title={tr('Atalhos de teclado')} width={480}>
      <div className="divide-y divide-line">
        {ROWS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2 text-[13px]">
            <span className="text-muted">{v}</span>
            <kbd className="rounded border border-line bg-sunken px-2 py-0.5 font-mono text-xs">{k}</kbd>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
