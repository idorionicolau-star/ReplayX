'use client';
import { useUi } from '@/store/ui';
import { Dialog } from '@/components/ui/Dialog';

const ROWS: [string, string][] = [
  ['Shift + →', 'Replay: avançar uma barra'],
  ['Shift + ←', 'Replay: recuar uma barra'],
  ['Shift + ↓', 'Replay: reproduzir / pausa'],
  ['Escrever letras', 'Procurar símbolo'],
  ['Escrever números + Enter', 'Mudar intervalo (ex.: 15 → 15m, 4h, 1D)'],
  ['/', 'Indicadores'],
  ['Alt + T', 'Linha de tendência'],
  ['Alt + H', 'Linha horizontal'],
  ['Alt + V', 'Linha vertical'],
  ['Alt + F', 'Retração de Fibonacci'],
  ['Alt + Shift + R', 'Retângulo'],
  ['Alt + L / Alt + S', 'Posição longa / curta'],
  ['Ctrl + Z / Ctrl + Y', 'Desfazer / refazer desenhos'],
  ['Ctrl + C / Ctrl + V', 'Copiar / colar o desenho selecionado'],
  ['Shift (a desenhar)', 'Alinhar a linha de 15 em 15°'],
  ['Ctrl (a desenhar)', 'Ligar/desligar o íman'],
  ['Delete', 'Apagar desenho selecionado'],
  ['Esc', 'Cancelar desenho / sair da seleção'],
  ['Alt + R', 'Repor vista do gráfico'],
  ['Alt + B / Alt + N', 'Comprar / vender a mercado (quantidade padrão)'],
];

export function Shortcuts() {
  const open = useUi((s) => s.shortcuts);
  return (
    <Dialog open={open} onClose={() => useUi.getState().set({ shortcuts: false })} title="Atalhos de teclado" width={480}>
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
