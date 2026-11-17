export const museumHorizontalScale = 9 / 8;
export const museumDetailStep = 1 / 64;

export function museumDetailAxis(center: number, size: number, scale: number) {
  const rounded = (edge: number) => Math.round(edge * scale / museumDetailStep);
  const lower = rounded(center - size / 2);
  const upper = Math.max(lower + 1, rounded(center + size / 2));
  const localStep = museumDetailStep / scale;
  return { center: (lower + upper) * localStep / 2, size: (upper - lower) * localStep };
}
