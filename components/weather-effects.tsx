import { useEffect, useRef } from 'react';
import type { AtmosphereProfile } from '@/lib/atmosphere';

type Particle = {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  depth: number;
};

export function WeatherEffects({
  profile,
  active = true,
  reducedMotionOverride,
}: {
  profile: AtmosphereProfile;
  active?: boolean;
  reducedMotionOverride?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(profile);
  const wake = useRef<(() => void) | null>(null);
  const enabled = useRef(active);
  const motionOverride = useRef(reducedMotionOverride);
  useEffect(() => {
    motionOverride.current = reducedMotionOverride;
    wake.current?.();
  }, [reducedMotionOverride]);
  useEffect(() => {
    enabled.current = active;
    wake.current?.();
  }, [active]);

  useEffect(() => {
    target.current = profile;
    wake.current?.();
  }, [profile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let inView = true;
    let frame = 0;
    let timer = 0;
    let lastFrame = 0;
    let density = target.current.particleDensity;
    let windX = target.current.windX;
    let fallSpeed = target.current.fallSpeed;
    let gust = target.current.gust;
    let visibleKind = target.current.precipitation;

    const particle = (entering = false): Particle => {
      const depth = Math.random();
      return {
        x: Math.random() * (width + 80) - 40,
        y: entering ? -Math.random() * 40 : Math.random() * height,
        length: (5 + Math.random() * 11) * (0.65 + depth * 0.7),
        speed: (110 + Math.random() * 95) * (0.7 + depth * 0.65),
        opacity: (0.16 + depth * 0.22) * (0.7 + Math.random() * 0.5),
        depth,
      };
    };

    const paint = (elapsed: number, time: number) => {
      context.clearRect(0, 0, width, height);
      const kind = visibleKind;
      if (!kind || density < 0.5) return;
      const count = Math.min(
        240,
        Math.round((width * height * density) / 1_000_000),
      );
      const slant = 0.1 + windX * 0.7 + gust * Math.sin(time * 0.0016) * 0.09;
      for (let index = 0; index < count; index++) {
        const drop = particles[index];
        const snow = kind === 'snow' || (kind === 'mixed' && index % 3 === 0);
        const speed = drop.speed * fallSpeed * (snow ? 0.8 : 1);
        drop.x += (snow ? windX * 0.4 : slant) * speed * elapsed;
        drop.y += speed * elapsed;
        if (drop.y > height + 25 || drop.x < -50 || drop.x > width + 50) {
          particles[index] = particle(true);
          continue;
        }
        if (snow) {
          const size = drop.depth > 0.72 ? 4 : drop.depth > 0.35 ? 3 : 2;
          context.fillStyle = `rgba(234, 248, 255, ${Math.min(0.86, drop.opacity + 0.3)})`;
          context.fillRect(Math.round(drop.x), Math.round(drop.y), size, size);
        } else {
          context.strokeStyle = `rgba(180, 227, 255, ${Math.min(0.76, drop.opacity * (0.85 + Math.min(1, density / 250) * 0.8))})`;
          context.lineWidth = drop.depth > 0.86 ? 1.4 : 1;
          context.beginPath();
          context.moveTo(drop.x, drop.y);
          context.lineTo(
            drop.x + slant * drop.length,
            drop.y + drop.length * (kind === 'drizzle' ? 0.55 : 1),
          );
          context.stroke();
        }
      }
    };

    const stop = () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      timer = 0;
      frame = 0;
      lastFrame = 0;
    };

    const animate = (time: number) => {
      frame = 0;
      if (
        !enabled.current ||
        document.hidden ||
        !inView ||
        (motionOverride.current ?? reducedMotion.matches)
      )
        return;
      const elapsed = lastFrame ? Math.min((time - lastFrame) / 1000, 0.08) : 0;
      lastFrame = time;
      // About twelve seconds to settle after a new observation.
      const blend = 1 - Math.exp(-elapsed / 3.5);
      density += (target.current.particleDensity - density) * blend;
      windX += (target.current.windX - windX) * blend;
      fallSpeed += (target.current.fallSpeed - fallSpeed) * blend;
      gust += (target.current.gust - gust) * blend;
      if (target.current.precipitation)
        visibleKind = target.current.precipitation;
      paint(elapsed, time);
      if (density < 0.5 && target.current.particleDensity === 0) return;
      timer = window.setTimeout(() => {
        timer = 0;
        frame = window.requestAnimationFrame(animate);
      }, 25);
    };

    const sync = () => {
      stop();
      if (!enabled.current || !width || !height || document.hidden || !inView)
        return;
      if (motionOverride.current ?? reducedMotion.matches) {
        density = target.current.particleDensity;
        windX = target.current.windX;
        fallSpeed = target.current.fallSpeed;
        gust = target.current.gust;
      }
      if (target.current.precipitation)
        visibleKind = target.current.precipitation;
      paint(0, performance.now());
      if (
        !(motionOverride.current ?? reducedMotion.matches) &&
        (density > 0 || target.current.particleDensity > 0)
      )
        frame = window.requestAnimationFrame(animate);
    };
    wake.current = sync;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.round(bounds.width);
      height = Math.round(bounds.height);
      if (!width || !height) return;
      const scale = Math.min(
        window.devicePixelRatio || 1,
        1.25,
        Math.sqrt(900_000 / (width * height)),
      );
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      particles = Array.from({ length: 240 }, () => particle());
      sync();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    resize();

    return () => {
      stop();
      wake.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="scene-weather" aria-hidden="true" />
  );
}
