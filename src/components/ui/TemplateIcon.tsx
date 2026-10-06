import { ICON_ACCENT } from './ToolIcons';

/** Ícone de modelos guardados: folhas empilhadas com um losango laranja (o estilo guardado). */
export function TemplateIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x={3.5} y={8.5} width={12.5} height={11.5} rx={2.2} />
      <path d="M8 5.5h10.5a2 2 0 0 1 2 2V16" />
      <path d="M9.75 11.2l2.8 2.8-2.8 2.8-2.8-2.8z" fill={ICON_ACCENT} stroke="none" />
    </svg>
  );
}
