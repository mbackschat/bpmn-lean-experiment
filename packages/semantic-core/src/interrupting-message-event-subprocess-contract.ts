import type { BoundaryInterruption } from "./checked-process-contract.js";
import type { MessageChannel } from "./semantic-value-contract.js";
import type { MessageSubscriptionId } from "./contract.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";

/** Declaration-owned entry keeps BPMN 2.0.2 §10.3.5 outside parent Sequence Flow. */
export type InterruptingMessageEventSubProcess = Readonly<{
  parentScopeId: string;
  handlerScopeId: string;
  elementId: string;
  startEventId: string;
  channel: MessageChannel;
  childEntry: string;
}>;

/** Checked source retains the interruption attribute and its owned entry Sequence Flow. */
export type CheckedInterruptingMessageEventSubProcess = Readonly<{
  parentScopeId: string;
  handlerScopeId: string;
  elementId: string;
  startEventId: string;
  channel: MessageChannel;
  interruption: BoundaryInterruption.Interrupting;
  childEntryFlowId: string;
}>;

/** A passive parent listener has no normal-flow output or executing child occurrence (§13.5.4). */
export type EventSubProcessMessageSubscription = Readonly<{
  id: MessageSubscriptionId;
  owner: ScopeOccurrenceId;
  channel: MessageChannel;
}>;
