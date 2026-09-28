// Cinematic artwork for the home page, drawn in SVG so the page is complete without any image files.
// If a generated image exists at /home/<name>.png (see apps/api/scripts/generate-home-art.mjs), it is shown on
// top; when it's missing the <img> hides itself and the drawing underneath shows.

export function ArtImage({ name, className = "" }: { name: string; alt?: string; className?: string }) {
  // A CSS background never shows a broken-image icon: when the file doesn't exist the drawing below stays visible.
  return <div aria-hidden className={`absolute inset-0 bg-cover bg-center ${className}`} style={{ backgroundImage: `url(/home/${name}.png)` }} />;
}

/** Night film set: city skyline, stage lights, a director's chair and a monitor showing a fantasy world. */
export function HeroArt() {
  return (
    <svg viewBox="0 0 900 560" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07070a" /><stop offset="0.6" stopColor="#1a1208" /><stop offset="1" stopColor="#0a0a0c" /></linearGradient>
        <radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#ffd79a" stopOpacity="0.95" /><stop offset="0.35" stopColor="#e8b84b" stopOpacity="0.45" /><stop offset="1" stopColor="#e8b84b" stopOpacity="0" /></radialGradient>
        <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a4f7a" /><stop offset="0.55" stopColor="#c98f4f" /><stop offset="1" stopColor="#2a1c12" /></linearGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0a0a0c" /><stop offset="0.38" stopColor="#0a0a0c" stopOpacity="0.6" /><stop offset="0.6" stopColor="#0a0a0c" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="900" height="560" fill="url(#sky)" />
      {/* skyline */}
      <g fill="#121019" opacity="0.95">
        {[[380, 180, 30], [415, 140, 26], [445, 200, 40], [490, 120, 22], [515, 170, 34], [555, 90, 28], [585, 150, 44], [635, 110, 24], [665, 190, 36], [705, 130, 30], [740, 160, 42], [790, 100, 26], [820, 170, 50], [870, 140, 40]].map(([x, h, w], i) => (
          <rect key={i} x={x} y={380 - h} width={w} height={h + 40} />
        ))}
      </g>
      <g fill="#e8b84b" opacity="0.35">
        {Array.from({ length: 60 }, (_, i) => <rect key={i} x={385 + ((i * 53) % 500)} y={230 + ((i * 37) % 140)} width="2" height="3" />)}
      </g>
      {/* lamp glows + light stands */}
      {[[520, 150, 90], [640, 110, 70], [420, 330, 60], [860, 250, 55]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="url(#lamp)" />)}
      <g stroke="#2b2620" strokeWidth="4" fill="none">
        <path d="M520 165 L505 420 M520 165 L540 420 M520 165 L520 420" />
        <path d="M640 125 L630 300" />
      </g>
      <g fill="#1d1a16"><rect x="505" y="135" width="30" height="26" rx="3" /><rect x="628" y="98" width="24" height="22" rx="3" /></g>
      {/* monitor */}
      <g transform="translate(610 190) rotate(-6)">
        <rect x="0" y="0" width="250" height="150" rx="6" fill="#0d0d10" stroke="#3a3530" strokeWidth="3" />
        <rect x="8" y="8" width="234" height="134" fill="url(#screen)" />
        <path d="M60 142 L60 95 L70 80 L80 95 L80 70 L92 45 L104 70 L104 95 L118 60 L130 95 L130 142 Z" fill="#141827" opacity="0.9" />
        <path d="M150 142 L160 118 L170 142 Z M175 142 L175 120 L180 110 L185 120 L185 142 Z" fill="#141827" opacity="0.8" />
        <path d="M200 142 L203 118 L206 108 L210 118 L213 142 Z" fill="#0b0b10" />
      </g>
      {/* director's chair */}
      <g transform="translate(430 330)" fill="#16120d" stroke="#3b2f22" strokeWidth="3">
        <rect x="0" y="0" width="190" height="62" rx="3" fill="#0e0c0a" />
        <text x="95" y="40" textAnchor="middle" fill="#e8c77a" stroke="none" fontFamily="Georgia, serif" fontSize="24">The AuraStage</text>
        <path d="M10 62 L10 230 M180 62 L180 230 M0 130 L190 130 M20 230 L170 130 M170 230 L20 130" fill="none" />
      </g>
      <rect width="900" height="560" fill="url(#fade)" />
    </svg>
  );
}

