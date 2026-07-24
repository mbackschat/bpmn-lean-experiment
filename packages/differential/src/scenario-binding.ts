import type { Scenario } from "@bpmn-lean/semantic-core";

import { DifferentialTarget } from "./comparator.js";
import type { ValueDisagreement } from "./structural-diff.js";
import { firstValueDisagreement, isJsonRecord } from "./structural-diff.js";

/**
 * Verifier-side binding between an admitted neutral scenario and the scenario a
 * target reports having executed.
 *
 * Matching a scenario identity alone cannot establish that a target consumed the
 * admitted scenario content. A target that carries its own compiled-in copy of a
 * scenario keeps emitting results under an unchanged identity after the admitted
 * scenario bytes change, and a canonical command observation records only the
 * command identity and outcome, not the submitted payload. Requiring the target
 * to echo the scenario it executed closes that gap without granting the target
 * any expected result.
 */

export enum ScenarioBindingKind {
  Bound = "bound",
  Unbound = "unbound",
}

export enum ScenarioBindingIssueKind {
  MissingEcho = "missingEcho",
  ContentMismatch = "contentMismatch",
}

export type ScenarioBinding =
  | Readonly<{
      kind: ScenarioBindingKind.Bound;
      target: DifferentialTarget;
      scenarioId: string;
    }>
  | Readonly<{
      kind: ScenarioBindingKind.Unbound;
      target: DifferentialTarget;
      issue: ScenarioBindingIssueKind.MissingEcho;
    }>
  | Readonly<
      {
        kind: ScenarioBindingKind.Unbound;
        target: DifferentialTarget;
        issue: ScenarioBindingIssueKind.ContentMismatch;
      } & ValueDisagreement
    >;

export function verifyScenarioBinding(
  target: DifferentialTarget,
  admitted: Scenario,
  echoed: unknown,
): ScenarioBinding {
  if (!isJsonRecord(echoed)) {
    return {
      kind: ScenarioBindingKind.Unbound,
      target,
      issue: ScenarioBindingIssueKind.MissingEcho,
    };
  }

  const difference = firstValueDisagreement(admitted, echoed, "scenario");
  if (difference !== null) {
    return {
      kind: ScenarioBindingKind.Unbound,
      target,
      issue: ScenarioBindingIssueKind.ContentMismatch,
      ...difference,
    };
  }

  return {
    kind: ScenarioBindingKind.Bound,
    target,
    scenarioId: admitted.id,
  };
}

export function requireScenarioBinding(
  target: DifferentialTarget,
  admitted: Scenario,
  echoed: unknown,
): void {
  const binding = verifyScenarioBinding(target, admitted, echoed);
  if (binding.kind === ScenarioBindingKind.Bound) {
    return;
  }
  if (binding.issue === ScenarioBindingIssueKind.MissingEcho) {
    throw new TypeError(
      `${target} did not report the scenario it executed for ${admitted.id}`,
    );
  }
  throw new Error(
    `${target} executed different scenario content for ${admitted.id}: ` +
      `${binding.path} expected ${JSON.stringify(binding.expected)} ` +
      `but was ${JSON.stringify(binding.actual)}`,
  );
}
