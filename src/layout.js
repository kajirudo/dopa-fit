// SPDX-License-Identifier: MIT
export function mascotBox(width, height, hudBottom = 72) {
  if (height < 480) return null;
  const size = Math.min(64,width*.14);
  return { x:8,y:hudBottom+8,width:size,height:size };
}
export function overlapsTarget(box, target, margin = 12) {
  const x=Math.max(box.x,Math.min(box.x+box.width,target.x)), y=Math.max(box.y,Math.min(box.y+box.height,target.y));
  return Math.hypot(x-target.x,y-target.y)<target.radius+margin;
}
