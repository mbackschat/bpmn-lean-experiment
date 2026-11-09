/**
 * The Temporal address of a correlation ingress: its Workflow ID, a digest of the correlation address
 * (`correlation.ts#ingressKey`), so no scope or channel shapes a host address. It hashes with Node's crypto, so only
 * clients and Activities import it, never Workflow code.
 */
import { createHash } from "node:crypto";

import { ingressKey, publicationContent } from "./correlation.js";
import type { CorrelatedPublication } from "./host-contract.js";
import type { JsonValue } from "./port.js";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export function ingressWorkflowId(correlationScope: string, channel: JsonValue): string {
  return `bpmn-correlation-ingress-sha256:${sha256(ingressKey(correlationScope, channel))}`;
}

/**
 * The Update ID of a publication. Temporal answers a repeated Update ID with the first result whatever the new
 * arguments are, so the ID carries the content digest: a repeat with other content is a separate Update, which the
 * ingress ledger answers as an identity conflict.
 */
export function publicationUpdateId(publication: CorrelatedPublication): string {
  return `publish:${publication.commandId}:${sha256(publicationContent(publication))}`;
}
