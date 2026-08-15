import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";

export function ImagePreviewDialog({
  images,
  index,
  onIndexChange,
  title,
  previousLabel,
  nextLabel,
}: {
  images: Array<{ src: string }>;
  index: number | null;
  onIndexChange: (index: number | null) => void;
  title: string;
  previousLabel: string;
  nextLabel: string;
}) {
  const image = index !== null ? images[index] ?? null : null;
  const indexRef = useRef(index);
  const imagesRef = useRef(images);
  indexRef.current = index;
  imagesRef.current = images;

  useEffect(() => {
    if (index !== null && !images[index]) {
      onIndexChange(null);
    }
  }, [images, index, onIndexChange]);

  useEffect(() => {
    if (index === null) return;
    function handlePreviewKeyDown(event: KeyboardEvent) {
      const current = indexRef.current;
      const currentImages = imagesRef.current;
      if (current === null || !currentImages.length) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange((current - 1 + currentImages.length) % currentImages.length);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange((current + 1) % currentImages.length);
      }
    }
    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [index === null, onIndexChange]);

  return (
    <DialogPrimitive.Root open={index !== null} onOpenChange={(open) => { if (!open) onIndexChange(null); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onClick={() => onIndexChange(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.stopPropagation();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-200"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {image ? (
            <img
              src={image.src}
              alt={title}
              className="block max-h-[85vh] w-auto max-w-[calc(100vw-7rem)] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
          {images.length > 1 ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                aria-label={previousLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onIndexChange(index === null ? index : (index - 1 + images.length) % images.length);
                }}
              >
                <ChevronLeftIcon data-icon="inline-start" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                aria-label={nextLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onIndexChange(index === null ? index : (index + 1) % images.length);
                }}
              >
                <ChevronRightIcon data-icon="inline-start" />
              </Button>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
