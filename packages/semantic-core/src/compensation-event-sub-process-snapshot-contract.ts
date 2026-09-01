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
