export interface Point { x: number; y: number }
export interface Bounds extends Point { width: number; height: number }
export function fitPosition(point: Point, size: { width: number; height: number }, bounds: Bounds, snap = false, threshold = 24): Point {
  const right = Math.max(bounds.x, bounds.x + bounds.width - size.width);
  const bottom = Math.max(bounds.y, bounds.y + bounds.height - size.height);
  let x = Math.max(bounds.x, Math.min(right, point.x)), y = Math.max(bounds.y, Math.min(bottom, point.y));
  if (snap) {
    if (x - bounds.x < threshold) x = bounds.x; else if (right - x < threshold) x = right;
    if (y - bounds.y < threshold) y = bounds.y; else if (bottom - y < threshold) y = bottom;
  }
  return { x, y };
}
