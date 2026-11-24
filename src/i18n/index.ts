import { EN } from './en';

/**
 * Idiomas da app. O texto em português é a própria chave: `tr('Guardar')` devolve
 * "Guardar" em português e "Save" em inglês. Sem tradução, mostra o português.
 * Valores entram com {0}, {1}…: `tr('Pro até {0}', data)`.
 */
export type Lang = 'pt' | 'en';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'English' },
];

const KEY = 'rx-lang';

/** Idioma guardado ou, na primeira visita, o do telemóvel/navegador (inglês → inglês, o resto → português). */
export function detectLang(saved: string | null, navLangs: readonly string[]): Lang {
  if (saved === 'pt' || saved === 'en') return saved;
  const first = navLangs.find(Boolean) ?? '';
  return /^en\b/i.test(first) ? 'en' : 'pt';
}

function initial(): Lang {
  if (typeof window === 'undefined') return 'pt';
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* armazenamento bloqueado */
  }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return detectLang(saved, nav);
}

let current: Lang = initial();

export const getLang = (): Lang => current;

/** Muda o idioma e recarrega a página (os textos e gráficos são refeitos no novo idioma). */
export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* armazenamento bloqueado */
  }
  if (lang === current) return;
  current = lang;
  if (typeof location !== 'undefined') location.reload();
}

function fill(s: string, args: readonly unknown[]): string {
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

/** Traduz num idioma dado (para testes e para a página servida pelo servidor). */
export function trIn(lang: Lang, pt: string, ...args: unknown[]): string {
  return fill(lang === 'en' ? (EN[pt] ?? pt) : pt, args);
}

/** Traduz para o idioma atual. */
export function tr(pt: string, ...args: unknown[]): string {
  return trIn(current, pt, ...args);
}

/** Locale para datas e números. */
export function locale(lang: Lang = current): string {
  return lang === 'en' ? 'en-US' : 'pt-PT';
}
