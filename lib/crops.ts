export type Box = { x: number; y: number; w: number; h: number };

function spread(total: number, size: number, count: number): number[] {
  if (count <= 1) return [Math.max(0, (total - size) / 2)];
  const step = (total - size) / (count - 1);
  return Array.from({ length: count }, (_, i) => i * step);
}

// Multi-scale square windows (full height, 1/2 and 1/3 height) spread evenly so
// neighbours overlap. Square crops avoid the aspect distortion a fixed 224x224
// encoder would otherwise apply to wide cinematic frames.
export function cropGrid(width: number, height: number): Box[] {
  const boxes: Box[] = [{ x: 0, y: 0, w: width, h: height }];
  const short = Math.min(width, height);
  for (const div of [1, 2, 3]) {
    const side = short / div;
    const cols = Math.max(1, Math.ceil(width / side) + (div > 1 ? 1 : 0));
    const rows = Math.max(1, Math.ceil(height / side) + (div > 2 ? 1 : 0));
    for (const y of spread(height, side, rows)) {
      for (const x of spread(width, side, cols)) boxes.push({ x, y, w: side, h: side });
    }
  }
  return boxes.map((b) => ({
    x: Math.round(b.x),
    y: Math.round(b.y),
    w: Math.round(b.w),
    h: Math.round(b.h),
  }));
}
