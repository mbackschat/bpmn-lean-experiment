import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { addToken, compareScopeOccurrenceIds, ControlStateKind, sameOccurrence, sameScopeOccurrence, setActivationCount } from "./semantic-process-state.js";
import type { RuntimeScopeOccurrence, RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { isScopeOccurrenceQuiescent, selectChildScopeEntry } from "./semantic-process-scope-runtime.js";
import { removeScopeOccurrenceContents } from "./semantic-process-scope-cancellation.js";
import { sameMessageChannel } from "./message-channel.js";
import { StimulusKind } from "./contract.js";
import type { DeliverMessageStimulus } from "./contract.js";
import type { EventSubProcessMessageSubscription, InterruptingMessageEventSubProcess } from "./interrupting-message-event-subprocess-contract.js";
import { INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";

/** IMES-ARM-01 attaches the listener to an already reserved parent in the atomic start command. */
export function armEventSubProcessMessageSubscriptions(
  program: SemanticProcessProgram,
  state: RuntimeState,
  parent: ScopeOccurrenceId,
): RuntimeState | null {
  const declarations = program.interruptingMessageEventSubProcesses;
  if (declarations === undefined) return state;
  const declaration = declarations[0];
  if (program.identity.semanticProfile !== INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID ||
      declarations.length !== 1 || declaration === undefined || declaration.parentScopeId !== parent.definitionScopeId ||
      state.control.kind !== ControlStateKind.Running || state.control.instanceId !== parent.processInstanceId ||
      state.eventSubProcessMessageSubscriptions !== undefined ||
      state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, parent)).length !== 1 ||
      state.scopeOccurrences.some(({ id }) => id.definitionScopeId === declaration.handlerScopeId)) return null;
  const counters = state.messageActivations.filter(({ elementId }) => elementId === declaration.startEventId);
  if (counters.length > 1) return null;
  const activation = (counters[0]?.count ?? 0) + 1;
  if (!Number.isSafeInteger(activation) || activation <= 0) return null;
  const id = { processInstanceId: parent.processInstanceId, elementId: declaration.startEventId, activation };
  if (state.messageWaits.some((wait) => sameOccurrence(wait.id, id))) return null;
  return { ...state,
    messageActivations: setActivationCount(state.messageActivations, declaration.startEventId, activation),
    eventSubProcessMessageSubscriptions: [{ id, owner: parent, channel: declaration.channel }],
  };
}

export type SelectedEventSubProcessMessageDelivery = Readonly<{
  subscription: EventSubProcessMessageSubscription;
  declaration: InterruptingMessageEventSubProcess;
  parent: RuntimeScopeOccurrence;
  child: ScopeOccurrenceId;
}>;

/** Selection precedes cleanup so stale addressing or exhausted child identity cannot partially interrupt work. */
export function selectEventSubProcessMessageDelivery(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: DeliverMessageStimulus,
): SelectedEventSubProcessMessageDelivery | null {
  if (stimulus.kind !== StimulusKind.DeliverMessage || state.control.kind !== ControlStateKind.Running) return null;
  const subscriptions = (state.eventSubProcessMessageSubscriptions ?? []).filter(({ id }) => sameOccurrence(id, stimulus.subscriptionId));
  const subscription = subscriptions[0];
  if (subscriptions.length !== 1 || subscription === undefined ||
      !sameMessageChannel(subscription.channel, stimulus.channel) ||
      state.messageWaits.some(({ id }) => sameOccurrence(id, subscription.id))) return null;
  const declarations = (program.interruptingMessageEventSubProcesses ?? []).filter((declaration) =>
    declaration.startEventId === subscription.id.elementId && declaration.parentScopeId === subscription.owner.definitionScopeId &&
    sameMessageChannel(declaration.channel, subscription.channel));
  const declaration = declarations[0];
  const parents = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, subscription.owner));
  const parent = parents[0];
  if (declarations.length !== 1 || declaration === undefined || parents.length !== 1 || parent === undefined ||
      subscription.id.processInstanceId !== parent.id.processInstanceId || parent.id.processInstanceId !== state.control.instanceId ||
      state.scopeActivations.filter(({ elementId }) => elementId === declaration.handlerScopeId).length > 1) return null;
  const selected = selectChildScopeEntry(state, parent.id, { childScopeId: declaration.handlerScopeId });
  if (selected === null || !Number.isSafeInteger(selected.child.activation) || selected.child.activation <= 0) return null;
  return { subscription, declaration, parent, child: selected.child };
}

/** IMES-TRIGGER-01 removes the old region before creating the fresh handler, retaining the parent context. */
export function deliverEventSubProcessMessage(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: DeliverMessageStimulus,
): RuntimeState | null {
  const selected = selectEventSubProcessMessageDelivery(program, state, stimulus);
  if (selected === null) return null;
  const cleaned = removeScopeOccurrenceContents(state, selected.parent);
  return { ...cleaned,
    controlTokens: addToken(cleaned.controlTokens, selected.declaration.childEntry, selected.child),
    scopeOccurrences: [...cleaned.scopeOccurrences, { id: selected.child, parent: selected.parent.id }]
      .sort(({ id: left }, { id: right }) => compareScopeOccurrenceIds(left, right)),
    scopeActivations: setActivationCount(cleaned.scopeActivations, selected.child.definitionScopeId, selected.child.activation),
  };
}

type HandlerCompletion = Extract<SemanticOperation, { kind: SemanticOperationKind.CompleteEventSubProcess }>;

/** BPMN 2.0.2 §13.5.4 ends a triggered handler without an ordinary parent continuation. */
export function selectEventSubProcessCompletion(
  program: SemanticProcessProgram,
  operation: HandlerCompletion,
  state: RuntimeState,
): RuntimeScopeOccurrence | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  const declarations = (program.interruptingMessageEventSubProcesses ?? []).filter(({ handlerScopeId }) => handlerScopeId === operation.scopeId);
  const declaration = declarations[0];
  if (declarations.length !== 1 || declaration === undefined ||
      declaration.elementId !== operation.origin.elementId) return null;
  const definitions = program.definitionScopes.filter(({ id }) => id === declaration.handlerScopeId);
  if (definitions.length !== 1 || definitions[0]?.originElementId !== declaration.elementId ||
      definitions[0].parentScopeId !== declaration.parentScopeId ||
      program.definitionScopes.filter(({ id }) => id === declaration.parentScopeId).length !== 1) return null;
  const children = state.scopeOccurrences.filter(({ id }) => id.definitionScopeId === operation.scopeId);
  const child = children[0];
  if (children.length !== 1 || child === undefined || child.parent === null ||
      child.id.processInstanceId !== state.control.instanceId ||
      child.parent.processInstanceId !== child.id.processInstanceId ||
      child.parent.definitionScopeId !== declaration.parentScopeId ||
      !isScopeOccurrenceQuiescent(state, child)) return null;
  const parent = child.parent;
  return state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, parent)).length === 1 ? child : null;
}

export function completeEventSubProcess(
  program: SemanticProcessProgram,
  operation: HandlerCompletion,
  state: RuntimeState,
): RuntimeState | null {
  const child = selectEventSubProcessCompletion(program, operation, state);
  return child === null ? null : {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter((occurrence) => occurrence !== child),
  };
}
