import { sameActivityOccurrence } from "./activity-occurrence.js";
import { MultiInstanceBodyKind, VariableValueKind } from "./contract.js";
import type { OccurrenceId, OpenSequentialSubProcessMultiInstance } from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { sequentialScopeBindingForEntry } from "./sequential-scope-binding.js";
import { compareCanonicalStrings } from "./wire.js";

function interactionIds(waits: readonly { id: OccurrenceId; owner: ScopeOccurrenceId }[],
  body: ScopeOccurrenceId): OccurrenceId[] | null {
  const ids = waits.filter(({ owner }) => sameScopeOccurrence(owner, body)).map(({ id }) => id);
  const compare = (left: OccurrenceId, right: OccurrenceId) =>
    compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) || left.activation - right.activation;
  ids.sort(compare);
  return ids.every((id, index) => id.processInstanceId === body.processInstanceId &&
    (index === 0 || compare(ids[index - 1]!, id) < 0)) ? ids : null;
}

/** SMIS-PUBLISH-01 takes membership from the exact current body, never a prior publication or host history. */
export function projectOpenSequentialScopeMultiInstances(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState): readonly OpenSequentialSubProcessMultiInstance[] | undefined | null {
  const entries = program.operations.filter(operation => operation.kind === SemanticOperationKind.EnterSequentialMultiInstanceScope);
  if (entries.length === 0) return undefined;
  const controllers = state.sequentialScopeControllers ?? [];
  const entryIds = new Set(entries.map(({ id }) => id));
  if (state.activityOccurrences.filter(({ operationId }) => entryIds.has(operationId)).length !== controllers.length) return null;
  const result: OpenSequentialSubProcessMultiInstance[] = [];
  for (const controller of controllers) {
    const declarations = entries.filter(entry => entry.origin.elementId === controller.id.activityElementId);
    const entry = declarations[0];
    if (declarations.length !== 1 || entry === undefined) return null;
    const binding = sequentialScopeBindingForEntry(entry, state);
    if (binding === undefined || !sameActivityOccurrence(binding.controller.id, controller.id)) return null;
    const userTaskIds = interactionIds(state.userTaskWaits, binding.body.id);
    const effectIds = interactionIds(state.effectWaits, binding.body.id);
    if (userTaskIds === null || effectIds === null) return null;
    const generated = controller.completed + 1;
    result.push({
      id: controller.id, mode: "sequential", bodyKind: MultiInstanceBodyKind.SubProcess,
      plannedInstanceCount: controller.total, pendingItemCount: controller.total - generated,
      numberOfInstances: generated, numberOfActiveInstances: 1,
      numberOfCompletedInstances: controller.completed, numberOfTerminatedInstances: 0,
      activeIterations: [{ loopCounter: controller.completed, body: binding.body.id,
        item: { name: entry.itemName, value: { kind: VariableValueKind.String, value: controller.currentItem } },
        bindings: binding.locals.bindings, userTaskIds, effectIds }],
    });
  }
  return result;
}
