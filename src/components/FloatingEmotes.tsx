import { useCallback, useEffect, useRef, useState } from "react";
import { fetch7TVGlobalEmotes } from "../lib/emotes/7tv";
import type { EmoteMap } from "../lib/emotes/types";
import "../styles/FloatingEmotes.css";

const MAX_EMOTES = 30;
const MOUSE_RADIUS = 160;
const MOUSE_REPEL_STRENGTH = 2.2;
const SPEED_MIN = 0.35;
const SPEED_MAX = 0.65;
const MAX_SPEED = 4.5;
const COLLISION_PUSH = 0.5;

interface EmoteState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  baseOpacity: number;
}

interface EmoteItem {
  url: string;
  name: string;
  state: EmoteState;
  img: HTMLImageElement | null;
}

function pickTopEmotes(emotes: EmoteMap, count: number) {
  const entries = Object.entries(emotes);
  if (entries.length === 0) return [];

  const selected = entries.slice(0, count);

  return selected.map(([name, rawUrl]) => {
    const url = rawUrl.startsWith("ZW:") ? rawUrl.slice(3) : rawUrl;
    const angle = Math.random() * Math.PI * 2;
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    return {
      url,
      name,
      x: 10 + Math.random() * 80,
      y: 10 + Math.random() * 80,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 28 + Math.random() * 32,
      rotation: Math.random() * 360,
      baseOpacity: 0.06 + Math.random() * 0.07,
    };
  });
}

export default function FloatingEmotes() {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<EmoteItem[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef(0);
  const [images, setImages] = useState<{ url: string; name: string }[]>([]);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    fetch7TVGlobalEmotes().then((emotes) => {
      const picked = pickTopEmotes(emotes, MAX_EMOTES);
      itemsRef.current = picked.map((s) => ({
        url: s.url,
        name: s.name,
        state: {
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          size: s.size,
          rotation: s.rotation,
          baseOpacity: s.baseOpacity,
        },
        img: null,
      }));
      setImages(picked.map(({ url, name }) => ({ url, name })));
    });

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const animate = useCallback(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion.current) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const mouse = mouseRef.current;
    const rect = container.getBoundingClientRect();
    const mouseX = mouse.x - rect.left;
    const mouseY = mouse.y - rect.top;
    const mouseInBounds =
      mouseX >= 0 && mouseX <= w && mouseY >= 0 && mouseY <= h;

    const items = itemsRef.current;
    const n = items.length;

    for (let i = 0; i < n; i++) {
      const s = items[i].state;

      let px = (s.x / 100) * w;
      let py = (s.y / 100) * h;

      const dx = px - mouseX;
      const dy = py - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let scale = 1;
      let opacity = s.baseOpacity;
      let blur = 0.6;

      if (mouseInBounds && dist < MOUSE_RADIUS) {
        const t = 1 - dist / MOUSE_RADIUS;
        const force = t * t * MOUSE_REPEL_STRENGTH;
        const nx = dist > 0.01 ? dx / dist : 0;
        const ny = dist > 0.01 ? dy / dist : 0;

        s.vx += nx * force;
        s.vy += ny * force;
        s.rotation += (Math.random() - 0.5) * t * 8;

        scale = 1 + t * 2;
        opacity = s.baseOpacity + t * 0.45;
        blur = 0.6 * (1 - t);
      }

      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (speed > MAX_SPEED) {
        s.vx = (s.vx / speed) * MAX_SPEED;
        s.vy = (s.vy / speed) * MAX_SPEED;
      } else if (!mouseInBounds && speed > SPEED_MAX) {
        s.vx *= 0.98;
        s.vy *= 0.98;
      } else if (speed < SPEED_MIN * 0.5 && !mouseInBounds) {
        const boost = (SPEED_MIN * 0.6) / speed;
        s.vx *= boost;
        s.vy *= boost;
      }

      px += s.vx;
      py += s.vy;
      s.rotation += s.vx * 0.6;

      const halfSize = (s.size * scale) / 2;
      let bounced = false;
      if (px < halfSize) {
        px = halfSize;
        s.vx = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
        bounced = true;
      } else if (px > w - halfSize) {
        px = w - halfSize;
        s.vx = -(SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN));
        bounced = true;
      }
      if (py < halfSize) {
        py = halfSize;
        s.vy = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
        bounced = true;
      } else if (py > h - halfSize) {
        py = h - halfSize;
        s.vy = -(SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN));
        bounced = true;
      }

      if (bounced) {
        s.rotation += (Math.random() - 0.5) * 15;
      }

      // Store pixel positions for collision pass
      (s as any)._px = px;
      (s as any)._py = py;
      (s as any)._scale = scale;
      (s as any)._opacity = opacity;
      (s as any)._blur = blur;
    }

    // Pairwise collision
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const sa = items[a].state;
        const sb = items[b].state;
        const ax = (sa as any)._px;
        const ay = (sa as any)._py;
        const bx = (sb as any)._px;
        const by = (sb as any)._py;
        const ra = (sa.size * (sa as any)._scale) / 2;
        const rb = (sb.size * (sb as any)._scale) / 2;
        const minDist = ra + rb;

        const cdx = bx - ax;
        const cdy = by - ay;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);

        if (cdist < minDist && cdist > 0.01) {
          const overlap = minDist - cdist;
          const nx = cdx / cdist;
          const ny = cdy / cdist;

          (sa as any)._px -= nx * overlap * 0.5;
          (sa as any)._py -= ny * overlap * 0.5;
          (sb as any)._px += nx * overlap * 0.5;
          (sb as any)._py += ny * overlap * 0.5;

          sa.vx -= nx * COLLISION_PUSH;
          sa.vy -= ny * COLLISION_PUSH;
          sb.vx += nx * COLLISION_PUSH;
          sb.vy += ny * COLLISION_PUSH;
        }
      }
    }

    // Write to DOM
    for (let i = 0; i < n; i++) {
      const item = items[i];
      const s = item.state;
      const img = item.img;
      if (!img) continue;

      const px = (s as any)._px;
      const py = (s as any)._py;

      // Clamp to bounds after collision adjustments
      const halfSize = (s.size * (s as any)._scale) / 2;
      const clampedX = Math.max(halfSize, Math.min(w - halfSize, px));
      const clampedY = Math.max(halfSize, Math.min(h - halfSize, py));

      s.x = (clampedX / w) * 100;
      s.y = (clampedY / h) * 100;

      img.style.left = `${s.x}%`;
      img.style.top = `${s.y}%`;
      img.style.width = `${s.size}px`;
      img.style.height = `${s.size}px`;
      img.style.transform = `translate(-50%, -50%) rotate(${s.rotation}deg) scale(${(s as any)._scale})`;
      img.style.opacity = String((s as any)._opacity);
      img.style.filter = `blur(${(s as any)._blur}px)`;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (images.length > 0 && !prefersReducedMotion.current) {
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [images, animate]);

  if (images.length === 0) return null;

  return (
    <div ref={containerRef} className="floating-emotes" aria-hidden="true">
      {images.map(({ url, name }, i) => (
        <img
          key={name}
          ref={(el) => {
            if (itemsRef.current[i]) itemsRef.current[i].img = el;
          }}
          src={url}
          alt=""
          className="floating-emote"
        />
      ))}
    </div>
  );
}
