/**
 * Per-work facts of the Activity host, the one place outside the step owner that dispatches on its work, per the
 * [Activity host specification](../../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#per-work-accessors).
 * Transcribed independently by the Lean `ActivityHostWork` module.
 *
 * Every other consumer reads a host through these accessors or through the legacy function of its projection: a
 * host arriving on one input behaves, waits and publishes exactly as the legacy operation of its work with that input.
 */
import { ActivityWorkKind } from "./activity-host-contract.js";
import { scopeHostPublishedKind } from "./scope-host-work.js";
import {
  type PublishedSemanticOperationKind,
  type SemanticOperation,
  SemanticOperationKind,
} from "./semantic-process-contract.js";

export type ActivityHostOperation = Extract<SemanticOperation, { kind: SemanticOperationKind.Activity }>;

export type ActivityHostProjection = Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitUserTask | SemanticOperationKind.AwaitEffect }
>;

/** ACTH-HOST-01: a host publishes its work's legacy kind, never its discriminant. */
export function activityHostPublishedKind(host: ActivityHostOperation): PublishedSemanticOperationKind {
  switch (host.work.kind) {
    case ActivityWorkKind.UserTask:
      return SemanticOperationKind.AwaitUserTask;
    case ActivityWorkKind.Effect:
      return SemanticOperationKind.AwaitEffect;
  }
}

/** The kind a publication carries for an operation's step. */
export function publishedOperationKind(operation: SemanticOperation): PublishedSemanticOperationKind {
  switch (operation.kind) {
    case SemanticOperationKind.Activity:
      return activityHostPublishedKind(operation);
    case SemanticOperationKind.Scope:
    case SemanticOperationKind.ScopeExit:
      return scopeHostPublishedKind(operation);
    default:
      return operation.kind;
  }
}

/**
 * The legacy operation a host arrival on `input` equals. `null` when the host has no single output, which the host
 * Program rules refuse, so no admitted Program reaches it.
 */
export function activityHostProjection(host: ActivityHostOperation, input: string): ActivityHostProjection | null {
  const [output, ...rest] = host.outputs;
  if (output === undefined || rest.length > 0) {
    return null;
  }
  switch (host.work.kind) {
    case ActivityWorkKind.UserTask:
      return {
        id: host.id,
        origin: host.origin,
        kind: SemanticOperationKind.AwaitUserTask,
        input,
        output: output.place,
        task: host.work.task,
      };
    case ActivityWorkKind.Effect:
      return {
        id: host.id,
        origin: host.origin,
        kind: SemanticOperationKind.AwaitEffect,
        input,
        output: output.place,
        effect: host.work.effect,
        bpmnErrorRoute: null,
      };
  }
}

/**
 * The legacy operation of a host whose arrival has already committed, for consumers that read only its work, origin
 * and output (the opened wait, its occurrence, its declarations), never which input it consumed.
 */
export function activityHostSettledProjection(host: ActivityHostOperation): ActivityHostProjection | null {
  const [input] = host.inputs;
  return input === undefined ? null : activityHostProjection(host, input);
}

export type LegacySemanticOperation = Exclude<SemanticOperation, ActivityHostOperation>;

/**
 * An operation as the consumers of a committed step read it: a host as its settled projection, every other operation
 * as itself. `null` only for a host the host Program rules refuse.
 */
export function settledOperation(operation: SemanticOperation): LegacySemanticOperation | null {
  return operation.kind === SemanticOperationKind.Activity ? activityHostSettledProjection(operation) : operation;
}

/** Whether a wire value names a published operation kind; no host's discriminant does (ACTH-HOST-01, SCPH-HOST-01). */
export function isPublishedOperationKind(value: unknown): value is PublishedSemanticOperationKind {
  return typeof value === "string" && value !== SemanticOperationKind.Activity &&
    value !== SemanticOperationKind.Scope && value !== SemanticOperationKind.ScopeExit &&
    (Object.values(SemanticOperationKind) as string[]).includes(value);
}

/** A Program's operations with every host read as its settled projection, for scans that find a wait's declarer. */
export function settledOperations(operations: ReadonlyArray<SemanticOperation>): LegacySemanticOperation[] {
  return operations.flatMap((operation) => {
    const settled = settledOperation(operation);
    return settled === null ? [] : [settled];
  });
}
