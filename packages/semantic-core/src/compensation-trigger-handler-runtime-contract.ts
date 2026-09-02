import type {
  EffectOccurrenceId,
  OccurrenceId,
  VariableBinding,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import type { CompensationParentContextSnapshot } from "./compensation-event-sub-process-snapshot-contract.js";
import type { CompensationSingleEffectDescriptor } from "./compensation-trigger-handler-contract.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";

export type CompensationSubjectOccurrence =
  | DeepReadonly<{
      kind: "boundaryActivity";
      activity: ActivityOccurrenceId;
    }>
  | DeepReadonly<{
      kind: "eventSubProcess";
      parent: ScopeOccurrenceId;
    }>;

export type CompensationHandlerIdentity = DeepReadonly<{
  id: OccurrenceId;
  subject: CompensationSubjectOccurrence;
  handlerElementId: string;
}>;

export type CompensationHandlerExecution = CompensationHandlerIdentity &
  (
    | DeepReadonly<{
        lifecycle: "pending";
        restoredContext: CompensationParentContextSnapshot | null;
      }>
    | DeepReadonly<{
        lifecycle: "compensating";
        restoredContext: CompensationParentContextSnapshot | null;
        effectId: EffectOccurrenceId;
      }>
    | DeepReadonly<{
        lifecycle: "compensated" | "failed" | "terminated";
      }>
  );

export type CompensationOccurrenceDependency = DeepReadonly<{
  predecessor: CompensationSubjectOccurrence;
  successor: CompensationSubjectOccurrence;
  reason: "sequenceFlow";
}>;

export type CompensationTriggerExecution = DeepReadonly<{
  id: OccurrenceId;
  owner: ScopeOccurrenceId;
  output: string;
  lifecycle: "active" | "succeeded" | "failed";
  handlers: CompensationHandlerExecution[];
  dependencies: CompensationOccurrenceDependency[];
}>;

export type CompensationHandlerEffectWait = DeepReadonly<{
  id: EffectOccurrenceId;
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  descriptor: CompensationSingleEffectDescriptor;
  arguments: [] | [VariableBinding];
}>;

export type CompensationEffectTransportMaterial = DeepReadonly<{
  definition: import("./semantic-process-contract.js").SemanticProcessIdentity;
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  effectId: EffectOccurrenceId;
  descriptor: CompensationSingleEffectDescriptor;
  arguments: [] | [VariableBinding];
}>;
