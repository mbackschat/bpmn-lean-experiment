import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { PublicationIdentity } from "./publication-identity.js";
import type { PublicJsonObject } from "./public-json-value.js";

export const executionPublicationExportFormat = "bpmn-lean.execution-publication" as const;

export const VariableValueKind = {
  Boolean: "boolean",
  Integer: "integer",
  String: "string",
  StringList: "stringList",
  Null: "null",
} as const;

/** The value arms Product 2 submits to a start or a task completion. */
export type VariableValue = DeepReadonly<
  | { kind: typeof VariableValueKind.Boolean; value: boolean }
  | { kind: typeof VariableValueKind.Integer; value: number }
  | { kind: typeof VariableValueKind.String; value: string }
  | { kind: typeof VariableValueKind.StringList; value: string[] }
  | { kind: typeof VariableValueKind.Null }
>;

export type VariableBinding = DeepReadonly<{
  name: string;
  value: VariableValue;
}>;

export type ExecutionPublicationRequest = DeepReadonly<{
  afterRevision: number;
  limit?: number;
}>;

export type ExecutionPublicationDecodeContext = DeepReadonly<
  PublicationIdentity & ExecutionPublicationRequest
>;

/** The kernel input a committed batch began with (`Kernel.Run.causeJson`). */
export const ExecutionInputKind = {
  Start: "start",
  Command: "command",
  Deliver: "deliver",
  TimerFire: "timerFire",
  EffectResult: "effectResult",
} as const;

export type ExecutionInputKind = typeof ExecutionInputKind[keyof typeof ExecutionInputKind];

/** What caused one kernel micro-step, published as the transition's role. */
export const ExecutionRoleKind = {
  Input: "input",
  Signal: "signal",
  Arrive: "arrive",
  Idle: "idle",
} as const;

export type ExecutionRole = DeepReadonly<
  | { kind: typeof ExecutionRoleKind.Input; input: ExecutionInputKind }
  | { kind: typeof ExecutionRoleKind.Signal; signal: string }
  | { kind: typeof ExecutionRoleKind.Arrive; flow: string }
  | { kind: typeof ExecutionRoleKind.Idle; scope: number }
>;

/**
 * One committed kernel micro-step: the element it acted on with the source type that element began with, and the
 * scope occurrence that owns it. `element` and `sourceType` are `null` for a step that acts on no element.
 */
export type CommittedTransitionRecord = DeepReadonly<{
  revision: number;
  role: ExecutionRole;
  element: string | null;
  sourceType: string | null;
  owner: number;
}>;

/** The micro-steps of one committed input, numbered as consecutive revisions. */
export type CommittedTransitionBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  transitions: [CommittedTransitionRecord, ...CommittedTransitionRecord[]];
}>;

export const ProcessStatus = {
  Running: "running",
  Completed: "completed",
  Cancelled: "cancelled",
  Failed: "failed",
} as const;

export type ProcessStatus = typeof ProcessStatus[keyof typeof ProcessStatus];

export type StateOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

/*
 * The state types below are Readonly with readonly arrays rather than DeepReadonly: PublicJsonValue is already
 * immutable, and mapping DeepReadonly over that recursive alias makes every assignability check instantiate it without
 * bound (TS2589).
 */

/** A variable binding as the engine observes it; the value keeps the engine's typed form. */
export type StateVariableBinding = Readonly<{
  name: string;
  value: PublicJsonObject;
}>;

/**
 * One open wait of the committed state: its occurrence, the called definition it runs in (`null` in the root
 * instance), the input that closes it, and its engine-typed detail, whose `kind` names the detail form.
 */
export type StateOpenWait = Readonly<{
  id: StateOccurrenceId;
  definition: PublicJsonObject | null;
  input: string | null;
  detail: { kind: string } & PublicJsonObject;
}>;

/** A Signal a committed input threw to the population (`canonical-result.schema.json#/$defs/broadcast`). */
export type StateBroadcast = Readonly<{
  variables: readonly StateVariableBinding[];
  businessKey?: string;
  origin: StateOccurrenceId;
}> & (Readonly<{ name: string }> | Readonly<{ signalRef: Readonly<{ id: string; namespace?: string }> }>);

/**
 * Why a failed instance failed (`canonical-result.schema.json#/$defs/instanceFailure`): its code and message, the
 * failed occurrence, and the occurrences the failure names, such as a Compensation's trigger and handler.
 */
export type StateInstanceFailure = Readonly<{
  code: string;
  message: string | null;
  occurrence: StateOccurrenceId;
  related: readonly Readonly<{ name: string; occurrence: StateOccurrenceId }>[];
}>;

/**
 * The canonical state observation (`canonical-result.schema.json#/$defs/state`); `failure` only when failed and
 * `broadcasts` only after an input that threw a Signal.
 */
export type ExecutionState = Readonly<{
  kind: "state";
  instanceId: string;
  status: ProcessStatus;
  logicalTimeMs: number;
  variables: readonly StateVariableBinding[];
  scopes: readonly PublicJsonObject[];
  openWaits: readonly StateOpenWait[];
  broadcasts?: readonly StateBroadcast[];
  failure?: StateInstanceFailure;
}>;

export type CurrentCommittedExecution = Readonly<{
  revision: number;
  state: ExecutionState;
}>;

/** `current` is present exactly on the page that reaches the head, as the state committed there. */
export type ExecutionPublicationPage = PublicationIdentity & Readonly<{
  requestedAfterRevision: number;
  pageThroughRevision: number;
  headRevision: number;
  batches: readonly CommittedTransitionBatch[];
  current: CurrentCommittedExecution | null;
}>;

export const ExecutionPublicationResultKind = {
  Available: "available",
  NotFound: "notFound",
  Unavailable: "unavailable",
  Gap: "gap",
  IntegrityFailure: "integrityFailure",
} as const;

/**
 * `notFound`: the engine holds no committed start for the instance; `gap`: the engine no longer retains the requested
 * revisions; `integrityFailure`: the instance's chain runs another definition or instance than expected.
 */
export type ExecutionPublicationResult =
  | Readonly<{ kind: typeof ExecutionPublicationResultKind.Available; page: ExecutionPublicationPage }>
  | Readonly<{ kind: typeof ExecutionPublicationResultKind.NotFound }>
  | Readonly<{ kind: typeof ExecutionPublicationResultKind.Unavailable }>
  | Readonly<{ kind: typeof ExecutionPublicationResultKind.Gap }>
  | Readonly<{ kind: typeof ExecutionPublicationResultKind.IntegrityFailure }>;

export type ExecutionPublicationExport = PublicationIdentity & Readonly<{
  format: typeof executionPublicationExportFormat;
  headRevision: number;
  batches: readonly [CommittedTransitionBatch, ...CommittedTransitionBatch[]];
  current: CurrentCommittedExecution;
}>;
