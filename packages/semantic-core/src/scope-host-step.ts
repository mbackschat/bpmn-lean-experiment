/**
 * The steps of the scope host and exit, per the [scope host proposal](../../../docs/capsules/SCOPE-HOST-FLOW-LISTS-PROPOSAL.md#steps).
 * Transcribed independently by the Lean `scopeHostState?` and `completeDeclaredScopeOutputs?`.
 *
 * Each step is its work's legacy step aimed at the first place of its list, followed by a split that puts one token,
 * owned as the legacy token, on every place of the list. So a host or exit changes scopes, data and deadlines exactly
 * as its legacy operation does, and differs only in the tokens it leaves.
 */
import {
  type SemanticOperation,
  SemanticOperationKind,
  ScopeWorkKind,
} from "./semantic-process-contract.js";
import type { ScopeExitOperation, ScopeHostOperation } from "./scope-host-work.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import { addToken, removeToken, type RuntimeState, type ScopeOccurrenceId } from "./semantic-process-state.js";
import { applyTriggeredStartOutputs } from "./semantic-process-triggered-start.js";

type LegacyScopeStep = Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.EnterScope | SemanticOperationKind.CompleteScope }
>;

/** Applies a legacy operation as the runtime dispatch does, reporting the owner it selected. */
export type LegacyStepApplier = (
  legacy: LegacyScopeStep,
  captureOwner: (owner: ScopeOccurrenceId) => void,
) => RuntimeState | null;

/**
 * SCPH-HOST-01: the step of a host or exit. A `process` host initiates the root over every entry, as a triggered
 * Start initiates over its outputs. Any other input list than the work's own refuses the step.
 */
export function applyScopeHostStep(
  operation: ScopeHostOperation | ScopeExitOperation,
  state: RuntimeState,
  captureOwner: (owner: ScopeOccurrenceId) => void,
  applyLegacy: LegacyStepApplier,
): RuntimeState | null {
  const places = (operation.kind === SemanticOperationKind.Scope ? operation.entries : operation.outputs)
    .map(({ place }) => place);
  const [first] = places;
  if (first === undefined) return null;
  if (operation.kind === SemanticOperationKind.Scope && operation.work.kind === ScopeWorkKind.Process) {
    if (operation.inputs.length !== 0) return null;
    const root = state.scopeOccurrences.find(({ parent }) => parent === null)?.id;
    const initiated = applyTriggeredStartOutputs(places, state);
    if (initiated !== null && root !== undefined) captureOwner(root);
    return initiated;
  }
  const legacy = legacyStep(operation, first);
  if (legacy === null) return null;
  const captured: { owner?: ScopeOccurrenceId } = {};
  const stepped = applyLegacy(legacy, (owner) => {
    captured.owner = owner;
  });
  if (stepped === null || captured.owner === undefined) return null;
  const tokenOwner = onlyTokenOwner(stepped, first);
  if (tokenOwner === undefined) return null;
  captureOwner(captured.owner);
  return {
    ...stepped,
    controlTokens: places.reduce(
      (tokens, place) => addToken(tokens, place, tokenOwner),
      removeToken(stepped.controlTokens, first, tokenOwner),
    ),
  };
}

/** The legacy operation a `subProcess` host or an exit performs toward the first place of its list. */
function legacyStep(operation: ScopeHostOperation | ScopeExitOperation, first: string): LegacyScopeStep | null {
  if (operation.kind === SemanticOperationKind.ScopeExit) {
    return {
      id: operation.id,
      origin: operation.origin,
      kind: SemanticOperationKind.CompleteScope,
      scopeId: operation.scopeId,
      parentOutput: first,
    };
  }
  const [input, ...others] = operation.inputs;
  if (operation.work.kind !== ScopeWorkKind.SubProcess || input === undefined || others.length > 0) return null;
  return {
    id: operation.id,
    origin: operation.origin,
    kind: SemanticOperationKind.EnterScope,
    input,
    childEntry: first,
    childScopeId: operation.work.childScopeId,
  };
}
