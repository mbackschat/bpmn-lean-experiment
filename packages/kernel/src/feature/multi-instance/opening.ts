/**
 * Multi-Instance Activities: the instances to begin, transcribed from `Kernel/Feature/MultiInstance/Opening.lean`.
 *
 * Which slots of a Multi-Instance body begin now, under the loop's mode: every waiting one of a parallel body, the
 * first waiting one of a sequential body once none runs. `feature/multi-instance.ts` enters and begins the slots this
 * module names.
 */
import { MultiInstanceMode, assertNever } from "../../il/types.js";
import { IterationTag, type Iteration } from "../../state.js";

function waitingIndex(slot: Iteration, index: number): readonly number[] {
  switch (slot.tag) {
    case IterationTag.Waiting:
      return [index];
    case IterationTag.Active:
    case IterationTag.Completed:
      return [];
  }
  return assertNever(slot);
}

function isActive(slot: Iteration): boolean {
  switch (slot.tag) {
    case IterationTag.Active:
      return true;
    case IterationTag.Waiting:
    case IterationTag.Completed:
      return false;
  }
  return assertNever(slot);
}

/** The feature's one match on the mode; every mode-specific rule reads it. */
export function sequential(mode: MultiInstanceMode): boolean {
  switch (mode) {
    case MultiInstanceMode.Parallel:
      return false;
    case MultiInstanceMode.Sequential:
      return true;
  }
  return assertNever(mode);
}

/** The instances to begin now: every waiting one in parallel, else the first waiting one once none runs. */
export function opening(mode: MultiInstanceMode, instances: readonly Iteration[]): readonly number[] {
  const waiting = instances.flatMap(waitingIndex);
  if (!sequential(mode)) return waiting;
  return instances.some(isActive) ? [] : waiting.slice(0, 1);
}
