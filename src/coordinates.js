// SPDX-License-Identifier: MIT
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function viewport(vw, vh, w, h, fit = 'contain') {
  if (![vw, vh, w, h].every(v => Number.isFinite(v) && v > 0)) return null;
  const scale = (fit === 'cover' ? Math.max : Math.min)(w / vw, h / vh);
  const width = vw * scale, height = vh * scale;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}
export function cameraCrop(vw, vh, w, h, fit = 'cover') {
  const rect = viewport(vw, vh, w, h, fit);
  if (!rect) return null;
  return { x: Math.max(0, -rect.x / rect.width * vw), y: Math.max(0, -rect.y / rect.height * vh), width: Math.min(vw, w / rect.width * vw), height: Math.min(vh, h / rect.height * vh) };
}
export function mapPose(frame, width, height, now, fit = 'contain', bodyMode = 'full') {
  const sourceRect = viewport(frame.width, frame.height, width, height, fit);
  if (!sourceRect) return null;
  const rect = { x: Math.max(0, sourceRect.x), y: Math.max(0, sourceRect.y), width: Math.min(width, sourceRect.width), height: Math.min(height, sourceRect.height) };
  const fresh = now - frame.capturedAt <= 200 && now >= frame.capturedAt;
  const points = {};
  for (const [name, p] of Object.entries(frame.points)) {
    const x = sourceRect.x + (1 - p.x) * sourceRect.width, y = sourceRect.y + p.y * sourceRect.height;
    const inside = x >= rect.x && x <= rect.x+rect.width && y >= rect.y && y <= rect.y+rect.height;
    const usable = fresh && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    const anchor = bodyMode === 'upper' && ['left_shoulder','right_shoulder','left_elbow','right_elbow'].includes(name);
    points[name] = { x, y, score: p.score, valid: usable && (inside || anchor) && p.score >= .5,
      handValid: usable && inside && p.score >= .3 };
  }
  return { id: frame.id, capturedAt: frame.capturedAt, points, rect, sourceRect };
}
