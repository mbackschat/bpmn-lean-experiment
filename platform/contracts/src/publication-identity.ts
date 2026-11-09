import type { DeepReadonly } from "@bpmn-lean/contract-types";

import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

const lowercaseSha256 = /^[0-9a-f]{64}$/u;

/** The engine's reference to one deployed definition: its key, the stored version and the source digest. */
export type PublicationDefinitionRef = DeepReadonly<{
  definitionKey: string;
  version: number;
  sha256: string;
}>;

export type PublicationSourceOverlayIdentity = DeepReadonly<{ id: string; sha256: string }>;

/**
 * The definition a committed publication belongs to, as the engine names it: the definition reference and the
 * semantic profile, with the admission overlay that selected it.
 */
export type PublicationDefinitionIdentity = DeepReadonly<{
  ref: PublicationDefinitionRef;
  profile: string;
  sourceOverlay: PublicationSourceOverlayIdentity | null;
}>;

/** The process instance a publication belongs to, within its exact definition. */
export type PublicationIdentity = DeepReadonly<{
  definition: PublicationDefinitionIdentity;
  processInstanceId: string;
}>;

/** The publication identity of one exact deployed Process instance. */
export function publicationIdentityForPublicProcessInstance(
  instance: PublicProcessInstanceIdentity,
): PublicationIdentity {
  const definition = instance.definition;
  return {
    definition: {
      ref: {
        definitionKey: definition.processId,
        version: definition.version,
        sha256: definition.source.sha256,
      },
      profile: definition.semanticProfile,
      sourceOverlay: definition.sourceOverlay === null ? null : { ...definition.sourceOverlay },
    },
    processInstanceId: instance.processInstanceId,
  };
}

export function requirePublicationIdentity(value: unknown, label: string): PublicationIdentity {
  requireObject(value, label);
  requireExactKeys(value, label, ["definition", "processInstanceId"]);
  requirePublicationDefinitionIdentity(readOwn(value, "definition"), `${label}.definition`);
  requireNonemptyString(readOwn(value, "processInstanceId"), `${label}.processInstanceId`);
  return value as PublicationIdentity;
}

export function requirePublicationDefinitionIdentity(
  value: unknown,
  label: string,
): PublicationDefinitionIdentity {
  requireObject(value, label);
  requireExactKeys(value, label, ["ref", "profile", "sourceOverlay"]);
  const ref = readOwn(value, "ref");
  requireObject(ref, `${label}.ref`);
  requireExactKeys(ref, `${label}.ref`, ["definitionKey", "version", "sha256"]);
  requireNonemptyString(readOwn(ref, "definitionKey"), `${label}.ref.definitionKey`);
  requirePositiveSafeInteger(readOwn(ref, "version"), `${label}.ref.version`);
  requireDigest(readOwn(ref, "sha256"), `${label}.ref.sha256`);
  requireNonemptyString(readOwn(value, "profile"), `${label}.profile`);
  const overlay = readOwn(value, "sourceOverlay");
  if (overlay !== null) {
    requireObject(overlay, `${label}.sourceOverlay`);
    requireExactKeys(overlay, `${label}.sourceOverlay`, ["id", "sha256"]);
    requireNonemptyString(readOwn(overlay, "id"), `${label}.sourceOverlay.id`);
    requireDigest(readOwn(overlay, "sha256"), `${label}.sourceOverlay.sha256`);
  }
  return value as PublicationDefinitionIdentity;
}

export function samePublicationIdentity(left: PublicationIdentity, right: PublicationIdentity): boolean {
  return left.processInstanceId === right.processInstanceId &&
    samePublicationDefinition(left.definition, right.definition);
}

export function samePublicationDefinition(
  left: PublicationDefinitionIdentity,
  right: PublicationDefinitionIdentity,
): boolean {
  return left.ref.definitionKey === right.ref.definitionKey && left.ref.version === right.ref.version &&
    left.ref.sha256 === right.ref.sha256 && left.profile === right.profile &&
    (left.sourceOverlay === null
      ? right.sourceOverlay === null
      : right.sourceOverlay !== null && left.sourceOverlay.id === right.sourceOverlay.id &&
        left.sourceOverlay.sha256 === right.sourceOverlay.sha256);
}

function requireDigest(value: unknown, label: string): void {
  if (typeof value !== "string" || !lowercaseSha256.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
}
