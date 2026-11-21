/** Ícone de modelos guardados: folhas empilhadas com um quadradinho (o estilo guardado). */
export function TemplateIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" className={className} aria-hidden>
      <rect x={3.5} y={8.5} width={12.5} height={11.5} />
      <path d="M8 5.5h12.5V16" />
      <rect x={8.1} y={12.6} width={3.8} height={3.8} fill="currentColor" stroke="none" />
    </svg>
  );
}
