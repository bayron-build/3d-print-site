"use client";

import { useCallback, useEffect, useState } from "react";
import { CubeLogo } from "@/components/site-header";
import { IconClose } from "@/components/ui/icons";
import { productPhotoUrl } from "@/lib/products/photos";

// Product gallery: a large image the customer can click to open full screen,
// thumbnails that swap the large image, and a lightbox with prev/next,
// keyboard control and click-to-zoom. One photo means no thumbnails and no
// arrows, but the image still opens full screen. No photos falls back to the
// cube placeholder, exactly as before.
export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const count = photos.length;
  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count]
  );

  // Arrow keys cycle, Escape closes. Bound to the document so the overlay
  // works without holding focus on a particular element.
  useEffect(() => {
    if (!lightbox) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(false);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    }
    document.addEventListener("keydown", onKeyDown);
    // Stop the page behind the overlay from scrolling along.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [lightbox, step]);

  if (count === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <CubeLogo className="h-16 w-16 text-slate-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="group relative aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label="Foto vergroten"
          className="block h-full w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={productPhotoUrl(photos[index])}
            alt={alt}
            className="h-full w-full object-cover"
          />
        </button>
        {count > 1 && (
          <>
            <ArrowButton side="left" onClick={() => step(-1)} />
            <ArrowButton side="right" onClick={() => step(1)} />
            <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-white">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {photos.map((path, i) => (
            <button
              key={path}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Foto ${i + 1} bekijken`}
              aria-current={i === index}
              className={`overflow-hidden rounded-lg border transition-colors ${
                i === index
                  ? "border-violet-600 ring-1 ring-violet-600"
                  : "border-slate-200 hover:border-violet-400"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productPhotoUrl(path)}
                alt=""
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {lightbox && (
        // Remounting per photo resets the zoom, so each photo opens framed —
        // including after a keyboard arrow, which changes index from here.
        <Lightbox
          key={index}
          photos={photos}
          index={index}
          alt={alt}
          onClose={() => setLightbox(false)}
          onStep={step}
        />
      )}
    </div>
  );
}

function ArrowButton({
  side,
  onClick,
  variant = "light",
}: {
  side: "left" | "right";
  onClick: () => void;
  variant?: "light" | "dark";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Vorige foto" : "Volgende foto"}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full p-2 transition-colors ${
        side === "left" ? "left-2" : "right-2"
      } ${
        variant === "light"
          ? "bg-white/85 text-slate-900 shadow hover:bg-white"
          : "bg-white/15 text-white hover:bg-white/30"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path d={side === "left" ? "M15 5 8 12l7 7" : "m9 5 7 7-7 7"} />
      </svg>
    </button>
  );
}

// Full-screen viewer. Clicking the photo toggles a 2x zoom that pans by
// scrolling; clicking the backdrop (but not the photo) closes.
function Lightbox({
  photos,
  index,
  alt,
  onClose,
  onStep,
}: {
  photos: string[];
  index: number;
  alt: string;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const count = photos.length;


  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Sluiten"
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white transition-colors hover:bg-white/30"
      >
        <IconClose className="h-6 w-6" />
      </button>
      {count > 1 && (
        <>
          <div onClick={(event) => event.stopPropagation()}>
            <ArrowButton side="left" variant="dark" onClick={() => onStep(-1)} />
            <ArrowButton side="right" variant="dark" onClick={() => onStep(1)} />
          </div>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-sm text-white/80">
            {index + 1} / {count}
          </span>
        </>
      )}
      <div
        className={`max-h-full max-w-5xl ${zoomed ? "h-full w-full overflow-auto" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={productPhotoUrl(photos[index])}
          alt={alt}
          onClick={() => setZoomed((value) => !value)}
          className={
            zoomed
              ? "w-[200%] max-w-none cursor-zoom-out"
              : "max-h-[85vh] w-auto cursor-zoom-in rounded-lg object-contain"
          }
        />
      </div>
    </div>
  );
}
