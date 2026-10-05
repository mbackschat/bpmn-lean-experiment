/** Composition root for declared Multi-Instance body projections. */
import type { OpenMultiInstance } from "./contract.js";
import { projectOpenParallelMultiInstances } from "./parallel-multi-instance-observation.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { projectOpenMultiInstances as projectOpenSequentialMultiInstances } from "./sequential-multi-instance-observation.js";
import { projectOpenSequentialScopeMultiInstances } from "./sequential-scope-observation.js";
import { compareCanonicalStrings } from "./wire.js";

function compareProgress(
  left: OpenMultiInstance,
  right: OpenMultiInstance,
): number {
  return compareCanonicalStrings(
      left.id.processInstanceId,
      right.id.processInstanceId,
    ) ||
    compareCanonicalStrings(
      left.id.activityElementId,
      right.id.activityElementId,
    ) ||
    left.id.activation - right.id.activation;
}

export function projectOpenMultiInstances(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<OpenMultiInstance> | undefined | null {
  const sequential = projectOpenSequentialMultiInstances(program, state);
  const parallel = projectOpenParallelMultiInstances(program, state);
  const scopes = projectOpenSequentialScopeMultiInstances(program, state);
  if (sequential === null || parallel === null || scopes === null) return null;
  if (sequential === undefined && parallel === undefined && scopes === undefined) return undefined;
  const combined = [...(sequential ?? []), ...(parallel ?? []), ...(scopes ?? [])].sort(
    compareProgress,
  );
  return combined.every((entry, index) =>
      index === 0 || compareProgress(combined[index - 1]!, entry) < 0
    )
    ? combined
    : null;
}
