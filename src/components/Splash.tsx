'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LogoMark } from './Logo';
import { SPLASH_TILES } from './SplashArt';
import { useTr } from '@/i18n/react';

/** As 12 cenas duas vezes: a grelha enche o ecrã todo, em telemóvel e em computador. */
const TILES = [...SPLASH_TILES, ...SPLASH_TILES.map((t) => ({ ...t, id: `${t.id}-b` }))];

const KEY = 'rx-splash';
const TOTAL_MS = 3600;

/**
 * Abertura: grelha de cenas a preto e branco (luxo e esforço lado a lado) que sobe em perspetiva, escurece, e dá lugar à
 * marca e ao nome. Simples e curta; mostra-se uma vez por sessão (toque para saltar).
 */
export function Splash() {
  const tr = useTr();
  const path = usePathname();
  const [gone, setGone] = useState(false);
  const active = path === '/' || path === '/terminal';

  useEffect(() => {
    if (!active) return;
    const hidden = document.documentElement.classList.contains('no-splash');
    if (hidden) return;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* sem armazenamento */
    }
    const t = setTimeout(() => setGone(true), TOTAL_MS);
    return () => clearTimeout(t);
  }, [active]);

  if (!active || gone) return null;
  const letters = 'REPLAY'.split('');

  return (
    <div className="rx-splash" onClick={() => setGone(true)} role="presentation" data-testid="splash">
      <div className="rx-grid-wrap" aria-hidden>
        <div className="rx-grid">
          {TILES.map((t, i) => (
            <figure key={t.id} className="rx-tile" style={{ animationDelay: `${0.1 + ((i * 37) % 12) * 0.07}s` }}>
              {t.art}
              <figcaption>{tr(t.caption)}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="rx-veil" aria-hidden />
      <div className="rx-hud" aria-hidden>
        <span className="rx-corner rx-c1" />
        <span className="rx-corner rx-c2" />
        <span className="rx-corner rx-c3" />
        <span className="rx-corner rx-c4" />
      </div>

      <div className="rx-center">
        <div className="rx-mark">
          <LogoMark size={104} tone="light" />
        </div>
        <div className="rx-word" aria-label="ReplayX">
          {letters.map((l, i) => (
            <span key={i} className="rx-letter" style={{ animationDelay: `${1.95 + i * 0.05}s` }}>
              {l}
            </span>
          ))}
          <span className="rx-letter" style={{ animationDelay: `${1.95 + letters.length * 0.05}s` }}>
            X
          </span>
        </div>
        <div className="rx-tag">{tr('Treine no passado. Opere melhor no futuro.')}</div>
        <div className="rx-line">
          <span />
        </div>
      </div>
    </div>
  );
}
