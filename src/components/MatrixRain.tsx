"use client";

import { useEffect, useRef } from "react";

/**
 * Classic "Matrix" digital-rain canvas, used as the backdrop for the
 * matrix-themed player surface. Fixed full-screen, behind the content
 * (z-0), pointer-events none. ~20fps and a single canvas, so it's cheap.
 */
export default function MatrixRain() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const glyphs =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ｱｲｳｴｵ$#%&*+=<>";
    const fontSize = 14;
    let drops: number[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.max(1, Math.floor(canvas.width / fontSize));
      drops = new Array(cols).fill(0).map(() => Math.random() * -50);
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = 0;
    function frame(t: number) {
      raf = requestAnimationFrame(frame);
      if (t - last < 50) return; // throttle to ~20fps
      last = t;
      if (!canvas || !ctx) return;

      // Translucent black fill leaves fading trails.
      ctx.fillStyle = "rgba(0, 8, 0, 0.10)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        const y = drops[i] * fontSize;
        // Leading glyph brighter than the trail.
        ctx.fillStyle = Math.random() > 0.92 ? "#b9ffb0" : "#39ff14";
        ctx.fillText(ch, i * fontSize, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.55 }}
    />
  );
}
