import { sameActivityOccurrence } from "./activity-occurrence.js";
import {
  activeParallelInstanceCount,
} from "./parallel-multi-instance-controller.js";
import {
  parallelMultiInstanceBindingsForState,
} from "./parallel-multi-instance-binding.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";
import {
  RuntimeStateDefect,
  type RuntimeStateDefect as RuntimeStateDefectCode,
} from "./runtime-state-defect.js";

export type ParallelMultiInstanceStateDefects = Readonly<{
  controllerUnowned: boolean;
  duplicateController: boolean;
  bindingMismatch: boolean;
  exhausted: boolean;
}>;

/** The controller defect facts decidable from one committed state and its complete program. */
export function parallelMultiInstanceStateDefects(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ParallelMultiInstanceStateDefects {
  const controllers = state.parallelMultiInstanceControllers ?? [];
  const controllerUnowned = controllers.some((controller) =>
    state.activityOccurrences.filter((record) =>
      sameActivityOccurrence(record.id, controller.id)
    ).length !== 1
  );
  const duplicateController = controllers.some((controller, index) =>
    controllers.some((other, otherIndex) =>
      index !== otherIndex && sameActivityOccurrence(controller.id, other.id)
    )
  );
  const programDeclaresParallelMultiInstance = program.operations.some(({ kind }) =>
    kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  return {
    controllerUnowned,
    duplicateController,
    bindingMismatch:
      !controllerUnowned &&
      !duplicateController &&
      programDeclaresParallelMultiInstance &&
      parallelMultiInstanceBindingsForState(program, state) === undefined,
    exhausted: controllers.some((controller) =>
      activeParallelInstanceCount(controller) === 0
    ),
  };
}

export function parallelMultiInstanceStateDefectCodes(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<RuntimeStateDefectCode> {
  if (state.parallelMultiInstanceControllers === undefined) {
    return [];
  }
  const facts = parallelMultiInstanceStateDefects(program, state);
  return [
    ...(facts.controllerUnowned
      ? [RuntimeStateDefect.ParallelMultiInstanceControllerUnowned]
      : []),
    ...(facts.duplicateController
      ? [RuntimeStateDefect.DuplicateParallelMultiInstanceController]
      : []),
    ...(facts.bindingMismatch
      ? [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch]
      : []),
    ...(facts.exhausted
      ? [RuntimeStateDefect.ParallelMultiInstanceExhausted]
      : []),
  ];
}
