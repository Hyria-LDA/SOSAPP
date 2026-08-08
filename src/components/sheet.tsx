import { X } from "lucide-react";
import { useEffect, useState } from "react";

type VisualViewportRect = {
  height: number;
  offsetTop: number;
};

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [viewport, setViewport] = useState<VisualViewportRect | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const syncViewport = () => {
      const visualViewport = window.visualViewport;
      setViewport({
        height: visualViewport?.height ?? window.innerHeight,
        offsetTop: visualViewport?.offsetTop ?? 0,
      });
    };

    syncViewport();
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 z-50 flex flex-col justify-end bg-foreground/40"
      style={
        viewport
          ? { top: viewport.offsetTop, height: viewport.height }
          : { top: 0, bottom: 0 }
      }
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[min(42rem,92dvh)] max-h-full flex-col overflow-hidden rounded-t-3xl bg-background pt-2 shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-base font-black">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
