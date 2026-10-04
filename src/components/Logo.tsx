export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#2962ff" />
        <g fill="#fff">
          <rect x="13" y="22" width="7" height="22" rx="1.5" />
          <rect x="15.75" y="16" width="1.5" height="34" rx=".75" />
          <rect x="28" y="28" width="7" height="14" rx="1.5" opacity=".75" />
          <rect x="30.75" y="22" width="1.5" height="26" rx=".75" opacity=".75" />
        </g>
        <path d="M41 20v24l13-12z" fill="#fff" />
      </svg>
      {withText && (
        <span className="text-[17px] font-bold tracking-tight">
          Replay<span className="text-accent">X</span>
        </span>
      )}
    </span>
  );
}
