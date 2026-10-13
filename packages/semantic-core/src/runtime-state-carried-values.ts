import type { VariableBinding } from "./contract.js";
import type { CompensationParentContextSnapshot } from "./compensation-event-sub-process-snapshot-contract.js";
import { CompensationParentContextRetentionKind } from "./compensation-event-sub-process-snapshot-contract.js";
import type { CompensationHandlerExecution } from "./compensation-trigger-handler-runtime-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";

/**
 * Every variable patch a RuntimeState carries, in no semantic order.
 *
 * This is the single enumeration of value-carrying state paths: live scoped variables, open effect
 * arguments, and the compensation context snapshots that later feed handler effect arguments.
 * Multi-Instance controllers carry only String snapshot items and output slots, so they hold no
 * typed value. A new value-carrying RuntimeState field must be added here, or checks that read
 * carried values, such as restoration's profile eligibility, silently skip it.
 */
export function carriedVariablePatches(state: RuntimeState): ReadonlyArray<ReadonlyArray<VariableBinding>> {
  const { process, scopes, processInterfaces, activities } = state.variables;
  return [
    process.bindings,
    ...scopes.map(({ bindings }) => bindings),
    ...processInterfaces.flatMap(({ inputs, outputs }) => [inputs, outputs]),
    ...activities.map(({ bindings }) => bindings),
    ...state.effectWaits.map((wait) => wait.arguments),
    ...(state.compensationHandlerEffectWaits ?? []).map((wait) => wait.arguments),
    ...(state.compensationTriggers ?? []).flatMap(({ handlers }) => handlers.flatMap(handlerContextPatches)),
    ...(state.compensationParentContextRetentions ?? []).flatMap((retention) => {
      switch (retention.kind) {
        case CompensationParentContextRetentionKind.Provisional:
          return [];
        case CompensationParentContextRetentionKind.Promoted:
          return snapshotPatches(retention.snapshot);
        default:
          return assertNever(retention);
      }
    }),
  ];
}

function handlerContextPatches(handler: CompensationHandlerExecution): ReadonlyArray<ReadonlyArray<VariableBinding>> {
  switch (handler.lifecycle) {
    case "pending":
    case "compensating":
      return handler.restoredContext === null ? [] : snapshotPatches(handler.restoredContext);
    case "compensated":
    case "failed":
    case "terminated":
      return [];
    default:
      return assertNever(handler);
  }
}

function snapshotPatches(snapshot: CompensationParentContextSnapshot): ReadonlyArray<ReadonlyArray<VariableBinding>> {
  return snapshot.frames.map(({ bindings }) => bindings);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported carried-value state variant: ${JSON.stringify(value)}`);
}
