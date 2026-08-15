type RequestBodyLengthGuard = (
  method: string,
  decodedByteLength: number,
) => void;

/** Preserves the bodyless GET boundary even when Fetch cannot represent a GET body. */
export async function requireBodylessGet(
  request: Request,
  requireBodyLength: RequestBodyLengthGuard,
): Promise<void> {
  if (request.headers.get("content-type") !== null) {
    throw new TypeError("bodyless GET must not declare content-type");
  }
  if (request.headers.get("transfer-encoding") !== null) {
    throw new TypeError("bodyless GET must not use transfer encoding");
  }
  const claimed = request.headers.get("content-length");
  if (claimed !== null && claimed !== "0") {
    throw new TypeError("bodyless GET content-length must be zero");
  }
  const bytes = request.body === null
    ? new Uint8Array()
    : new Uint8Array(await request.arrayBuffer());
  requireBodyLength(request.method, bytes.byteLength);
}
