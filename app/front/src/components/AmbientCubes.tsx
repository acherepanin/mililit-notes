type AmbientCubesArea = 'auth' | 'sidebar' | 'workspace';
type AmbientCubeTone = 'solid' | 'wire' | 'soft';

const cubes = [
  { name: 'main', tone: 'solid' },
  { name: 'wire', tone: 'wire' },
  { name: 'spark', tone: 'solid' },
  { name: 'smallA', tone: 'soft' },
  { name: 'smallB', tone: 'wire' },
  { name: 'smallC', tone: 'soft' },
] as const satisfies ReadonlyArray<{ name: string; tone: AmbientCubeTone }>;
const particles = Array.from({ length: 24 }, (_, index) => index + 1);

interface AmbientCubesProps {
  area: AmbientCubesArea;
}

function AmbientCubeSvg({ gradientId }: { gradientId: string }) {
  const topId = `${gradientId}-top`;
  const leftId = `${gradientId}-left`;
  const rightId = `${gradientId}-right`;

  return (
    <svg className="ambient-cubes__svg" viewBox="0 0 100 112" focusable="false">
      <defs>
        <linearGradient id={topId} x1="8" x2="92" y1="5" y2="53" gradientUnits="userSpaceOnUse">
          <stop className="ambient-cubes__stop ambient-cubes__stop--top-a" offset="0%" />
          <stop className="ambient-cubes__stop ambient-cubes__stop--top-b" offset="58%" />
          <stop className="ambient-cubes__stop ambient-cubes__stop--top-c" offset="100%" />
        </linearGradient>
        <linearGradient id={leftId} x1="8" x2="50" y1="29" y2="101" gradientUnits="userSpaceOnUse">
          <stop className="ambient-cubes__stop ambient-cubes__stop--left-a" offset="0%" />
          <stop className="ambient-cubes__stop ambient-cubes__stop--left-b" offset="100%" />
        </linearGradient>
        <linearGradient id={rightId} x1="50" x2="92" y1="53" y2="29" gradientUnits="userSpaceOnUse">
          <stop className="ambient-cubes__stop ambient-cubes__stop--right-a" offset="0%" />
          <stop className="ambient-cubes__stop ambient-cubes__stop--right-b" offset="100%" />
        </linearGradient>
      </defs>
      <path
        className="ambient-cubes__cube-top"
        d="M50 5 L92 29 L50 53 L8 29 Z"
        fill={`url(#${topId})`}
      />
      <path
        className="ambient-cubes__cube-left"
        d="M8 29 L50 53 L50 101 L8 77 Z"
        fill={`url(#${leftId})`}
      />
      <path
        className="ambient-cubes__cube-right"
        d="M92 29 L50 53 L50 101 L92 77 Z"
        fill={`url(#${rightId})`}
      />
      <path className="ambient-cubes__cube-edge" d="M8 29 L50 53 L92 29" />
      <path className="ambient-cubes__cube-edge" d="M50 53 L50 101" />
      <path className="ambient-cubes__cube-edge" d="M8 29 L8 77 L50 101 L92 77 L92 29" />
      <path className="ambient-cubes__cube-inner" d="M50 5 L50 53 M8 77 L50 53 M92 77 L50 53" />
    </svg>
  );
}

export function AmbientCubes({ area }: AmbientCubesProps) {
  return (
    <div className={`ambient-cubes ambient-cubes--${area}`} aria-hidden="true">
      <div className="ambient-cubes__dots">
        {particles.map((particle) => (
          <span key={particle} className="ambient-cubes__dot" />
        ))}
      </div>
      {cubes.map((cube) => (
        <span
          key={cube.name}
          className={`ambient-cubes__cube ambient-cubes__cube--${cube.name} ambient-cubes__cube--tone-${cube.tone}`}
        >
          <AmbientCubeSvg gradientId={`ambient-${area}-${cube.name}`} />
        </span>
      ))}
    </div>
  );
}
