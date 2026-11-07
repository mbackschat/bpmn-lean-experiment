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
 * The legacy operation of the host's work arriving on `input` and leaving by `output` (ACTH-HOST-01, ACSP-HOST-01),
 * the Lean `ActivityHost.workAt`: the operation whose rules the work meets for every input and output.
 */
export function activityHostWorkAt(host: ActivityHostOperation, input: string, output: string): ActivityHostProjection {
  switch (host.work.kind) {
    case ActivityWorkKind.UserTask:
      return { id: host.id, origin: host.origin, kind: SemanticOperationKind.AwaitUserTask, input, output,
        task: host.work.task };
    case ActivityWorkKind.Effect:
      return { id: host.id, origin: host.origin, kind: SemanticOperationKind.AwaitEffect, input, output,
        effect: host.work.effect, bpmnErrorRoute: null };
  }
}

/**
 * The legacy operation a merging host's arrival on `input` equals. `null` for a splitting host, whose arrival opens a
 * wait on all its outputs and so equals no legacy operation.
 */
export function activityHostProjection(host: ActivityHostOperation, input: string): ActivityHostProjection | null {
  const [output, ...rest] = host.outputs;
  return output === undefined || rest.length > 0 ? null : activityHostWorkAt(host, input, output.place);
}

/**
 * The legacy operation of a host whose arrival has already committed, for consumers that read only its work and
 * origin (the opened wait's identity, its occurrence, its declarations), never which input it consumed. Its `output`
 * is the first of possibly several: a consumer comparing outputs reads them through `settledWaitOutputs`.
 */
export function activityHostSettledProjection(host: ActivityHostOperation): ActivityHostProjection | null {
  const [input] = host.inputs;
  const [output] = host.outputs;
  return input === undefined || output === undefined ? null : activityHostWorkAt(host, input, output.place);
}

/**
 * The outputs the wait opened by `programOperation` carries, given `output`, the output of its settled operation: all
 * of a host's outputs (ACSP-WAIT-01), the single output of any legacy operation.
 */
export function settledWaitOutputs(programOperation: SemanticOperation, output: string): readonly string[] {
  return programOperation.kind === SemanticOperationKind.Activity
    ? programOperation.outputs.map(({ place }) => place)
    : [output];
}

export type LegacySemanticOperation = Exclude<SemanticOperation, ActivityHostOperation>;

/**
 * An operation as the consumers of a committed step read it: a host as its settled projection, every other operation
 * as itself. `null` only for a host without inputs or outputs, which the host Program rules refuse.
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
