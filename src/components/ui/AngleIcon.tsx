/** Ícone de ângulo: linha de base, linha inclinada com um ponto-âncora e o arco entre elas. */
export function AngleIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" className={className} aria-hidden>
      <path d="M3 20h18" />
      <path d="M3 20L16 7" />
      <path d="M11 20a8 8 0 0 0-2.4-5.7" opacity={0.5} />
      <rect x={16.3} y={3.9} width={3.6} height={3.6} fill="currentColor" stroke="none" transform="translate(0 0)" />
    </svg>
  );
}
