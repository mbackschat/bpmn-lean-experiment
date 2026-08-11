import { createHash } from "node:crypto";

import {
  engineDefinitionMessageStartWorkflowId,
} from "@bpmn-lean/engine-api";

const processInstanceDomain = "bpmn-platform-message-start-instance-v1";
const commandDomain = "bpmn-platform-message-start-command-v1";

/** Derives one private semantic Process-instance identity from the publication identity. */
export function messageStartPublicationProcessInstanceId(
  publicationId: string,
): string {
  return `bpmn-platform-message-start-instance-sha256:${publicationDigest(
    processInstanceDomain,
    publicationId,
  )}`;
}

/** Derives one independently domain-separated private semantic command identity. */
export function messageStartPublicationCommandId(publicationId: string): string {
  return `bpmn-platform-message-start-command-sha256:${publicationDigest(
    commandDomain,
    publicationId,
  )}`;
}

/** Reuses Product 1's canonical Process Workflow address derivation. */
export function messageStartPublicationWorkflowId(
  processInstanceId: string,
): string {
  return engineDefinitionMessageStartWorkflowId(processInstanceId);
}

function publicationDigest(domain: string, publicationId: string): string {
  requireIdentity(publicationId, "publicationId");
  const encoding = JSON.stringify([domain, publicationId]);
  return createHash("sha256").update(encoding, "utf8").digest("hex");
}

function requireIdentity(value: string, name: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${name} must be nonempty well-formed Unicode`);
  }
}
