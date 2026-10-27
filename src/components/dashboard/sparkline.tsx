import { cn } from "@/lib/utils";

const W = 120;
const H = 36;
const PAD_X = 5;
const PAD_Y = 5;

/**
 * Tendencia en miniatura: línea de 2 px, relleno al 10 % y un punto con anillo en el
 * último valor. Es SVG puro (sin JS). Decorativa: el número y su variación la acompañan.
 */
export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = (W - PAD_X * 2) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: PAD_X + index * step,
    y: H - PAD_Y - ((value - min) / span) * (H - PAD_Y * 2),
  }));
  const line = points
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const area = `${PAD_X},${H - PAD_Y} ${line} ${last?.x.toFixed(1)},${H - PAD_Y}`;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      className={cn(
        "text-viz-1 h-9 w-[7.5rem] shrink-0 overflow-visible",
        className,
      )}
      data-slot="sparkline"
    >
      <polygon points={area} fill="currentColor" opacity={0.1} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last ? (
        <circle
          cx={last.x}
          cy={last.y}
          r={4}
          fill="currentColor"
          stroke="var(--card)"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}
