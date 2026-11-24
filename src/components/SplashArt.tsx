import type { ReactNode } from 'react';
import { useTr } from '@/i18n/react';

/**
 * Ilustrações da abertura: cenas a traço branco sobre preto, estilizadas, para a grelha (luxo e esforço lado a lado,
 * como a ideia de ir de um sítio ao outro). São desenhos próprios, sem fotos nem arte de terceiros.
 */

const S = '#f1f1f1';
const SOFT = 'rgba(255,255,255,0.10)';
const MID = 'rgba(255,255,255,0.28)';

function Art({ children, label }: { children: ReactNode; label: string }) {
  const tr = useTr();
  return (
    <svg viewBox="0 0 120 160" className="rx-art" role="img" aria-label={tr(label)} fill="none" stroke={S} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const Waves = ({ y }: { y: number }) => (
  <g stroke={MID}>
    {[0, 7, 14].map((d, i) => (
      <path key={d} d={`M${4 + i * 6} ${y + d} q7 -4 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0`} />
    ))}
  </g>
);

/** Iate de luxo ao pôr do sol. */
function Yacht() {
  return (
    <Art label={'Iate ao pôr do sol'}>
      <circle cx="84" cy="78" r="24" stroke={MID} />
      <path d="M60 78 h48 M62 71 h44 M66 64 h36" stroke={MID} />
      <path d="M8 112 H114 L100 130 H28 Z" fill={SOFT} />
      <path d="M26 112 V100 H92 V112 M44 100 V90 H82 V100 M54 90 V82 H74 V90" />
      <path d="M64 82 V64 M58 70 H70" />
      <path d="M32 104 h6 M44 104 h6 M56 104 h6 M68 104 h6 M80 104 h6" stroke={MID} />
      <Waves y={134} />
    </Art>
  );
}

/** Cidade à noite. */
function Skyline() {
  const blocks: [number, number, number][] = [
    [6, 62, 16],
    [24, 40, 20],
    [46, 70, 14],
    [62, 28, 22],
    [86, 52, 14],
    [102, 76, 12],
  ];
  return (
    <Art label={'Cidade à noite'}>
      <path d="M96 22 a10 10 0 1 0 8 14 a8 8 0 0 1 -8 -14 z" stroke={MID} />
      {blocks.map(([x, h, w]) => (
        <g key={x}>
          <rect x={x} y={140 - h} width={w} height={h} fill={SOFT} />
          {Array.from({ length: Math.floor(h / 12) }).map((_, r) => (
            <path key={r} d={`M${x + 3} ${140 - h + 6 + r * 12} h${w - 6}`} stroke={MID} strokeDasharray="2 3" />
          ))}
        </g>
      ))}
      <path d="M62 34 V22 M62 28 h-4" />
      <path d="M0 140 H120" />
    </Art>
  );
}

/** Carro desportivo de lado. */
function Car() {
  return (
    <Art label={'Carro desportivo'}>
      <path d="M0 126 H120" stroke={MID} />
      <path d="M8 116 C12 106 26 102 40 100 L58 88 C72 82 90 86 98 98 L110 102 C114 104 114 112 112 116 Z" fill={SOFT} />
      <path d="M46 99 L60 90 C70 86 82 88 90 98 Z" stroke={MID} />
      <circle cx="34" cy="118" r="10" fill="#000" />
      <circle cx="34" cy="118" r="4" />
      <circle cx="90" cy="118" r="10" fill="#000" />
      <circle cx="90" cy="118" r="4" />
      <path d="M112 108 L128 104 M112 112 L128 114" stroke={MID} />
      <path d="M12 134 h18 M44 134 h30 M88 134 h22" stroke={MID} />
    </Art>
  );
}

/** Velas a subir. */
function Candles() {
  const c: [number, number, number, number][] = [
    [14, 112, 22, 12],
    [30, 104, 20, 8],
    [46, 98, 22, 14],
    [62, 84, 24, 10],
    [78, 70, 24, 12],
    [94, 52, 28, 16],
  ];
  return (
    <Art label={'Gráfico de velas a subir'}>
      <g stroke={MID}>
        {[40, 70, 100, 130].map((y) => (
          <path key={y} d={`M4 ${y} H116`} strokeDasharray="1 4" />
        ))}
      </g>
      {c.map(([x, y, h, w], i) => (
        <g key={x}>
          <path d={`M${x + w / 2} ${y - 8} V${y + h + 8}`} />
          <rect x={x} y={y} width={w} height={h} fill={i % 2 ? '#f1f1f1' : '#000'} />
        </g>
      ))}
      <path d="M10 126 L40 108 L66 90 L92 58 L112 30" strokeDasharray="3 3" />
      <path d="M100 30 H112 V42" />
    </Art>
  );
}

/** Mulher elegante com chapéu e óculos, de perfil. */
function Woman() {
  return (
    <Art label={'Silhueta de mulher com chapéu'}>
      <ellipse cx="60" cy="42" rx="40" ry="7" fill={SOFT} />
      <path d="M40 42 C40 20 80 20 80 42" fill={SOFT} />
      <path d="M44 38 H76" stroke={MID} />
      <path d="M46 44 C44 70 46 82 52 92 C56 98 64 98 68 92 C74 82 76 70 74 44" />
      <path d="M48 64 h11 v7 h-11 z M62 64 h11 v7 h-11 z M59 66 h3" />
      <path d="M52 94 C40 104 22 112 14 140 M68 94 C80 104 98 112 106 140" />
      <path d="M52 94 H68" stroke={MID} />
      <circle cx="44" cy="82" r="1.8" fill={S} />
      <path d="M56 84 q4 3 8 0" />
    </Art>
  );
}

/** Madrugada na paragem: um homem simples à espera da camioneta com a mochila às costas. */
function BusStop() {
  return (
    <Art label={'Homem à espera na paragem de manhã cedo'}>
      <path d="M0 122 H120" stroke={MID} />
      <path d="M0 116 a40 28 0 0 1 80 0" stroke={MID} transform="translate(40 -18) scale(0.9)" />
      <path d="M96 122 V60" />
      <rect x="86" y="46" width="20" height="14" fill={SOFT} />
      <path d="M90 53 h12 M90 57 h8" stroke={MID} />
      <circle cx="46" cy="64" r="8" />
      <path d="M38 74 C34 84 34 100 36 112 H56 C58 100 58 84 54 74 Z" fill={SOFT} />
      <path d="M38 112 L34 134 M54 112 L58 134" />
      <path d="M36 80 C26 82 24 98 30 104 L38 100" />
      <rect x="28" y="84" width="10" height="18" rx="2" stroke={MID} />
      <path d="M10 134 h20 M70 134 h32" stroke={MID} />
    </Art>
  );
}

/** Palmeiras ao fim da tarde. */
function Palms() {
  return (
    <Art label={'Palmeiras ao pôr do sol'}>
      <circle cx="78" cy="92" r="20" stroke={MID} />
      <path d="M0 126 H120" stroke={MID} />
      <path d="M34 126 C36 104 32 84 38 52" />
      <path d="M38 52 C28 40 14 42 8 52 M38 52 C32 36 40 26 52 26 M38 52 C46 38 60 40 66 50 M38 52 C32 60 18 62 12 74 M38 52 C46 60 60 62 64 74" />
      <path d="M90 126 C90 112 94 100 92 84" />
      <path d="M92 84 C86 76 76 78 72 86 M92 84 C96 74 106 76 110 84 M92 84 C86 90 80 92 78 98" />
      <Waves y={134} />
    </Art>
  );
}

/** Banca de rua: uma vendedora atrás da mesa, debaixo do guarda-sol. */
function Vendor() {
  return (
    <Art label={'Banca de rua'}>
      <path d="M0 128 H120" stroke={MID} />
      <path d="M14 58 C30 30 90 30 106 58 Z" fill={SOFT} />
      <path d="M14 58 H106 M42 58 V40 M72 58 V40" stroke={MID} />
      <path d="M60 30 V124" />
      <circle cx="60" cy="74" r="8" />
      <path d="M50 86 C48 96 48 108 50 118 H70 C72 108 72 96 70 86 Z" fill={SOFT} />
      <rect x="18" y="106" width="84" height="8" fill="#000" />
      <path d="M22 106 v22 M98 106 v22" />
      {[26, 38, 50, 74, 86].map((x, i) => (
        <circle key={x} cx={x} cy={100} r={i % 2 ? 4 : 5} stroke={MID} />
      ))}
    </Art>
  );
}

/** Relógio com setas de retrocesso: o replay. */
function Clock() {
  return (
    <Art label={'Relógio com retrocesso'}>
      <circle cx="60" cy="76" r="38" fill={SOFT} />
      <circle cx="60" cy="76" r="32" stroke={MID} />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        return <path key={i} d={`M${60 + Math.sin(a) * 28} ${76 - Math.cos(a) * 28} L${60 + Math.sin(a) * 32} ${76 - Math.cos(a) * 32}`} />;
      })}
      <path d="M60 76 L60 54 M60 76 L44 84" />
      <circle cx="60" cy="76" r="2.6" fill={S} />
      <path d="M32 132 L22 138 L32 144 M42 132 L32 138 L42 144" />
      <path d="M52 138 H100" stroke={MID} />
    </Art>
  );
}

