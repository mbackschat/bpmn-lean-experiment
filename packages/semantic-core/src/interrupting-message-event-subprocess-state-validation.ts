import { interruptingMessageEventSubProcessProgramGraph } from "./interrupting-message-event-subprocess-program-admission.js";
import { sameMessageChannel } from "./message-channel.js";
import { isPristineRuntimeState } from "./pristine-runtime-state.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind, sameOccurrence, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";

/** IMES-ARM/TRIGGER/EXPIRE constrain stored phases; history and context frames remain transition laws. */
export function interruptingMessageEventSubProcessStateIsValid(program: SemanticProcessProgram, state: RuntimeState): boolean {
  if (program.identity.semanticProfile !== INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID) {
    return program.interruptingMessageEventSubProcesses === undefined &&
      state.eventSubProcessMessageSubscriptions === undefined;
  }
  if (!interruptingMessageEventSubProcessProgramGraph(program)) return false;
  if (state.control.kind === ControlStateKind.NotStarted) return isPristineRuntimeState(state);
  const subscriptions = state.eventSubProcessMessageSubscriptions;
  const declaration = program.interruptingMessageEventSubProcesses?.[0];
  if (subscriptions === undefined || subscriptions.length > 1 || declaration === undefined ||
      state.messageWaits.length !== 0 || state.timerWaits.length !== 0 || state.effectWaits.length !== 0 ||
      state.effectIncidents.length !== 0 || state.selectedBranchSets.length !== 0 || state.eventRaces.length !== 0 ||
      state.calledProcessOccurrences.length !== 0 || state.variables.process.bindings.length !== 0 ||
      state.variables.scopes.length !== 0 || state.variables.activities.length !== 0 || state.variables.processInterfaces.length !== 0 ||
      state.sequentialMultiInstanceControllers !== undefined || state.parallelMultiInstanceControllers !== undefined ||
      state.compensationActivityRetentions !== undefined || state.compensationParentContextRetentions !== undefined ||
      state.compensationTriggers !== undefined || state.compensationHandlerEffectWaits !== undefined) return false;
  if (state.control.kind !== ControlStateKind.Running) {
    return subscriptions.length === 0 && state.scopeOccurrences.length === 0 && state.controlTokens.length === 0 &&
      state.userTaskWaits.length === 0 && state.activityOccurrences.length === 0 && !state.initiationPending;
  }
  const root = { processInstanceId: state.control.instanceId, definitionScopeId: declaration.parentScopeId, activation: 1 };
  const parents = state.scopeOccurrences.filter(({ id, parent }) => sameScopeOccurrence(id, root) && parent === null);
  const children = state.scopeOccurrences.filter(({ id }) => id.definitionScopeId === declaration.handlerScopeId);
  const child = children[0];
  if (parents.length !== 1 || children.length > 1 || state.scopeOccurrences.length !== 1 + children.length ||
      counter(state.scopeActivations, root.definitionScopeId) !== 1 ||
      counter(state.messageActivations, declaration.startEventId) !== 1) return false;
  const childIssued = counter(state.scopeActivations, declaration.handlerScopeId);
  if (childIssued !== 0 && childIssued !== 1) return false;
  if (child !== undefined && (child.parent === null || !sameScopeOccurrence(child.parent, root) ||
      child.id.processInstanceId !== root.processInstanceId || child.id.activation !== 1 || childIssued !== 1)) return false;
  const ordinaryWork = state.initiationPending || state.controlTokens.some(({ owner }) => sameScopeOccurrence(owner, root)) ||
    state.userTaskWaits.some(({ owner }) => sameScopeOccurrence(owner, root)) ||
    state.activityOccurrences.some(({ owner }) => sameScopeOccurrence(owner, root));
  if ((child !== undefined || childIssued === 1) && ordinaryWork) return false;
  const subscription = subscriptions[0];
  if (subscription === undefined) return !ordinaryWork;
  return child === undefined && childIssued === 0 && sameScopeOccurrence(subscription.owner, root) &&
    sameOccurrence(subscription.id, { processInstanceId: root.processInstanceId, elementId: declaration.startEventId, activation: 1 }) &&
    sameMessageChannel(subscription.channel, declaration.channel);
}

function counter(counters: RuntimeState["scopeActivations"], elementId: string): number | undefined {
  const matches = counters.filter((entry) => entry.elementId === elementId);
  return matches.length === 0 ? 0 : matches.length === 1 ? matches[0]?.count : undefined;
}
