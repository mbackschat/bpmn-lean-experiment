import type { DeepReadonly } from "./deep-readonly.js";
import type { VariableBinding } from "./contract.js";
import type { RuntimeScopeOccurrence } from "./semantic-process-state.js";

export type CompensationEventSubProcessSnapshotTarget = DeepReadonly<{
  parentScopeId: string;
  handlerScopeId: string;
}>;

export type CompensationEventSubProcessSnapshotDeclaration = DeepReadonly<{
  targets: CompensationEventSubProcessSnapshotTarget[];
  limits: {
    maxRecords: number;
    maxCanonicalBytes: number;
  };
}>;

export enum CompensationEventSubProcessSnapshotProgramDefect {
  InvalidLimits = "invalidLimits",
  EmptyTargets = "emptyTargets",
  InvalidTarget = "invalidTarget",
  UnorderedTargets = "unorderedTargets",
  DuplicateParentTarget = "duplicateParentTarget",
  DuplicateHandlerTarget = "duplicateHandlerTarget",
  ParentScopeMismatch = "parentScopeMismatch",
  HandlerScopeMismatch = "handlerScopeMismatch",
  HandlerNotDormant = "handlerNotDormant",
  ParentEntryMismatch = "parentEntryMismatch",
}

export type CompensationParentContextFrame = DeepReadonly<{
  owner: RuntimeScopeOccurrence["id"];
  bindings: VariableBinding[];
}>;

export type CompensationParentContextSnapshot = DeepReadonly<{
  frames: CompensationParentContextFrame[];
}>;

export enum CompensationParentContextRetentionKind {
  Provisional = "provisional",
  Promoted = "promoted",
}

export type CompensationParentContextRetention =
  | DeepReadonly<{
      kind: CompensationParentContextRetentionKind.Provisional;
      parent: RuntimeScopeOccurrence;
      handlerScopeId: string;
    }>
  | DeepReadonly<{
      kind: CompensationParentContextRetentionKind.Promoted;
      parent: RuntimeScopeOccurrence;
      handlerScopeId: string;
      snapshot: CompensationParentContextSnapshot;
    }>;

export enum CompensationEventSubProcessSnapshotStateDefect {
  ProgramPresenceMismatch = "programPresenceMismatch",
  InvalidRetention = "invalidRetention",
}

export enum CompensationParentContextAttemptKind {
  Disabled = "disabled",
  Applied = "applied",
  Refused = "refused",
}

export enum CompensationParentContextRefusalReason {
  InvalidProgram = "invalidProgram",
  InvalidState = "invalidState",
  MissingRetention = "missingRetention",
  DuplicateRetention = "duplicateRetention",
  BrokenAncestry = "brokenAncestry",
  IncompleteContext = "incompleteContext",
  RecordCapacity = "recordCapacity",
  CanonicalByteCapacity = "canonicalByteCapacity",
}

export enum CompensationParentContextRootDisposition {
  Discard = "discard",
  RetainPromoted = "retainPromoted",
}

export type CompensationParentContextRefusal =
  | DeepReadonly<{
      reason:
        | CompensationParentContextRefusalReason.InvalidProgram
        | CompensationParentContextRefusalReason.InvalidState
        | CompensationParentContextRefusalReason.MissingRetention
        | CompensationParentContextRefusalReason.DuplicateRetention
        | CompensationParentContextRefusalReason.BrokenAncestry
        | CompensationParentContextRefusalReason.IncompleteContext;
    }>
  | DeepReadonly<{
      reason:
        | CompensationParentContextRefusalReason.RecordCapacity
        | CompensationParentContextRefusalReason.CanonicalByteCapacity;
      bound: number;
      prospective: number;
    }>;

export type CompensationParentContextAttempt =
  | DeepReadonly<{
      kind: CompensationParentContextAttemptKind.Disabled;
      state: import("./semantic-process-state.js").RuntimeState;
    }>
  | DeepReadonly<{
      kind: CompensationParentContextAttemptKind.Applied;
      state: import("./semantic-process-state.js").RuntimeState;
    }>
  | DeepReadonly<{
      kind: CompensationParentContextAttemptKind.Refused;
      state: import("./semantic-process-state.js").RuntimeState;
      detail: CompensationParentContextRefusal;
    }>;
