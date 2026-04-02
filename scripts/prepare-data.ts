/**
 * Downloads AT-HYG v3.3 CSV.gz parts from Codeberg, parses rows,
 * writes compact binary + named-stars.json for the web app.
 *
 * Run: npm run prepare-data
 */

import { createWriteStream, mkdirSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { parse } from "csv-parse";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bvToRgbBytes } from "../src/utils/color.ts";
import { conToGenitive } from "./constellation-genitive.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "data");

const PART1 =
  "https://codeberg.org/astronexus/athyg/raw/branch/main/data/athyg_v33-1.csv.gz";
const PART2 =
  "https://codeberg.org/astronexus/athyg/raw/branch/main/data/athyg_v33-2.csv.gz";

/** Git LFS batch API — raw URLs return pointers, not binary */
const LFS_BATCH =
  "https://codeberg.org/astronexus/athyg.git/info/lfs/objects/batch";

const MAGIC = 0x59485441; // 'ATHY' little-endian
const VERSION = 1;
/** Upper bound — catalog ~2.55M; leave headroom */
const MAX_STARS = 3_000_000;

type NamedStar = {
  id: number;
  name: string;
  /** Extra searchable labels (e.g. Bayer designation when `name` is a proper name). */
  aliases?: string[];
  x: number;
  y: number;
  z: number;
  mag: number;
  dist: number;
  spect: string;
};

