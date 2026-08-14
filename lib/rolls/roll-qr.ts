export const rollSerialPattern = /^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$/;

export function normalizeRollSerial(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return rollSerialPattern.test(normalized) ? normalized : null;
}

export function normalizePublicSiteOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return null;
    }

    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return null;
  }
}

export function buildRollQrUrl(publicSiteOrigin: string, serialNumber: string): string {
  const origin = normalizePublicSiteOrigin(publicSiteOrigin);
  const serial = normalizeRollSerial(serialNumber);

  if (!origin) throw new Error("A valid HTTPS public site origin is required for Roll QR generation.");
  if (!serial) throw new Error("A valid canonical Roll serial is required for Roll QR generation.");

  return `${origin}/r/${encodeURIComponent(serial)}`;
}

export function parseRollQrPayload(payload: string, expectedPublicSiteOrigin: string): string | null {
  const expectedOrigin = normalizePublicSiteOrigin(expectedPublicSiteOrigin);
  if (!expectedOrigin) return null;

  try {
    const url = new URL(payload.trim());
    if (url.origin !== expectedOrigin || url.search || url.hash) return null;

    const match = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (!match) return null;

    return normalizeRollSerial(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}
