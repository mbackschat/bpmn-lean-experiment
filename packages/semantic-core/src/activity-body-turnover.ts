/**
 * Body turnover: replacing what an Activity occurrence owns without replacing the occurrence.
 *
 * The contract is [the approved proposal](../../../docs/ACTIVITY-BODY-TURNOVER-PROPOSAL.md), rules
 * `AOO-TURNOVER-02` through `AOO-TURNOVER-04`. Turnover is one whole-state step by requirement, not
 * by convenience: the intermediate state in which the outgoing body is withdrawn and the incoming one
 * is not yet armed satisfies no well-formedness conjunct that mentions a body, so exposing it would
 * make the preservation law vacuous on its own hypothesis.
 *
 * No registered profile admits a construct that drives this yet. It is the representation a later
 * repetition capsule defines transitions over, and it lives here rather than in that capsule because
 * approving it is what makes the record's value checkable: after a replacement the body's activation
 * and its attached handler's diverge, which is the pair every join this account retired was keyed on.
 */
import {
  ActivityBodyKind,
  activityBodyTask,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import {
  compareUserTaskWaits,
  nextActivation,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/**
 * Replaces a task-bodied Activity occurrence's body with a fresh occurrence of the same element.
 *
 * Returns `null` rather than a repaired state unless the record is held by this state and names
 * *exactly one* live task body. The three refusals are different: a record the state does not hold
 * would leave the replacement owned by nothing, no matching wait means the body is already gone, and
 * more than one means the state is ambiguous in the way `waitIdentitiesUnique` refuses. A caller that silently
 * continued would arm a second body against a record still naming the first.
 *
 * The incoming wait carries the outgoing wait's `name` and `output` because both describe the same
 * program element; nothing here reads the Program, which is what keeps the operation total over
 * runtime state alone. A capsule that varies those per iteration supplies them at its own boundary.
 *
 * The Activity's own counter is deliberately untouched: the occurrence is not re-armed, so advancing
 * it would mint an identity no record claims.
 */
export function replaceActivityBodyTask(
  state: RuntimeState,
  record: ActivityOccurrence,
): RuntimeState | null {
  const outgoing = activityBodyTask(record);
  if (outgoing === undefined) return null;
  // A record the state does not hold would otherwise have its wait withdrawn and a successor armed
  // while no record names either, because the rewrite below matches nothing. Lean excludes this case
  // through its sole-claimant hypothesis; refusing it here keeps the two domains the same.
  if (!state.activityOccurrences.some((candidate) =>
    sameActivityOccurrence(candidate.id, record.id)
  )) return null;
  // Exactly one match, not the first: a state where two waits share the body key is the one
  // `waitIdentitiesUnique` refuses, and repairing it here would arm a replacement against an
  // ambiguity the caller never learns about. The Lean operation refuses the same shape.
  const live = state.userTaskWaits.filter(({ id }) => sameOccurrence(id, outgoing));
  const [wait] = live;
  if (live.length !== 1 || wait === undefined) return null;

  const activation = nextActivation(state.taskActivations, outgoing.elementId);
  const incoming = {
    processInstanceId: outgoing.processInstanceId,
    elementId: outgoing.elementId,
    activation,
  } as const;

  return {
    ...state,
    userTaskWaits: [
      ...state.userTaskWaits.filter(({ id }) => !sameOccurrence(id, outgoing)),
      { ...wait, id: incoming },
    ].sort(compareUserTaskWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      outgoing.elementId,
      activation,
    ),
    activityOccurrences: state.activityOccurrences.map((candidate) =>
      sameActivityOccurrence(candidate.id, record.id)
        // The arm is written out rather than spread over the existing body: a spread would type-check
        // against a child-scope body too and produce a union member with both `scope` and `task`.
        ? { ...candidate, body: { kind: ActivityBodyKind.UserTask, task: incoming } as const }
        : candidate
    ).sort(compareActivityOccurrences),
  };
}
