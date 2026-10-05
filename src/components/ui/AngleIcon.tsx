/** Ícone de ângulo: uma linha de base, uma linha inclinada e o arco entre elas. */
export function AngleIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 20h18" />
      <path d="M3 20 17 6" />
      <path d="M11 20a8 8 0 0 0-2.4-5.7" />
    </svg>
  );
}
