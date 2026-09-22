import {
  canonicalUniqueInternalAlternatives,
  compareInternalAlternatives,
  internalOperationAlternative,
} from "./internal-transition-alternative.js";
import type { InternalAlternative } from "./internal-transition-alternative.js";
import {
  applyPreparedInternalTransition,
  deriveInternalTransitionPreparation,
  PreparedInternalTransitionFamily,
  preparedInternalTransitionsAreIndependent,
} from "./internal-transition-batch.js";
import type { PreparedInternalTransition } from "./internal-transition-batch.js";
import { deriveInternalExclusiveMergePreparations } from "./internal-transition-merge-preparation.js";
import { exclusiveMergeInputSelections } from "./semantic-process-cyclic-control-flow-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import type { AppliedInternalOperationStep } from "./semantic-process-runtime.js";
import { compareCanonicalStrings } from "./wire.js";

export type InternalExecutionOffer = Readonly<{
  alternative: InternalAlternative;
  step: AppliedInternalOperationStep;
  preparation: PreparedInternalTransition | null;
}>;

export type InternalExecutionFrontier<Refusal> = Readonly<{
  offers: ReadonlyArray<InternalExecutionOffer>;
  refusal: Refusal | null;
  preparationFailed: boolean;
}>;

/** Exact Merge offers must not disappear merely because the legacy evaluator requires one token. */
export function deriveInternalExecutionFrontier<Refusal>(
  program: SemanticProcessProgram,
  state: RuntimeState,
  attempt: (operation: SemanticOperation) => Readonly<{
    step: AppliedInternalOperationStep | null;
    refusal: Refusal | null;
  }>,
): InternalExecutionFrontier<Refusal> {
  const offers: InternalExecutionOffer[] = [];
  let preparationFailed = false;
  const operations = [...program.operations].sort((left, right) => compareCanonicalStrings(left.id, right.id));
  for (const operation of operations) {
    if (operation.kind === SemanticOperationKind.MergeExclusive && state.control.kind === ControlStateKind.Running) {
      const selections = exclusiveMergeInputSelections(operation, state);
      if (selections === null) { preparationFailed = true; continue; }
      if (selections.length === 0) continue;
      const prepared = deriveInternalExclusiveMergePreparations(program, state, operation);
      if (prepared !== null) {
        for (const member of prepared) {
          const preparation = { ...member, family: PreparedInternalTransitionFamily.MergeInput } as const;
          const successor = applyPreparedInternalTransition(program, state, preparation);
          if (successor === null) { preparationFailed = true; continue; }
          offers.push({ alternative: member.alternative, preparation,
            step: { operation, owner: member.owner, successor } });
        }
        continue;
      }
      // Snapshot-declaring Programs retain their existing unique-offer path, outside prepared batching.
      const legacy = program.compensationEventSubProcessSnapshots === undefined ? null : attempt(operation);
      if (legacy !== null) {
        if (legacy.refusal !== null) return { offers, refusal: legacy.refusal, preparationFailed };
        if (legacy.step !== null && selections.length === 1) {
          offers.push({ alternative: selections[0]!.alternative, step: legacy.step, preparation: null });
          continue;
        }
      }
      preparationFailed = true;
      continue;
    }
    const result = attempt(operation);
    if (result.refusal !== null) return { offers, refusal: result.refusal, preparationFailed };
    if (result.step !== null) offers.push({
      alternative: internalOperationAlternative(operation.id), step: result.step,
      preparation: deriveInternalTransitionPreparation(program, state, result.step),
    });
  }
  offers.sort((left, right) => compareInternalAlternatives(left.alternative, right.alternative));
  if (canonicalUniqueInternalAlternatives(offers.map(({ alternative }) => alternative)) === null) preparationFailed = true;
  return { offers, refusal: null, preparationFailed };
}

export enum InternalFrontierDisposition {
  Stable = "stable",
  IndependentBatch = "independentBatch",
  ObservableChoice = "observableChoice",
}

export type PreparedInternalFrontier = Readonly<
  | { kind: InternalFrontierDisposition.Stable }
  | {
      kind: InternalFrontierDisposition.IndependentBatch;
      members: ReadonlyArray<PreparedInternalTransition>;
    }
  | {
      kind: InternalFrontierDisposition.ObservableChoice;
      members: ReadonlyArray<PreparedInternalTransition>;
    }
>;

/** The approved complete-frontier rule normalizes only singleton operations independent of every offer. */
export function classifyPreparedInternalFrontier(
  prepared: ReadonlyArray<PreparedInternalTransition>,
): PreparedInternalFrontier | null {
  if (prepared.length === 0) return { kind: InternalFrontierDisposition.Stable };
  if (prepared.some(({ alternative, operation }) => alternative.operationId !== operation.id) ||
      canonicalUniqueInternalAlternatives(prepared.map(({ alternative }) => alternative)) === null) return null;
  const members = [...prepared].sort((left, right) => compareInternalAlternatives(left.alternative, right.alternative));
  const population = new Map<string, number>();
  for (const { operation } of members) population.set(operation.id, (population.get(operation.id) ?? 0) + 1);
  const independent = members.filter((candidate) => population.get(candidate.operation.id) === 1 &&
    members.every((other) => candidate === other || preparedInternalTransitionsAreIndependent(candidate, other)));
  return independent.length === 0
    ? { kind: InternalFrontierDisposition.ObservableChoice, members }
    : { kind: InternalFrontierDisposition.IndependentBatch, members: independent };
}
