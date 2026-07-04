import { X } from "lucide-react";

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40"
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl bg-background pt-2 shadow-pop"
        onClick={(e) => e.stopPropagation()}
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
        {children}
      </div>
    </div>
  );
}
