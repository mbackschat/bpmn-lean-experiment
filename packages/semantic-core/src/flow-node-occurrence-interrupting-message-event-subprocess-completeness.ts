import type { DeliverMessageStimulus } from "./contract.js";
import { sameMessageChannel } from "./message-channel.js";
import { SemanticFlowNodeOccurrenceAnchorKind } from "./flow-node-occurrence-lifecycle.js";
import {
  cancelledRegion, failCompleteness, instantOccurrence, lifecycleDelta,
  sameScope, uniqueDefinition,
} from "./flow-node-occurrence-publication-external-completeness.js";
import type { OpenOccurrence } from "./flow-node-occurrence-publication-external-completeness.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import { INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";

/** IMES-OBSERVE-01 is reconstructed from the bounded declaration and retained work, independently of runtime trigger selection. */
export function expectedEventSubProcessMessageLifecycle(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  stimulus: DeliverMessageStimulus,
  commandId: string,
  transitionIndex: number,
) {
  const declarations = program.interruptingMessageEventSubProcesses;
  const declaration = declarations?.[0];
  if (program.identity.semanticProfile !== INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID ||
      declarations?.length !== 1 || declaration === undefined ||
      declaration.startEventId !== stimulus.subscriptionId.elementId ||
      !sameMessageChannel(declaration.channel, stimulus.channel)) return failCompleteness();
  const parentDefinition = uniqueDefinition(program, declaration.parentScopeId);
  const handlerDefinition = uniqueDefinition(program, declaration.handlerScopeId);
  if (parentDefinition?.parentScopeId !== null || parentDefinition.originElementId !== program.processId ||
      handlerDefinition?.parentScopeId !== declaration.parentScopeId ||
      handlerDefinition.originElementId !== declaration.elementId) return failCompleteness();
  // The approved slice requires a pristine start and excludes repeated handlers, so these are first issuances.
  const parent = { processInstanceId: stimulus.subscriptionId.processInstanceId,
    definitionScopeId: declaration.parentScopeId, activation: 1 };
  const child = { ...parent, definitionScopeId: declaration.handlerScopeId };
  if (stimulus.subscriptionId.activation !== 1 || open.length < 1 || open.length > 2 ||
      !open.every((entry) => entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
        sameScope(entry.owner, parent) && entry.processId === program.processId &&
        program.operations.some((operation) => operation.kind === SemanticOperationKind.AwaitUserTask &&
          operation.task.elementId === entry.elementId && program.operationScopes.some((binding) =>
            binding.operationId === operation.id && binding.scopeId === parent.definitionScopeId)))) return failCompleteness();
  return lifecycleDelta([{
    anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: child },
    processId: program.processId, elementId: declaration.elementId, owner: parent,
  }], cancelledRegion(program, open, parent, true), [
    instantOccurrence(program.processId, declaration.startEventId, child),
  ], commandId, transitionIndex);
}
