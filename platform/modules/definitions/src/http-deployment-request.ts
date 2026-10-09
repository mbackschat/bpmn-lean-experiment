import { PublicApiErrorCode } from "@bpmn-lean/platform-contracts";
import type { DefinitionSourceOverlaySelection } from "@bpmn-lean/platform-engine-gateway";
import { deploymentMediaType, HttpRequestFailure, readBoundedBody, requireDeploymentMediaType } from "./http-request.js";

const maxOverlayBytes = 65_536;
const maxOverlayIdBytes = 1_024;
const maxFramingBytes = 16_384;
const maxEnvelopeExtraBytes = maxOverlayBytes + maxFramingBytes;
const overlayDigest = /^[0-9a-f]{64}$/u;
const multipartMediaType = /^multipart\/form-data(?:[ \t]*;|[ \t]*$)/iu;
const partNames = new Set(["bpmn", "sourceOverlay", "sourceOverlayId", "sourceOverlaySha256"]);

/** Bounds received bytes before the native multipart parser can allocate part values. */
export async function readDefinitionDeploymentBody(request: Request, maxSourceBytes: number): Promise<Readonly<{
  bytes: Uint8Array;
  sourceOverlay: DefinitionSourceOverlaySelection | null;
}>> {
  const mediaType = request.headers.get("content-type");
  if (mediaType === null || !multipartMediaType.test(mediaType)) {
    requireDeploymentMediaType(request.headers);
    return { bytes: await readBoundedBody(request, maxSourceBytes), sourceOverlay: null };
  }
  const maxEnvelopeBytes = maxSourceBytes + maxEnvelopeExtraBytes;
  if (!Number.isSafeInteger(maxEnvelopeBytes)) throw new RangeError("multipart byte limit must be a safe integer");
  const envelope = await readBoundedBody(request, maxEnvelopeBytes, {
    empty: "The multipart deployment body must not be empty.",
    tooLarge: "The multipart deployment exceeds the configured byte limit.",
  });
  let form: FormData;
  try {
    form = await new Response(envelope, { headers: { "content-type": mediaType } }).formData();
  } catch {
    throw failure(400, PublicApiErrorCode.InvalidRequest, "The multipart deployment is malformed.");
  }
  const parts = new Map<string, string | File>();
  for (const [name, part] of form) {
    if (!partNames.has(name) || parts.has(name)) {
      throw failure(400, PublicApiErrorCode.InvalidRequest, "The multipart deployment has unknown or duplicate parts.");
    }
    parts.set(name, part);
  }
  const bpmn = parts.get("bpmn");
  if (!(bpmn instanceof File)) throw failure(400, PublicApiErrorCode.InvalidRequest, "Exactly one BPMN file is required.");
  if (!deploymentMediaType.test(bpmn.type)) throw unsupportedMedia("The BPMN file must use an XML media type.");
  requirePartSize(bpmn, maxSourceBytes);
  const sourceOverlay = parts.get("sourceOverlay");
  const idPart = parts.get("sourceOverlayId");
  const digestPart = parts.get("sourceOverlaySha256");
  if (sourceOverlay === undefined && idPart === undefined && digestPart === undefined) {
    requireFramingSize(envelope, bpmn.size);
    return { bytes: new Uint8Array(await bpmn.arrayBuffer()), sourceOverlay: null };
  }
  if (!(sourceOverlay instanceof File) || (typeof idPart !== "string" && !(idPart instanceof File)) || typeof digestPart !== "string") {
    throw failure(400, PublicApiErrorCode.InvalidRequest, "The source overlay file, ID and digest are required together.");
  }
  if (sourceOverlay.type !== "application/json") throw unsupportedMedia("The source overlay file must use application/json.");
  requirePartSize(sourceOverlay, maxOverlayBytes);
  if (idPart instanceof File) {
    if (idPart.type !== "text/plain") throw unsupportedMedia("The source overlay ID file must use text/plain.");
    requirePartSize(idPart, maxOverlayIdBytes);
  }
  const { id, sha256 } = await readLiteralFields(envelope, mediaType, idPart);
  if (!id.isWellFormed() || Array.from(id).length < 1 || Array.from(id).length > 256 || !overlayDigest.test(sha256)) {
    throw failure(400, PublicApiErrorCode.InvalidRequest, "The source overlay ID or digest is invalid.");
  }
  requireFramingSize(envelope, bpmn.size + sourceOverlay.size + new TextEncoder().encode(id).byteLength + sha256.length);
  return {
    bytes: new Uint8Array(await bpmn.arrayBuffer()),
    sourceOverlay: { id, sha256, bytes: new Uint8Array(await sourceOverlay.arrayBuffer()) },
  };
}

async function readLiteralFields(envelope: Uint8Array, mediaType: string, idPart: string | File): Promise<Readonly<{ id: string; sha256: string }>> {
  // BPD-CAPTURE-01 requires literal identities. Native FormData replaces malformed UTF-8;
  // a Latin-1 byte view preserves every byte through that parser for fatal decoding below.
  // File bytes always come from the original parse, including non-UTF-8 BPMN sources.
  try {
    const form = await new Response(Buffer.from(envelope).toString("latin1"), {
      headers: { "content-type": mediaType },
    }).formData();
    const decode = (name: "sourceOverlayId" | "sourceOverlaySha256"): string => {
      const value = form.get(name);
      if (typeof value !== "string" || Array.from(value).some(character => character.charCodeAt(0) > 255)) {
        throw new TypeError("Multipart scalar bytes were not preserved");
      }
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.from(value, "latin1"));
    };
    const id = idPart instanceof File
      ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await idPart.arrayBuffer())
      : decode("sourceOverlayId");
    return { id, sha256: decode("sourceOverlaySha256") };
  } catch {
    throw failure(400, PublicApiErrorCode.InvalidRequest, "The source overlay ID or digest is not valid UTF-8.");
  }
}

function requirePartSize(file: File, limit: number): void {
  if (file.size === 0) throw failure(400, PublicApiErrorCode.InvalidRequest, "Deployment files must not be empty.");
  if (file.size > limit) throw failure(413, PublicApiErrorCode.PayloadTooLarge, "A deployment file exceeds its byte limit.");
}

function requireFramingSize(envelope: Uint8Array, contentBytes: number): void {
  if (envelope.byteLength - contentBytes > maxFramingBytes) {
    throw failure(413, PublicApiErrorCode.PayloadTooLarge, "The multipart framing exceeds its byte limit.");
  }
}

function unsupportedMedia(message: string): HttpRequestFailure {
  return failure(415, PublicApiErrorCode.UnsupportedMediaType, message);
}

function failure(status: number, code: typeof PublicApiErrorCode.InvalidRequest | typeof PublicApiErrorCode.UnsupportedMediaType | typeof PublicApiErrorCode.PayloadTooLarge, message: string): HttpRequestFailure {
  return new HttpRequestFailure(status, code, message);
}
