/**
 * The parts of a unit key, transcribed from `Kernel/State/Root.lean`: the roots a closure's unit chain starts at
 * (`UnitRoot`) and the steps down it (`UnitStep`), their ranks and the step order and code. A root names a committed
 * identity by its key text here, where Lean names it by its committed form (`CommittedSegment`, `CommittedOccurrence`), so
 * the root type, the root order that reads that text and the root's text stay with the scope keys in `key.ts`.
 */
import { assertNever } from "../il/types.js";

/**
 * Lean's `UnitStep`: one step down a closure's unit chain, the `index`th signal or token the unit above queued; or the
 * idle check of the scope occurrence, the `round`th offer of the parked occurrence, or the `ordinal`th finish of the
 * Multi-Instance body holding its instances in the scope occurrence (DC30), that the unit above issued as its `index`th
 * issue (DC12).
 */
export enum UnitStepTag { Signal = "signal", Token = "token", Idle = "idle", Offer = "offer", Finish = "finish" }
export type UnitStep =
  | Readonly<{ tag: UnitStepTag.Signal | UnitStepTag.Token | UnitStepTag.Idle; index: number }>
  | Readonly<{ tag: UnitStepTag.Offer; index: number; round: number }>
  | Readonly<{ tag: UnitStepTag.Finish; index: number; ordinal: number }>;

/** Lean's `UnitStep.stepRank`: signals, tokens, idle checks, offers, then finishes, each by index, then round or ordinal. */
export function unitStepRank(step: UnitStep): readonly [number, number, number] {
  switch (step.tag) {
    case UnitStepTag.Signal:
      return [0, step.index, 0];
    case UnitStepTag.Token:
      return [1, step.index, 0];
    case UnitStepTag.Idle:
      return [2, step.index, 0];
    case UnitStepTag.Offer:
      return [3, step.index, step.round];
    case UnitStepTag.Finish:
      return [4, step.index, step.ordinal];
  }
  return assertNever(step);
}

export function compareUnitStep(left: UnitStep, right: UnitStep): number {
  const [a, b] = [unitStepRank(left), unitStepRank(right)];
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Lean's `UnitRoot`: where a closure's unit chain starts (DC4), a structured root no element can take the name of. An
 * idle, offer or finish root names a committed identity, held as its key text, all of whose issues are committed; the
 * idle check, offer or finish of an identity issued in the closure is a step below its issuer (`UnitStepTag.Idle`,
 * `.Offer`, `.Finish`). A finish root (DC30) names the scope occurrence holding a Multi-Instance body's instances, the
 * body's element and the number of the body's finishes the closure queued before it.
 */
export enum UnitRootTag { Seed = "seed", Input = "input", Idle = "idle", Offer = "offer", Finish = "finish" }

/** Lean's `UnitRoot.rootRank`. */
export function rootRank(root: Readonly<{ tag: UnitRootTag }>): number {
  const tag = root.tag;
  switch (tag) {
    case UnitRootTag.Seed:
      return 0;
    case UnitRootTag.Input:
      return 1;
    case UnitRootTag.Idle:
      return 2;
    case UnitRootTag.Offer:
      return 3;
    case UnitRootTag.Finish:
      return 4;
  }
  return assertNever(tag);
}

/** Lean's `cantorPair`: the Cantor pairing of `index` and `round`, a bijection of pairs of naturals onto the naturals. */
function cantorPair(index: bigint, round: bigint): bigint {
  return (index + round) * (index + round + 1n) / 2n + round;
}

/**
 * Lean's `UnitStep.stepCode`: its kind's rank, below 5, beside the Cantor pair of its index and round, so distinct steps
 * have distinct codes. In `bigint`, as Lean's `Nat`, so no index loses precision before the cast mod 2^64.
 */
export function unitStepCode(step: UnitStep): bigint {
  const [rank, index, round] = unitStepRank(step);
  return 5n * cantorPair(BigInt(index), BigInt(round)) + BigInt(rank);
}
