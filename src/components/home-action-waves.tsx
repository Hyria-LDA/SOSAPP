import { useId } from "react";

/** Decorative curves shared by the two home actions; colors come from their CSS palette. */
export function HomeActionWaves() {
  const id = useId();
  return (
    <svg className="home-action-waves" viewBox="0 0 256 116" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-wave`} x1="0" y1="0" x2="0.8" y2="1">
          <stop stopColor="var(--action-wave-light)" stopOpacity=".2" />
          <stop offset="1" stopColor="var(--action-wave-dark)" stopOpacity=".72" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="1" x2="1" y2="0">
          <stop stopColor="var(--action-glow)" stopOpacity="0" />
          <stop offset=".6" stopColor="var(--action-glow)" stopOpacity=".95" />
          <stop offset="1" stopColor="var(--action-glow)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 94 C48 48 129 69 172 27 C192 8 205 -8 232 -5 L256 0 L256 116 L0 116Z" fill={`url(#${id}-wave)`} />
      <path d="M78 116 C143 113 154 96 181 72 C208 49 229 62 256 40 L256 116Z" fill="var(--action-wave-dark)" opacity=".19" />
      <path d="M84 116 C146 115 157 92 184 72 C211 52 232 62 256 40" fill="none" stroke={`url(#${id}-edge)`} strokeWidth="1.4" />
      <path d="M133 116 C190 83 208 103 256 76 L256 116Z" fill="var(--action-wave-light)" opacity=".11" />
      <path d="M0 1 H256" stroke="var(--action-glow)" strokeOpacity=".65" strokeWidth="2" />
    </svg>
  );
}
