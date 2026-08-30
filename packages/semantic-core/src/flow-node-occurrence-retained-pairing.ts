/**
 * The retained half of the Activity occurrence record, for consumers that hold no runtime state.
 *
 * One owner for a derivation three consumers need and none may reimplement: the Workflow accumulator
 * retains it when a body occurrence opens, the continuation decoder recomputes it to refuse a forged
 * pairing, and the publication completeness relation reads the retained copy because it sees no
 * semantic state at all.
 *
 * It exists because the alternative is an activation-ordinal join. Pairing a boundary Timer to its
 * host by ordinal equality holds only while an Activity is armed once per body, and body turnover is
 * exactly the state where that fails: the host advances and its deadline does not, so the ordinal
 * matches nothing and a correct publication is refused.
 */
import {
  activityOccurrenceForScopeBody,
  activityOccurrenceForTaskBody,
} from "./activity-occurrence.js";
import type { ActivityHandlerOccurrence } from "./activity-occurrence.js";
import { SemanticFlowNodeOccurrenceAnchorKind } from "./flow-node-occurrence-lifecycle.js";
import type { SemanticFlowNodeOccurrenceAnchor } from "./flow-node-occurrence-lifecycle.js";
import type { RuntimeState } from "./semantic-process-state.js";

/**
 * The handler occurrences the Activity occurrence record lists for one body anchor.
 *
 * Empty for every anchor no record lists. A `CallActivity` or `Transition` anchor is never an Activity
 * body, so neither is looked up rather than being looked up and missing.
 */
export function attachedHandlersForBodyAnchor(
  state: RuntimeState,
  anchor: SemanticFlowNodeOccurrenceAnchor,
): ReadonlyArray<ActivityHandlerOccurrence> {
  switch (anchor.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
      return activityOccurrenceForTaskBody(state.activityOccurrences, anchor.id)
        ?.attachedHandlers ?? [];
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return activityOccurrenceForScopeBody(state.activityOccurrences, anchor.id)
        ?.attachedHandlers ?? [];
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return [];
  }
}
