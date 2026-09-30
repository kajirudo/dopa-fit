// SPDX-License-Identifier: MIT
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function viewport(vw, vh, w, h) {
  if (![vw, vh, w, h].every(v => Number.isFinite(v) && v > 0)) return null;
  const scale = Math.min(w / vw, h / vh);
  const width = vw * scale, height = vh * scale;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}
export function mapPose(frame, width, height, now) {
  const rect = viewport(frame.width, frame.height, width, height);
  if (!rect) return null;
  const fresh = now - frame.capturedAt <= 200 && now >= frame.capturedAt;
  const points = {};
  for (const [name, p] of Object.entries(frame.points)) {
    points[name] = { x: rect.x + (1 - p.x) * rect.width, y: rect.y + p.y * rect.height,
      valid: fresh && p.score >= .5 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 };
  }
  return { id: frame.id, capturedAt: frame.capturedAt, points, rect };
}
