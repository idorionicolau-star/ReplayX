/** Íman de preço: vela com o pavio e uma linha horizontal que prende no seu extremo. */
export function PriceSnapIcon({ size = 20, className, strokeWidth = 1.5 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" className={className} aria-hidden>
      <path d="M6 3v4M6 14v4" />
      <rect x="3.5" y="7" width="5" height="7" />
      <path d="M10.5 3h3" opacity=".55" />
      <path d="M10.5 3H21" strokeDasharray="2 2" />
      <path d="M3 21h4M13 17l3 3 5-6" />
    </svg>
  );
}
