import type { ReactNode } from 'react';

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="text-[13px] font-medium">{title}</div>
      {children && <div className="max-w-[280px] text-xs text-muted">{children}</div>}
    </div>
  );
}
