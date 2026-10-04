/**
 * BorderGlow (adapted from React Bits) — mesh-gradient border with a
 * directional outer glow. Used for the AI analysis card only.
 *
 * Pared down from the original: no cursor tracking and no continuous orbit —
 * the only animation left is the one-shot intro sweep (`sweep` replays it when
 * it flips to true). Tuned subtle for the light glass theme.
 */
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import "./border-glow.css";

function parseHSL(hslStr: string): { h: number; s: number; l: number } {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 258, s: 85, l: 70 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor: string, intensity: number): Record<string, string> {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];
  const vars: Record<string, string> = {};
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }
  return vars;
}

const GRADIENT_POSITIONS = [
  "80% 55%",
  "69% 34%",
  "8% 6%",
  "41% 38%",
  "86% 85%",
  "82% 18%",
  "51% 4%",
];
const GRADIENT_KEYS = [
  "--gradient-one",
  "--gradient-two",
  "--gradient-three",
  "--gradient-four",
  "--gradient-five",
  "--gradient-six",
  "--gradient-seven",
];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] =
      `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars["--gradient-base"] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}
function easeInCubic(x: number): number {
  return x * x * x;
}

type AnimateOpts = {
  start?: number;
  end?: number;
  duration?: number;
  delay?: number;
  ease?: (x: number) => number;
  onUpdate: (value: number) => void;
  onEnd?: () => void;
};

function animateValue({
  start = 0,
  end = 100,
  duration = 1000,
  delay = 0,
  ease = easeOutCubic,
  onUpdate,
  onEnd,
}: AnimateOpts): () => void {
  let raf = 0;
  const timer = window.setTimeout(() => {
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - t0) / duration, 1);
      onUpdate(start + (end - start) * ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else onEnd?.();
    };
    raf = requestAnimationFrame(tick);
  }, delay);
  return () => {
    window.clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}

type BorderGlowProps = {
  children: ReactNode;
  className?: string;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  /** Replay the intro sweep whenever this flips to true. */
  sweep?: boolean;
  colors?: string[];
  fillOpacity?: number;
};

export function BorderGlow({
  children,
  className = "",
  edgeSensitivity = 30,
  glowColor = "258 85 70",
  backgroundColor = "rgb(255 255 255 / 0.62)",
  borderRadius = 16,
  glowRadius = 28,
  glowIntensity = 0.55,
  coneSpread = 25,
  sweep = false,
  colors = ["#a78bfa", "#f472b6", "#38bdf8"],
  fillOpacity = 0.25,
}: BorderGlowProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Intro sweep: a full lap of the border that eases in, whips around, eases out.
  useEffect(() => {
    const card = cardRef.current;
    if (!sweep || !card) return;
    const angleStart = 110;
    const angleEnd = 465;
    const setAngle = (v: number) =>
      card.style.setProperty(
        "--cursor-angle",
        `${(angleEnd - angleStart) * (v / 100) + angleStart}deg`,
      );

    card.classList.add("sweep-active");
    card.style.setProperty("--cursor-angle", `${angleStart}deg`);
    const cancels = [
      animateValue({
        duration: 500,
        onUpdate: (v) => card.style.setProperty("--edge-proximity", String(v)),
      }),
      animateValue({ ease: easeInCubic, duration: 1500, end: 50, onUpdate: setAngle }),
      animateValue({
        ease: easeOutCubic,
        delay: 1500,
        duration: 2250,
        start: 50,
        end: 100,
        onUpdate: setAngle,
      }),
      animateValue({
        ease: easeInCubic,
        delay: 2500,
        duration: 1500,
        start: 100,
        end: 0,
        onUpdate: (v) => card.style.setProperty("--edge-proximity", String(v)),
        onEnd: () => card.classList.remove("sweep-active"),
      }),
    ];
    return () => {
      cancels.forEach((cancel) => cancel());
      card.classList.remove("sweep-active");
    };
  }, [sweep]);

  const style: CSSProperties & Record<string, string> = {
    "--card-bg": backgroundColor,
    "--edge-sensitivity": String(edgeSensitivity),
    "--bg-border-radius": `${borderRadius}px`,
    "--glow-padding": `${glowRadius}px`,
    "--cone-spread": String(coneSpread),
    "--fill-opacity": String(fillOpacity),
    ...buildGlowVars(glowColor, glowIntensity),
    ...buildGradientVars(colors),
  };

  return (
    <div ref={cardRef} className={`border-glow-card ${className}`} style={style}>
      <span className="edge-light" />
      <div className="border-glow-inner">{children}</div>
    </div>
  );
}
