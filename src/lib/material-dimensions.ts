function formatCm(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, "");
}

export function formatDimensions(comprimentoCm: unknown, larguraCm: unknown) {
  return `${formatCm(comprimentoCm)}x${formatCm(larguraCm)}cm`;
}
