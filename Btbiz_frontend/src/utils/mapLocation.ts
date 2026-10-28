/** Helpers for the super admin shop-location field (Google Maps link or "lat, lng" text). */

const COORDINATES = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

/** Above this the fix is usually Wi-Fi/IP based (laptops), not the shop's exact spot. */
export const LOW_ACCURACY_METERS = 200

export function parseCoordinates(value?: string): { lat: number; lng: number } | null {
  const match = value?.match(COORDINATES)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

/** Link to verify the pin on Google Maps, for a pasted link or "lat, lng" text; null when neither. */
export function mapCheckHref(value?: string): string | null {
  const text = value?.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return text
  const point = parseCoordinates(text)
  return point ? `https://www.google.com/maps?q=${point.lat},${point.lng}` : null
}

export function describeAccuracy(meters: number): string {
  return meters < 1000 ? `±${Math.round(meters)} m` : `±${(meters / 1000).toFixed(1)} km`
}
