/**
 * Fetches NASA Exoplanet Archive `ps` rows (default solutions with semi-major axis),
 * matches hosts to AT-HYG named stars by Cartesian position (pc), writes
 * public/data/exoplanets.json for the web app.
 *
 * Run after named-stars.json exists: npm run prepare-exoplanets
 * (also invoked from npm run prepare-data.)
 */

import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const NAMED_PATH = join(ROOT, "public", "data", "named-stars.json");
const OUT_PATH = join(ROOT, "public", "data", "exoplanets.json");

/** Max catalog distance (pc) between AT-HYG star and NASA host position. */
const MATCH_PC = 0.18;

const NASA_TAP =
  "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=" +
  encodeURIComponent(
    "SELECT hostname, pl_name, pl_letter, pl_orbsmax, x, y, z, sy_dist FROM ps WHERE default_flag=1 AND pl_orbsmax IS NOT NULL",
  ) +
  "&format=json";

type NamedStar = {
  name: string;
  x: number;
  y: number;
  z: number;
};

type NamedPayload = { named: NamedStar[] };

type NasaRow = {
  hostname: string;
  pl_name: string;
  pl_letter: string | null;
  pl_orbsmax: number;
  x: number;
  y: number;
  z: number;
  sy_dist: number;
};

type ExoplanetJsonPlanet = {
  name: string;
  semiMajorAxisAU: number;
  color: string;
};

type ExoplanetsJson = {
  matchPc: number;
  /** Planet lists keyed by exact AT-HYG proper / Bayer name. */
  byName: Record<string, ExoplanetJsonPlanet[]>;
};

const SOL_DEFS: ExoplanetJsonPlanet[] = [
  { name: "Mercury", semiMajorAxisAU: 0.387, color: "#b0b0b0" },
  { name: "Venus", semiMajorAxisAU: 0.723, color: "#e8c868" },
  { name: "Earth", semiMajorAxisAU: 1.0, color: "#5599dd" },
  { name: "Mars", semiMajorAxisAU: 1.524, color: "#cc5533" },
  { name: "Jupiter", semiMajorAxisAU: 5.203, color: "#c8a050" },
  { name: "Saturn", semiMajorAxisAU: 9.537, color: "#d8c078" },
  { name: "Uranus", semiMajorAxisAU: 19.191, color: "#88ccdd" },
  { name: "Neptune", semiMajorAxisAU: 30.069, color: "#4466cc" },
];

function distPc(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function hostPositionPc(row: NasaRow): { x: number; y: number; z: number } {
  const d = row.sy_dist;
  return { x: row.x * d, y: row.y * d, z: row.z * d };
}

/** Stable pseudo-HSL-ish hex from a string. */
function colorForKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  const hue = (h >>> 0) % 360;
  const sat = 45 + ((h >>> 8) % 25);
  const light = 58 + ((h >>> 16) % 12);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function shortPlanetLabel(plName: string, plLetter: string | null): string {
  const t = plName.trim();
  if (plLetter && plLetter.length > 0) {
    const letter = plLetter.trim();
    if (t.endsWith(letter)) return letter;
  }
  const parts = t.split(/\s+/);
  return parts[parts.length - 1] ?? t;
}

async function main(): Promise<void> {
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  const namedRaw = await import("node:fs/promises").then((fs) =>
    fs.readFile(NAMED_PATH, "utf8"),
  );
  const namedPayload = JSON.parse(namedRaw) as NamedPayload;

  console.log("Fetching NASA Exoplanet Archive (ps)…");
  const res = await fetch(NASA_TAP);
  if (!res.ok) {
    throw new Error(`NASA TAP failed: ${res.status} ${await res.text()}`);
  }
  const nasaRows = (await res.json()) as NasaRow[];

  /** hostname -> deduped rows by pl_name */
  const byHostname = new Map<string, NasaRow[]>();
  const seenName = new Map<string, Set<string>>();

  for (const row of nasaRows) {
    const host = row.hostname;
    if (!byHostname.has(host)) {
      byHostname.set(host, []);
      seenName.set(host, new Set());
    }
    const pl = row.pl_name.trim();
    const seen = seenName.get(host)!;
    if (seen.has(pl)) continue;
    seen.add(pl);
    byHostname.get(host)!.push(row);
  }

  type HostInfo = {
    hostname: string;
    pos: { x: number; y: number; z: number };
    planets: NasaRow[];
  };

  const hosts: HostInfo[] = [];
  for (const [hostname, rows] of byHostname) {
    if (rows.length === 0) continue;
    const pos = hostPositionPc(rows[0]);
    rows.sort((a, b) => a.pl_orbsmax - b.pl_orbsmax);
    hosts.push({ hostname, pos, planets: rows });
  }

  const byName: Record<string, ExoplanetJsonPlanet[]> = {};
  byName.Sol = [...SOL_DEFS];

  for (const star of namedPayload.named) {
    if (star.name === "Sol") continue;

    let best: HostInfo | null = null;
    let bestD = Infinity;
    for (const h of hosts) {
      const d = distPc(star, h.pos);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }

    if (best && bestD <= MATCH_PC) {
      byName[star.name] = best.planets.map((row) => ({
        name: shortPlanetLabel(row.pl_name, row.pl_letter),
        semiMajorAxisAU: row.pl_orbsmax,
        color: colorForKey(`${best.hostname}/${row.pl_name}`),
      }));
    }
  }

  const out: ExoplanetsJson = {
    matchPc: MATCH_PC,
    byName,
  };

  await writeFile(OUT_PATH, JSON.stringify(out), "utf8");
  const n = Object.keys(byName).length;
  console.log(
    `Wrote ${OUT_PATH} (${n} stars with planet data, including Sol)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
