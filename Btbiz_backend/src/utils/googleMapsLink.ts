/**
 * Turns a Google Maps link (full URL, maps.app.goo.gl share link) or pasted "lat, lng" text into coordinates,
 * so the super admin can pin a shop exactly instead of relying on address geocoding.
 */

export interface MapPoint {
  lat: number;
  lng: number;
}

export class MapLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapLinkError";
  }
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

// Most precise first: the place pin (!3d/!4d) and explicit query points, then the map viewport centre (@lat,lng).
const COORDINATE_PATTERNS: RegExp[] = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
  new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=(?:loc:)?${NUM}\s*[,+\s]\s*\+?${NUM}`),
  new RegExp(String.raw`/maps/(?:search|place|dir)/${NUM}\s*[,+\s]\s*\+?${NUM}`),
  new RegExp(String.raw`@${NUM},${NUM}`),
];

const PLAIN_COORDINATES = new RegExp(String.raw`^\s*${NUM}\s*,\s*${NUM}\s*$`);

const COORDINATES_TIP =
  "In Google Maps, right-click (or long-press) the shop's pin, copy the coordinates (like 28.4089, 77.3178) and paste them here.";

const MAX_LINK_LENGTH = 2048;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8000;

const isGoogleMapsHost = (host: string): boolean =>
  /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);

const isShortLink = (url: URL): boolean =>
  url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps"));

const isInIndia = ({ lat, lng }: MapPoint): boolean => lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;

const toPoint = (latText: string, lngText: string): MapPoint | null => {
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

/** Coordinates written inside a Google Maps URL (no network). */
export function extractCoordinatesFromMapUrl(text: string): MapPoint | null {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // keep the raw text when it is not valid percent-encoding
  }
  for (const pattern of COORDINATE_PATTERNS) {
    const match = decoded.match(pattern);
    if (match) {
      const point = toPoint(match[1], match[2]);
      if (point) return point;
    }
  }
  return null;
}

const ensureInIndia = (point: MapPoint): MapPoint => {
  if (!isInIndia(point)) {
    throw new MapLinkError("This map location is outside India. Please check the Google Maps link.");
  }
  return point;
};

const parseLink = (raw: string): URL | null => {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
};

const followShortLink = async (start: URL): Promise<MapPoint> => {
  let current = start;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    let location: string | null;
    try {
      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "BtbizDoctorPanel/1.0 (map-link)" },
      });
      location = res.headers.get("location");
    } catch {
      throw new MapLinkError(`Could not open this Google Maps short link. Try again, or: ${COORDINATES_TIP}`);
    }
    if (!location) break;

    const next = new URL(location, current);
    const point = extractCoordinatesFromMapUrl(next.toString());
    if (point) return point;
    // Only Google's own short-link hosts are ever requested; any other redirect target is just read, never fetched.
    if (next.protocol !== "https:" || !isShortLink(next)) break;
    current = next;
  }
  throw new MapLinkError(`Could not read a location from this link. ${COORDINATES_TIP}`);
};

/**
 * Resolves a pasted Google Maps link or "lat, lng" text to coordinates inside India.
 * Throws MapLinkError with a message that can be shown to the user.
 */
export async function resolveGoogleMapsLocation(input: string): Promise<MapPoint> {
  const raw = input.trim();
  if (!raw || raw.length > MAX_LINK_LENGTH) {
    throw new MapLinkError("Paste a Google Maps link or coordinates for the shop.");
  }

  const plain = raw.match(PLAIN_COORDINATES);
  if (plain) {
    const point = toPoint(plain[1], plain[2]);
    if (!point) throw new MapLinkError("These coordinates are not valid.");
    return ensureInIndia(point);
  }

  const url = parseLink(raw);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new MapLinkError("Paste a Google Maps link (https://maps.app.goo.gl/... or https://www.google.com/maps/...).");
  }

  if (isShortLink(url)) {
    return ensureInIndia(await followShortLink(url));
  }
  if (isGoogleMapsHost(url.hostname)) {
    const point = extractCoordinatesFromMapUrl(url.toString());
    if (!point) {
      throw new MapLinkError(`This Google Maps link has no exact location. ${COORDINATES_TIP}`);
    }
    return ensureInIndia(point);
  }
  throw new MapLinkError("Only Google Maps links are supported.");
}
