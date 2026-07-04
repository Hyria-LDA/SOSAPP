import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo-sos-marceneiros-v3.png";

export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const height = {
    sm: "h-52",
    md: "h-72",
    lg: "h-96",
  }[size];

  return (
    <img
      src={logoUrl}
      alt="SOS Marceneiros"
      className={cn("w-auto object-contain", height, className)}
    />
  );
}
