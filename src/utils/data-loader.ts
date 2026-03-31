/**
 * Loads stars.bin (MAGIC + VERSION + count + positions + colors + magnitudes)
 */

export type StarBuffers = {
  count: number;
  positions: Float32Array;
  colors: Uint8Array;
  magnitudes: Float32Array;
};

const EXPECTED_MAGIC = 0x59485441; // 'ATHY' LE
const EXPECTED_VERSION = 1;

export async function loadStarBinary(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<StarBuffers> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      if (total > 0) onProgress?.(loaded, total);
    }
  }

  let offset = 0;
  const full = new Uint8Array(loaded);
  for (const c of chunks) {
    full.set(c, offset);
    offset += c.length;
  }

  const view = new DataView(full.buffer, full.byteOffset, full.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const count = view.getUint32(8, true);

  if (magic !== EXPECTED_MAGIC) {
    throw new Error(`Invalid stars.bin magic: 0x${magic.toString(16)}`);
  }
  if (version !== EXPECTED_VERSION) {
    throw new Error(`Unsupported stars.bin version: ${version}`);
  }

  const headerBytes = 12;
  const posBytes = count * 3 * 4;
  const colBytes = count * 3;
  const magBytes = count * 4;
  const expected = headerBytes + posBytes + colBytes + magBytes;
  if (full.byteLength < expected) {
    throw new Error(
      `Truncated stars.bin: need ${expected} bytes, got ${full.byteLength}`,
    );
  }

  const posOffset = headerBytes;
  const colOffset = posOffset + posBytes;
  const magOffset = colOffset + colBytes;

  const positions = new Float32Array(
    full.buffer,
    full.byteOffset + posOffset,
    count * 3,
  );
  const colors = new Uint8Array(
    full.buffer,
    full.byteOffset + colOffset,
    count * 3,
  );
  // `3*count` color bytes may leave the next offset not 4-byte aligned; Float32Array
  // views require a multiple-of-4 byte offset. Copy when needed.
  const magnitudes = float32ArrayFromBytes(
    full,
    magOffset,
    count,
  );

  return { count, positions, colors, magnitudes };
}

/** Build Float32Array from little-endian bytes at `byteOffset`, copying if misaligned. */
function float32ArrayFromBytes(
  full: Uint8Array,
  byteOffset: number,
  floatCount: number,
): Float32Array {
  const byteLen = floatCount * 4;
  const base = full.byteOffset + byteOffset;
  if (base % 4 === 0 && byteOffset + byteLen <= full.byteLength) {
    return new Float32Array(full.buffer, base, floatCount);
  }
  const tmp = new Uint8Array(byteLen);
  tmp.set(full.subarray(byteOffset, byteOffset + byteLen));
  return new Float32Array(tmp.buffer, 0, floatCount);
}

export type NamedStarsPayload = {
  count: number;
  named: Array<{
    id: number;
    name: string;
    x: number;
    y: number;
    z: number;
    mag: number;
    dist: number;
    spect: string;
  }>;
};

export async function loadNamedStars(url: string): Promise<NamedStarsPayload> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<NamedStarsPayload>;
}
