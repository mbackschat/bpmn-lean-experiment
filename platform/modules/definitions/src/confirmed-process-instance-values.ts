import {
  decodePublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublication,
  ConfirmedProcessInstanceRecord,
  DirectProcessInstanceIntent,
} from "./confirmed-process-instance-contracts.js";

const sha256Pattern = /^[0-9a-f]{64}$/u;

export function snapshotConfirmedPublication(
  publication: ConfirmedProcessInstancePublication,
): ConfirmedProcessInstancePublication {
  const instance = decodePublicProcessInstanceIdentity(publication.instance);
  return {
    instance,
    locator: requireNonemptyWellFormed(publication.locator, "locator"),
  };
}

export function encodePublicInstance(
  instance: PublicProcessInstanceIdentity,
): string {
  return JSON.stringify(decodePublicProcessInstanceIdentity(instance));
}

export function decodePublicInstance(encoded: string): PublicProcessInstanceIdentity {
  return decodePublicProcessInstanceIdentity(JSON.parse(encoded));
}

export function snapshotDirectIntent(
  intent: DirectProcessInstanceIntent,
): DirectProcessInstanceIntent {
  const protocol = requireNonemptyWellFormed(intent.protocol, "intent.protocol");
  if (!sha256Pattern.test(intent.intentSha256)) {
    throw new TypeError("intent.intentSha256 must be a lowercase SHA-256 digest");
  }
  return { protocol, intentSha256: intent.intentSha256 };
}

export function encodeDirectIntent(
  intent: DirectProcessInstanceIntent | null,
): string | null {
  return intent === null ? null : JSON.stringify(snapshotDirectIntent(intent));
}

export function decodeDirectIntent(
  encoded: string | null,
): DirectProcessInstanceIntent | null {
  if (encoded === null) {
    return null;
  }
  const value: unknown = JSON.parse(encoded);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("stored direct intent must be an object");
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "intentSha256" ||
    keys[1] !== "protocol" ||
    typeof candidate.protocol !== "string" ||
    typeof candidate.intentSha256 !== "string"
  ) {
    throw new TypeError("stored direct intent has an invalid shape");
  }
  return snapshotDirectIntent({
    protocol: candidate.protocol,
    intentSha256: candidate.intentSha256,
  });
}

export function samePublication(
  left: ConfirmedProcessInstancePublication,
  right: ConfirmedProcessInstancePublication,
): boolean {
  return left.locator === right.locator &&
    encodePublicInstance(left.instance) === encodePublicInstance(right.instance);
}

export function sameIntent(
  left: DirectProcessInstanceIntent | null,
  right: DirectProcessInstanceIntent | null,
): boolean {
  return encodeDirectIntent(left) === encodeDirectIntent(right);
}

export function requireState(value: string): ConfirmedProcessInstanceState {
  if (Object.values(ConfirmedProcessInstanceState).includes(
    value as ConfirmedProcessInstanceState,
  )) {
    return value as ConfirmedProcessInstanceState;
  }
  throw new TypeError("stored confirmed Process-instance state is invalid");
}

export function requireAllowedTransition(
  expected: ConfirmedProcessInstanceState,
  next: ConfirmedProcessInstanceState,
): void {
  const allowed = nextState(expected);
  if (!allowed.includes(next)) {
    throw new ConfirmedProcessInstanceIntegrityError("state-transition");
  }
}

export function snapshotRecord(
  record: ConfirmedProcessInstanceRecord,
): ConfirmedProcessInstanceRecord {
  return structuredClone(record);
}

function nextState(
  state: ConfirmedProcessInstanceState,
): readonly ConfirmedProcessInstanceState[] {
  switch (state) {
    case ConfirmedProcessInstanceState.Reserved:
      return [
        ConfirmedProcessInstanceState.Starting,
        ConfirmedProcessInstanceState.IntegrityFailure,
      ];
    case ConfirmedProcessInstanceState.Starting:
      return [
        ConfirmedProcessInstanceState.Confirmed,
        ConfirmedProcessInstanceState.Indeterminate,
        ConfirmedProcessInstanceState.IntegrityFailure,
      ];
    case ConfirmedProcessInstanceState.Indeterminate:
      return [
        ConfirmedProcessInstanceState.Confirmed,
        ConfirmedProcessInstanceState.IntegrityFailure,
      ];
    case ConfirmedProcessInstanceState.Confirmed:
    case ConfirmedProcessInstanceState.IntegrityFailure:
      return [];
    default:
      return assertNever(state);
  }
}

function requireNonemptyWellFormed(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported confirmed publication state: ${String(value)}`);
}
