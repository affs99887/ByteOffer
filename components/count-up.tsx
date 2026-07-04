"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

function fmtNum(v: number, dec: number, comma: boolean): string {
  let x = dec ? v.toFixed(dec) : String(Math.round(v));
  if (comma) {
    const p = x.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    x = p.join(".");
  }
  return x;
}

/**
 * Animated count-up — port of the design's `.bo-count` / animateCounts().
 * Counts from 0 → `to` over 1000ms with an ease-out-cubic curve on mount.
 */
export function CountUp({
  to,
  dec = 0,
  comma = false,
  prefix = "",
  suffix = "",
  style,
  className,
}: {
  to: number;
  dec?: number;
  comma?: boolean;
  prefix?: string;
  suffix?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const [text, setText] = useState(() => fmtNum(0, dec, comma));
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const dur = 1000;
    const t0 = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setText(fmtNum(to * ease(p), dec, comma));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [to, dec, comma]);

  return (
    <span className={className} style={style}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
