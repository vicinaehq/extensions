// Validation for downloaded icon bytes. radio-browser favicons and other
// remote sources frequently return error pages, tracking pixels, or 0-byte
// bodies with a 200 status; caching those produces broken/blank station
// icons. We sniff the leading magic bytes and enforce a small size floor so
// only real images are ever written to the cache.

// Smaller than this is almost certainly a tracking pixel or an error stub,
// not a usable station logo.
export const MIN_IMAGE_BYTES = 100;

// Return the canonical MIME for a known image signature, else null.
// Supported: PNG, JPEG, GIF, WEBP (RIFF....WEBP), BMP, ICO.
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return 'image/gif';
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return 'image/bmp';
  }
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return 'image/x-icon';
  }
  return null;
}

// True only when the body is a real image: a size floor, a recognized
// signature, and a content-type that isn't explicitly text/html (some CDNs
// return an HTML error page with a 200 and a non-empty body).
export function isValidImage(buf: Buffer, contentType: string | undefined): boolean {
  if (buf.length < MIN_IMAGE_BYTES) return false;
  if (contentType && /^text\/html/i.test(contentType)) return false;
  return sniffImageType(buf) !== null;
}
