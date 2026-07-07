import { useEffect, useRef, useState } from "react";
import "../styles/ThemeCarousel.css";

export interface CarouselSlide {
  src: string;
  alt: string;
  caption?: string;
  captionSub?: string;
  captionAccent?: string;
  objectFit?: "cover" | "contain";
  objectPosition?: string;
  aspectRatio?: string;
}

interface ThemeCarouselProps {
  slides: CarouselSlide[];
  badge?: string;
  autoplayMs?: number;
}

export default function ThemeCarousel({
  slides,
  badge,
  autoplayMs = 5500,
}: ThemeCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);

  const goTo = (next: number, dir: 1 | -1) => {
    setDirection(dir);
    setIndex(((next % slides.length) + slides.length) % slides.length);
  };

  const next = () => goTo(index + 1, 1);
  const prev = () => goTo(index - 1, -1);

  useEffect(() => {
    if (paused || autoplayMs <= 0) return;
    const id = window.setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % slides.length);
    }, autoplayMs);
    return () => window.clearInterval(id);
  }, [paused, autoplayMs, slides.length]);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    const onTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      deltaX.current = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startX.current === null) return;
      deltaX.current = e.touches[0].clientX - startX.current;
    };
    const onTouchEnd = () => {
      if (Math.abs(deltaX.current) > 40) {
        if (deltaX.current < 0) next();
        else prev();
      }
      startX.current = null;
      deltaX.current = 0;
    };
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    node.addEventListener("touchend", onTouchEnd);
    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
    };
  });

  const slide = slides[index];

  return (
    <div
      className="theme-carousel"
      style={
        slide.captionAccent
          ? ({
              "--carousel-accent": slide.captionAccent,
            } as React.CSSProperties)
          : undefined
      }
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {badge && <span className="theme-carousel-badge">{badge}</span>}

      <div
        className="theme-carousel-viewport"
        ref={trackRef}
        aria-roledescription="carousel"
        aria-label="Theme previews"
        style={
          slide.aspectRatio ? { aspectRatio: slide.aspectRatio } : undefined
        }
      >
        <button
          type="button"
          className="theme-carousel-arrow theme-carousel-arrow--prev"
          onClick={prev}
          aria-label="Previous theme"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          className={`theme-carousel-slide theme-carousel-slide--enter-${direction === 1 ? "next" : "prev"}`}
          key={index}
        >
          <img
            src={slide.src}
            alt={slide.alt}
            className="theme-carousel-image"
            loading="lazy"
            draggable={false}
            style={{
              objectFit: slide.objectFit ?? "cover",
              objectPosition: slide.objectPosition ?? "top center",
            }}
          />
          {slide.caption && (
            <div className="theme-carousel-caption">
              <span className="theme-carousel-caption-dot" aria-hidden="true" />
              <div className="theme-carousel-caption-text">
                <strong>{slide.caption}</strong>
                {slide.captionSub && <em>{slide.captionSub}</em>}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="theme-carousel-arrow theme-carousel-arrow--next"
          onClick={next}
          aria-label="Next theme"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="theme-carousel-foot">
        <div className="theme-carousel-dots" role="tablist">
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to ${s.caption ?? `slide ${i + 1}`}`}
              className={`theme-carousel-dot ${
                i === index ? "theme-carousel-dot--active" : ""
              }`}
              onClick={() => goTo(i, i > index ? 1 : -1)}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="theme-carousel-count">
          <span className="theme-carousel-count-current">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="theme-carousel-count-sep" />
          <span className="theme-carousel-count-total">
            {String(slides.length).padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}
