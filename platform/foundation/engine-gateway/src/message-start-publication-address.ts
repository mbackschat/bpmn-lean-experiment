import { createHash } from "node:crypto";

import { engineDefinitionMessageStartWorkflowId } from "@bpmn-lean/engine-api";

const processInstanceDomain = "bpmn-platform-message-start-instance";
const commandDomain = "bpmn-platform-message-start-command";

/**
 * The semantic process-instance identity of one Message start publication. A repeated publication derives the same
 * identity, and so the same Workflow ID, which the host starts at most once.
 */
export function messageStartPublicationProcessInstanceId(publicationId: string): string {
  return `bpmn-platform-message-start-instance-sha256:${publicationDigest(processInstanceDomain, publicationId)}`;
}

/** The command identity of one publication, domain-separated from its instance identity. */
export function messageStartPublicationCommandId(publicationId: string): string {
  return `bpmn-platform-message-start-command-sha256:${publicationDigest(commandDomain, publicationId)}`;
}

export function messageStartPublicationWorkflowId(processInstanceId: string): string {
  return engineDefinitionMessageStartWorkflowId(processInstanceId);
}

function publicationDigest(domain: string, publicationId: string): string {
  if (typeof publicationId !== "string" || publicationId.length === 0 || !publicationId.isWellFormed()) {
    throw new TypeError("publicationId must be nonempty well-formed Unicode");
  }
  return createHash("sha256").update(JSON.stringify([domain, publicationId]), "utf8").digest("hex");
}