function parseNum(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isDuplicateHeaderRow(record: Record<string, string>): boolean {
  return (
    record.id === "id" ||
    (record.proper === "proper" && record.ra === "ra")
  );
}

type LfsBatchResponse = {
  objects: Array<{
    oid: string;
    actions?: { download?: { href: string } };
    error?: { message: string };
  }>;
};

async function lfsDownloadHref(oid: string, size: number): Promise<string> {
  const res = await fetch(LFS_BATCH, {
    method: "POST",
    headers: {
      Accept: "application/vnd.git-lfs+json",
      "Content-Type": "application/vnd.git-lfs+json",
    },
    body: JSON.stringify({
      operation: "download",
      transfers: ["basic"],
      objects: [{ oid, size }],
    }),
  });
  if (!res.ok) {
    throw new Error(`LFS batch failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as LfsBatchResponse;
  const href = json.objects[0]?.actions?.download?.href;
  const err = json.objects[0]?.error?.message;
  if (!href) {
    throw new Error(`LFS batch missing href: ${err ?? JSON.stringify(json)}`);
  }
  return href;
}

/**
 * Codeberg "raw" URLs for large files are Git LFS pointers. Resolve to gzip bytes stream.
 */
async function openGzipStreamFromRawUrl(rawUrl: string): Promise<Readable> {
  const res = await fetch(rawUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${rawUrl}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return Readable.from(buf);
  }

  const text = buf.toString("utf8");
  if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
    const oid = text.match(/oid sha256:([a-f0-9]+)/)?.[1];
    const sizeStr = text.match(/size (\d+)/)?.[1];
    if (!oid || !sizeStr) {
      throw new Error(`Invalid LFS pointer from ${rawUrl}`);
    }
    const size = Number(sizeStr);
    const href = await lfsDownloadHref(oid, size);
    const fileRes = await fetch(href);
    if (!fileRes.ok || !fileRes.body) {
      throw new Error(`LFS object fetch failed: ${fileRes.status}`);
    }
    return Readable.fromWeb(fileRes.body as import("stream/web").ReadableStream);
  }

  throw new Error(
    `Unexpected response from ${rawUrl}: not gzip and not LFS pointer`,
  );
}

/**
 * Part 1 includes a header row. Part 2 is a continuation with **no** header — the
 * first line is star data. `columns: true` on part 2 would wrongly treat that row as
 * column names; use the same column list as part 1 instead.
 */
async function streamCsvRows(
  rawUrl: string,
  onRow: (row: Record<string, string>, isHeaderDuplicate: boolean) => void,
  options: { columns: true } | { columns: string[] },
): Promise<void> {
  const nodeReadable = await openGzipStreamFromRawUrl(rawUrl);
  const gunzip = createGunzip();
  const parser = parse({
    ...("columns" in options && Array.isArray(options.columns)
      ? { columns: options.columns }
      : { columns: true }),
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });

  const stream = nodeReadable.pipe(gunzip).pipe(parser);
  for await (const record of stream as AsyncIterable<Record<string, string>>) {
    onRow(record, isDuplicateHeaderRow(record));
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const positions = new Float32Array(MAX_STARS * 3);
  const colors = new Uint8Array(MAX_STARS * 3);
  const magnitudes = new Float32Array(MAX_STARS);
  const named: NamedStar[] = [];

  let index = 0;
  let columnNames: string[] | null = null;
  /** Count rows sharing identical (x0,y0,z0) so we can separate them visually. */
  const positionDupCounts = new Map<string, number>();

  function processRow(row: Record<string, string>, dupHeader: boolean): void {
    if (!columnNames) {
      columnNames = Object.keys(row);
    }
    if (dupHeader) return;

    const x0 = parseNum(row.x0);
    const y0 = parseNum(row.y0);
    const z0 = parseNum(row.z0);
    const mag = parseNum(row.mag);
    if (x0 == null || y0 == null || z0 == null || mag == null) return;

    const posKey = `${x0.toFixed(9)},${y0.toFixed(9)},${z0.toFixed(9)}`;
    const dupIdx = positionDupCounts.get(posKey) ?? 0;
    positionDupCounts.set(posKey, dupIdx + 1);

    /**
     * AT-HYG often gives binary components the same barycentric xyz (angular separation is
     * below parsec precision). Without a nudge, two Points overlap and read as one star.
     */
    let x = x0;
    let y = y0;
    let z = z0;
    if (dupIdx > 0) {
      const sepPc = 4e-4; // ~82 AU — order of magnitude for Alpha Cen A/B
      const theta = dupIdx * 2.39996322972865332;
      const radius = sepPc * dupIdx;
      x = x0 + radius * Math.cos(theta);
      y = y0 + radius * Math.sin(theta);
      z = z0 + sepPc * 0.35 * Math.sin(dupIdx * 1.618);
    }

    const ci = parseNum(row.ci);
    const [r, g, b] = bvToRgbBytes(ci ?? undefined);

    const i = index * 3;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    colors[i] = r;
    colors[i + 1] = g;
    colors[i + 2] = b;
    magnitudes[index] = mag;

    const proper = (row.proper ?? "").trim();
    const bayer = (row.bayer ?? "").trim();
    const con = (row.con ?? "").trim();
    const genitive = con ? conToGenitive(con) : undefined;
    const bayerDesignation =
      bayer.length > 0 && genitive
        ? `${bayer} ${genitive}`
        : undefined;

    const id = parseNum(row.id) ?? index;
    const dist = parseNum(row.dist) ?? 0;
    const spect = (row.spect ?? "").trim();
    const base = {
      id,
      x,
      y,
      z,
      mag,
      dist,
      spect,
    };

    if (proper.length > 0) {
      const entry: NamedStar = { ...base, name: proper };
      if (
        bayerDesignation &&
        bayerDesignation.toLowerCase() !== proper.toLowerCase()
      ) {
        entry.aliases = [bayerDesignation];
      }
      named.push(entry);
    } else if (bayerDesignation) {
      named.push({ ...base, name: bayerDesignation });
    }

    index += 1;
    if (index > MAX_STARS) {
      throw new Error(`Star count exceeds MAX_STARS (${MAX_STARS})`);
    }
  }

  console.log("Downloading and parsing part 1...");
  await streamCsvRows(PART1, processRow, { columns: true });

  // TypeScript does not infer mutation of `columnNames` from `processRow` callbacks
  const colsForPart2 = columnNames ?? [];
  if (colsForPart2.length === 0) {
    throw new Error("No column names from part 1 — CSV may be empty");
  }

  console.log("Downloading and parsing part 2...");
  await streamCsvRows(PART2, processRow, { columns: colsForPart2 });

  const count = index;
  console.log(`Total stars: ${count}`);
  const posOut = positions.subarray(0, count * 3);
  const colOut = colors.subarray(0, count * 3);
  const magOut = magnitudes.subarray(0, count);

  const binPath = join(OUT_DIR, "stars.bin");
  const ws = createWriteStream(binPath);
  const header = Buffer.allocUnsafe(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(VERSION, 4);
  header.writeUInt32LE(count, 8);

  await new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.write(header, (err) => {
      if (err) return reject(err);
      ws.write(Buffer.from(posOut.buffer, posOut.byteOffset, posOut.byteLength), (e2) => {
        if (e2) return reject(e2);
        ws.write(Buffer.from(colOut.buffer, colOut.byteOffset, colOut.byteLength), (e3) => {
          if (e3) return reject(e3);
          ws.write(Buffer.from(magOut.buffer, magOut.byteOffset, magOut.byteLength), (e4) => {
            if (e4) return reject(e4);
            ws.end();
          });
        });
      });
    });
    ws.on("finish", () => resolve());
  });

  const jsonPath = join(OUT_DIR, "named-stars.json");
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(jsonPath, JSON.stringify({ count, named }, null, 0), "utf8"),
  );

  console.log(`Wrote ${binPath} (${count} stars)`);
  console.log(`Wrote ${jsonPath} (${named.length} named stars)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
