export type PackedVector = { s: number; q: string };

export function normalize(v: ArrayLike<number>): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Symmetric int8 quantization with a per-vector scale: one byte per dimension
// with negligible cosine error, small enough to send on every chat turn.
export function packVector(v: ArrayLike<number>): PackedVector {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]));
  const s = max / 127 || 1;
  const bytes = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) bytes[i] = Math.round(v[i] / s);
  return { s, q: toBase64(new Uint8Array(bytes.buffer)) };
}

export function unpackVector(p: PackedVector): Float32Array {
  const raw = fromBase64(p.q);
  const bytes = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] * p.s;
  return normalize(out);
}
