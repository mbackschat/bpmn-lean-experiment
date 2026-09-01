import type { DeepReadonly } from "./deep-readonly.js";

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
