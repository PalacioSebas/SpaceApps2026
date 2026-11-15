"use client";

import { useEffect, useRef } from "react";

type Star = { x: number; y: number; r: number; base: number; speed: number; phase: number; hue: string };

const HUES = ["243,245,250", "85,214,255", "155,140,255", "255,236,214"];

export function Starfield({ density = 0.00018, className = "" }: { density?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(width * height * density);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.92 ? Math.random() * 0.9 + 0.2 : Math.random() * 1.4 + 0.9,
        base: Math.random() * 0.6 + 0.25,
        speed: Math.random() * 0.0012 + 0.0004,
        phase: Math.random() * Math.PI * 2,
        hue: HUES[Math.random() < 0.8 ? 0 : Math.floor(Math.random() * HUES.length)],
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        const alpha = reduceMotion ? s.base : s.base * (0.65 + 0.35 * Math.sin(t * s.speed + s.phase));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.hue},${alpha})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      draw(t);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (!frame && !reduceMotion) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    build();
    draw(0);

    const resizeObserver = new ResizeObserver(() => {
      build();
      draw(performance.now());
    });
    resizeObserver.observe(canvas);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) start();
      else stop();
    });
    visibilityObserver.observe(canvas);

    return () => {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [density]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