/** Homem a trabalhar de capacete e fato-macaco, com uma ferramenta ao ombro. */
function Worker() {
  return (
    <Art label={'Trabalhador com capacete'}>
      <path d="M0 128 H120" stroke={MID} />
      <path d="M38 52 C38 36 70 36 70 52 Z" fill={SOFT} />
      <path d="M34 52 H74" />
      <circle cx="54" cy="62" r="9" />
      <path d="M42 74 C38 84 38 104 40 118 H68 C70 104 70 84 66 74 Z" fill={SOFT} />
      <path d="M46 118 L42 138 M62 118 L66 138" />
      <path d="M66 78 L92 62 M88 56 L98 66" />
      <path d="M40 84 L30 100" />
      <path d="M20 134 h20 M70 134 h26" stroke={MID} />
    </Art>
  );
}

export const SPLASH_TILES: { id: string; caption: string; art: ReactNode }[] = [
  { id: 'yacht', caption: '01 · MARINA', art: <Yacht /> },
  { id: 'busstop', caption: '02 · MADRUGADA', art: <BusStop /> },
  { id: 'candles', caption: '03 · MERCADO', art: <Candles /> },
  { id: 'woman', caption: '04 · ESTILO', art: <Woman /> },
  { id: 'vendor', caption: '05 · BANCA', art: <Vendor /> },
  { id: 'car', caption: '06 · VELOCIDADE', art: <Car /> },
  { id: 'clock', caption: '07 · REPLAY', art: <Clock /> },
  { id: 'worker', caption: '08 · OBRA', art: <Worker /> },
  { id: 'skyline', caption: '09 · CIDADE', art: <Skyline /> },
  { id: 'palms', caption: '10 · HORIZONTE', art: <Palms /> },
  { id: 'busstop2', caption: '11 · ESFORÇO', art: <Worker /> },
  { id: 'yacht2', caption: '12 · CONQUISTA', art: <Yacht /> },
];
