// Overpass API client.
//
// The public Overpass instances are a shared volunteer resource with a fair-use
// policy: identify the client, keep queries small, back off when told to, and
// never hammer a single endpoint. This module does all four.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const SEARCH_RADIUS_M = 5000;
const REQUEST_TIMEOUT_MS = 20000;
const ATTEMPTS_PER_MIRROR = 2;
const USER_AGENT = 'NearestBooze/1.0.0 (+https://github.com/thebrosdn/NearestBooze)';

const VENUE_FILTERS = [
  '["amenity"="bar"]',
  '["amenity"="pub"]',
  '["amenity"="nightclub"]',
  '["amenity"="biergarten"]',
  '["shop"="alcohol"]',
  '["shop"="wine"]',
  '["shop"="beverages"]',
];

export class OverpassError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'OverpassError';
    this.kind = kind; // 'timeout' | 'rate-limited' | 'server' | 'client' | 'network' | 'malformed'
  }
}

const RETRYABLE = new Set(['timeout', 'rate-limited', 'server', 'network']);

function buildQuery(lat, lon) {
  // Coordinates are numbers straight from the GPS and are re-formatted here, so
  // nothing user-controlled can reach the query string.
  const around = `(around:${SEARCH_RADIUS_M},${lat.toFixed(6)},${lon.toFixed(6)})`;
  const clauses = VENUE_FILTERS.map((f) => `  nwr${f}${around};`).join('\n');
  // `nwr` + `out center` also catches venues mapped as building outlines
  // (ways/relations), which a node-only query silently misses.
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout tags center;`;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestOnce(endpoint, body, externalSignal) {
  if (externalSignal?.aborted) throw new OverpassError('Request cancelled', 'client');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  externalSignal?.addEventListener?.('abort', forwardAbort);

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (externalSignal?.aborted) throw err; // caller cancelled; let it propagate
    throw new OverpassError(
      err?.name === 'AbortError' ? 'Overpass request timed out' : 'Network request failed',
      err?.name === 'AbortError' ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', forwardAbort);
  }

  // Overpass signals "all query slots busy" with 429, and an overloaded
  // backend with 504 — both are worth retrying elsewhere.
  if (res.status === 429 || res.status === 504) {
    throw new OverpassError('Overpass is busy', 'rate-limited');
  }
  if (!res.ok) {
    throw new OverpassError(`Overpass returned HTTP ${res.status}`, res.status >= 500 ? 'server' : 'client');
  }

  try {
    return await res.json();
  } catch {
    throw new OverpassError('Overpass returned a malformed response', 'malformed');
  }
}

function normalize(json) {
  const seen = new Set();
  const venues = [];
  for (const el of json?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Namespace the id by element type — a node and a way can share an id.
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    venues.push({ id, lat, lon, tags: el.tags ?? {} });
  }
  return venues;
}

export async function fetchNearbyVenues(lat, lon, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new OverpassError('Invalid coordinates', 'client');
  }
  const body = 'data=' + encodeURIComponent(buildQuery(lat, lon));

  let lastError = new OverpassError('No Overpass endpoint responded', 'network');
  for (const endpoint of MIRRORS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MIRROR; attempt++) {
      try {
        return normalize(await requestOnce(endpoint, body, signal));
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        if (!RETRYABLE.has(err.kind) || attempt === ATTEMPTS_PER_MIRROR) break;
        await delay(attempt * 1500); // linear backoff before the second try
      }
    }
  }
  throw lastError;
}

export { SEARCH_RADIUS_M };
