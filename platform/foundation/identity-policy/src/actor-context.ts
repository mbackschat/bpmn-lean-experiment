import type { DeepReadonly } from "@bpmn-lean/contract-types";

export type ActorContext = DeepReadonly<{
  id: string;
  groups: string[];
}>;

export class InvalidActorContextError extends Error {}

/** Copies and freezes one exact actor identity without normalizing its identifiers. */
export function snapshotActorContext(context: ActorContext): ActorContext {
  assertIdentifier(context.id, "actor ID");
  const groups = [...context.groups];
  const seen = new Set<string>();
  for (const group of groups) {
    assertIdentifier(group, "actor group");
    if (seen.has(group)) {
      throw new InvalidActorContextError("actor groups must be unique");
    }
    seen.add(group);
  }
  return Object.freeze({
    id: context.id,
    groups: Object.freeze(groups),
  });
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new InvalidActorContextError(
      `${label} must be a nonempty well-formed Unicode string`,
    );
  }
}
