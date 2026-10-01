// SPDX-License-Identifier: MIT
export const IMPACT_MS = 280;
export function impactAt(elapsed, intensity = 1, reduced = false) {
  if (elapsed < 0 || elapsed >= IMPACT_MS) return { scale: 1, flash: 0, ring: 0, alpha: 0 };
  const progress = elapsed / IMPACT_MS;
  const scale = elapsed < 75 ? 1 - .42 * Math.sin(elapsed / 75 * Math.PI / 2) : 1 - .42 * ((IMPACT_MS - elapsed) / (IMPACT_MS - 75)) ** 3;
  return { scale: reduced ? 1 : scale, flash: reduced ? 0 : Math.max(0, 1 - elapsed / 80) * .9, ring: (1 - (1 - progress) ** 3) * Math.max(1, Math.min(1.35, intensity)), alpha: (1 - progress) ** 1.5 };
}
