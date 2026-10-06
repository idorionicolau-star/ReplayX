import { ICON_ACCENT } from './ToolIcons';

/** Ícone de ângulo: linha de base, linha inclinada com losango e o arco entre elas em laranja. */
export function AngleIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 20h18" />
      <path d="M3 20L16 7" />
      <path d="M11 20a8 8 0 0 0-2.4-5.7" stroke={ICON_ACCENT} />
      <path d="M18.4 4.6l2.4 2.4-2.4 2.4-2.4-2.4z" fill={ICON_ACCENT} stroke="none" />
    </svg>
  );
}
