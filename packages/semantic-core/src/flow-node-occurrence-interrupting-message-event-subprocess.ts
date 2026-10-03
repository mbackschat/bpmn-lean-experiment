import type { DeliverMessageStimulus } from "./contract.js";
import { candidateProcessId } from "./flow-node-occurrence-candidates.js";
import type { UnnumberedFlowNodeOccurrenceStart, SemanticFlowNodeOccurrenceAnchorKind } from "./flow-node-occurrence-lifecycle.js";
import { selectEventSubProcessMessageDelivery } from "./interrupting-message-event-subprocess-runtime.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeScopeOccurrence, RuntimeState } from "./semantic-process-state.js";

/** IMES-OBSERVE-01 binds an executing handler to its declaration instead of inventing an entry operation. */
export function eventSubProcessScopeIsDeclared(program: SemanticProcessProgram, occurrence: RuntimeScopeOccurrence): boolean {
  const parent = occurrence.parent;
  if (parent === null || parent.processInstanceId !== occurrence.id.processInstanceId) return false;
  const definitions = program.definitionScopes.filter(({ id }) => id === occurrence.id.definitionScopeId);
  const declarations = (program.interruptingMessageEventSubProcesses ?? []).filter(({ handlerScopeId }) =>
    handlerScopeId === occurrence.id.definitionScopeId);
  return declarations.length === 1 && definitions.length === 1 &&
    declarations[0]?.elementId === definitions[0]?.originElementId &&
    declarations[0]?.parentScopeId === parent.definitionScopeId &&
    definitions[0]?.parentScopeId === parent.definitionScopeId;
}

/** Trigger facts come from the selected predecessor listener and fresh child reservation, never a state difference. */
export function eventSubProcessTriggerOccurrences(program: SemanticProcessProgram, state: RuntimeState, stimulus: DeliverMessageStimulus) {
  const selected = selectEventSubProcessMessageDelivery(program, state, stimulus);
  if (selected === null) return null;
  const processId = candidateProcessId(program, state, selected.parent.id);
  if (processId === null || !eventSubProcessScopeIsDeclared(program, { id: selected.child, parent: selected.parent.id })) return null;
  const started: UnnumberedFlowNodeOccurrenceStart[] = [{
    anchor: { kind: "scope" as SemanticFlowNodeOccurrenceAnchorKind.Scope, id: selected.child },
    processId, elementId: selected.declaration.elementId, owner: selected.parent.id,
  }];
  return { parent: selected.parent, started, instantaneous: [{
    processId, elementId: selected.declaration.startEventId, owner: selected.child,
  }] };
}
