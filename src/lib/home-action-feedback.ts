/** Feedback starts on press, without intercepting or delaying link navigation. */
export function animateHomeAction(element: HTMLElement, x?: number, y?: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ripple = element.querySelector<HTMLElement>(".home-action-ripple");
  if (!ripple?.animate) return;
  const rect = element.getBoundingClientRect();
  ripple.style.left = `${x === undefined ? rect.width / 2 : x - rect.left}px`;
  ripple.style.top = `${y === undefined ? rect.height / 2 : y - rect.top}px`;
  ripple.getAnimations().forEach(animation => animation.cancel());
  ripple.animate([
    { transform: "translate(-50%, -50%) scale(0)", opacity: 0.4 },
    { transform: `translate(-50%, -50%) scale(${Math.hypot(rect.width, rect.height) / 12})`, opacity: 0 },
  ], { duration: 450, easing: "ease-out" });
}
