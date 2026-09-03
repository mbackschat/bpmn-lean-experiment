import type {
  EffectOccurrenceId,
  OccurrenceId,
  VariableBinding,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { EffectDefinitionKey } from "./effect-transport-material.js";
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
  definition: EffectDefinitionKey;
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  effectId: EffectOccurrenceId;
  descriptor: CompensationSingleEffectDescriptor;
  arguments: [] | [VariableBinding];
}>;

/** Projects definition identity and one committed Compensation handler effect wait. */
export function projectCompensationEffectTransportMaterial(
  program: import("./semantic-process-contract.js").SemanticProcessProgram,
  wait: CompensationHandlerEffectWait,
): CompensationEffectTransportMaterial {
  return {
    definition: {
      semanticProfile: program.identity.semanticProfile,
      sourceId: program.identity.sourceId,
      sourceSha256: program.identity.sourceSha256,
      sourceOverlay: program.identity.sourceOverlay,
      processId: program.processId,
    },
    triggerId: wait.triggerId,
    handlerId: wait.handlerId,
    effectId: wait.id,
    descriptor: wait.descriptor,
    arguments: wait.arguments,
  };
}