type GenreId = "action" | "drama" | "scifi" | "fantasy" | "thriller" | "animation" | "documentary" | "romance";
const GENRE_SKY: Record<GenreId, [string, string]> = {
  action: ["#3b1206", "#e0641c"], drama: ["#1c1410", "#8a5a3a"], scifi: ["#050818", "#2c4a8a"], fantasy: ["#2a1a3a", "#e8a55a"],
  thriller: ["#05070c", "#1d2c3d"], animation: ["#2a1840", "#f08a4b"], documentary: ["#3a2610", "#e8b060"], romance: ["#3a0f18", "#f07a4a"],
};

/** A small cinematic scene per genre (silhouettes over a graded sky). */
export function GenreArt({ id }: { id: GenreId }) {
  const [a, b] = GENRE_SKY[id];
  const g = `g-${id}`;
  return (
    <svg viewBox="0 0 160 220" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs><linearGradient id={g} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={b} /><stop offset="1" stopColor={a} /></linearGradient></defs>
      <rect width="160" height="220" fill={`url(#${g})`} />
      <g fill="#07070a">
        {id === "action" && (<><circle cx="110" cy="120" r="46" fill="#ff8a2a" opacity="0.55" /><path d="M70 220 L72 150 L64 120 L78 96 L90 96 L100 120 L94 150 L96 220 Z" /><circle cx="84" cy="86" r="11" /><path d="M20 40 L60 40 L50 46 Z M36 36 L44 36 L40 30 Z" /></>)}
        {id === "drama" && (<><circle cx="80" cy="95" r="34" fill="#c78a5a" opacity="0.35" /><path d="M40 220 C40 160 55 140 80 140 C105 140 120 160 120 220 Z" /><ellipse cx="80" cy="100" rx="24" ry="30" /></>)}
        {id === "scifi" && (<><circle cx="120" cy="50" r="44" fill="#6f8fd8" opacity="0.45" /><circle cx="30" cy="30" r="1.5" fill="#fff" /><circle cx="60" cy="18" r="1" fill="#fff" /><circle cx="80" cy="150" r="14" /><path d="M62 220 L64 168 L96 168 L98 220 Z" /><path d="M0 220 L20 190 L40 205 L55 180 L110 205 L130 185 L160 200 L160 220 Z" /></>)}
        {id === "fantasy" && (<><path d="M30 220 L30 150 L40 120 L50 150 L50 130 L62 90 L74 130 L74 150 L86 110 L98 150 L98 130 L110 100 L122 130 L122 220 Z" /><circle cx="130" cy="60" r="22" fill="#ffd28a" opacity="0.5" /></>)}
        {id === "thriller" && (<><rect x="10" y="80" width="30" height="140" /><rect x="120" y="60" width="34" height="160" /><rect x="46" y="110" width="20" height="110" /><path d="M72 220 L74 150 L66 130 L70 112 L90 112 L94 130 L86 150 L88 220 Z" /><circle cx="80" cy="102" r="9" /><g fill="#e8b84b" opacity="0.5"><rect x="16" y="90" width="3" height="4" /><rect x="128" y="75" width="3" height="4" /><rect x="138" y="100" width="3" height="4" /></g></>)}
        {id === "animation" && (<><circle cx="80" cy="100" r="36" fill="#5a3a2a" /><circle cx="80" cy="70" r="30" /><circle cx="68" cy="100" r="6" fill="#fff" /><circle cx="92" cy="100" r="6" fill="#fff" /><circle cx="68" cy="101" r="3" /><circle cx="92" cy="101" r="3" /><path d="M40 220 C40 160 60 140 80 140 C100 140 120 160 120 220 Z" fill="#7a3a2a" /></>)}
        {id === "documentary" && (<><circle cx="120" cy="70" r="26" fill="#ffd28a" opacity="0.5" /><path d="M20 220 L20 150 C20 120 40 110 70 112 C95 114 110 125 112 150 L112 220 L98 220 L98 170 L40 170 L40 220 Z" /><path d="M20 150 C10 170 12 200 18 215" stroke="#07070a" strokeWidth="6" fill="none" /><path d="M120 220 L126 170 L132 220 Z" /><ellipse cx="140" cy="165" rx="18" ry="10" /></>)}
        {id === "romance" && (<><circle cx="80" cy="120" r="50" fill="#ff9a5a" opacity="0.4" /><path d="M40 220 C40 170 52 150 66 150 C78 150 84 170 84 220 Z" /><circle cx="64" cy="132" r="14" /><path d="M78 220 C78 168 90 146 104 146 C118 146 122 170 122 220 Z" /><circle cx="100" cy="126" r="15" /></>)}
      </g>
    </svg>
  );
}
export type { GenreId };
