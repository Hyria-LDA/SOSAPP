import { X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";

type VisualViewportRect = {
  height: number;
  offsetTop: number;
};

type SheetOptionButtonProps = Omit<ComponentProps<"button">, "onClick"> & {
  onSelect: () => void;
};

export function SheetOptionButton({ onSelect, ...props }: SheetOptionButtonProps) {
  const pointerStart = useRef<{
    id: number;
    x: number;
    y: number;
    moved: boolean;
    scrollElement: HTMLElement | null;
    scrollTop: number;
  } | null>(null);

  return (
    <button
      {...props}
      type={props.type ?? "button"}
      onPointerDown={(event) => {
        const scrollElement = event.currentTarget.closest<HTMLElement>("[data-sheet-scroll]");
        pointerStart.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
          scrollElement,
          scrollTop: scrollElement?.scrollTop ?? 0,
        };
        props.onPointerDown?.(event);
      }}
      onPointerMove={(event) => {
        const start = pointerStart.current;
        if (
          start &&
          start.id === event.pointerId &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
        ) {
          start.moved = true;
        }
        props.onPointerMove?.(event);
      }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        props.onPointerUp?.(event);
        const listWasScrolled =
          !!start?.scrollElement && Math.abs(start.scrollElement.scrollTop - start.scrollTop) > 2;
        if (
          !start ||
          start.id !== event.pointerId ||
          start.moved ||
          listWasScrolled ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      onPointerCancel={(event) => {
        pointerStart.current = null;
        props.onPointerCancel?.(event);
      }}
      onLostPointerCapture={(event) => {
        pointerStart.current = null;
        props.onLostPointerCapture?.(event);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail === 0) onSelect();
      }}
    />
  );
}

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
        viewport ? { top: viewport.offsetTop, height: viewport.height } : { top: 0, bottom: 0 }
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
