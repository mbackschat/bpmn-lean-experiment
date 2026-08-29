/**
 * Locks each boundary-Timer family to its own admitted deadline at compile time.
 *
 * Five operation families arm the identical arm shape and two deadlines are admitted across them,
 * so the tempting shape is one arm type carrying the union. That spelling type-checks a program
 * holding a sibling family's number, which the reference interpreter refuses, and the disagreement
 * then surfaces only at runtime admission. The negatives below are the discriminator: each fails to
 * compile exactly because its family names one number rather than the union.
 */
import {
  SemanticOperationKind,
  SemanticOriginKind,
} from "../src/index.js";
import type {
  AwaitBoundedUserTaskOperation,
  AwaitSequentialMultiInstanceUserTaskOperation,
  BoundaryTimerArm,
} from "../src/index.js";

const boundedArm = {
  elementId: "Boundary_Deadline",
  durationMs: 1000,
  output: "place:Flow_Boundary",
  origin: {
    kind: SemanticOriginKind.BpmnSequenceFlow,
    elementId: "Flow_Boundary",
  },
} as const satisfies BoundaryTimerArm<1000>;

const multiInstanceArm = {
  ...boundedArm,
  durationMs: 5000,
} as const satisfies BoundaryTimerArm<5000>;

// @ts-expect-error a bounded User Task admits PT1S, so the Multi-Instance deadline is not its arm
const wrongBoundedArm: BoundaryTimerArm<1000> = multiInstanceArm;
// @ts-expect-error a Multi-Instance task admits PT5S, so the bounded deadline is not its arm
const wrongMultiInstanceArm: BoundaryTimerArm<5000> = boundedArm;
// @ts-expect-error an arm names its family's deadline; the cross-family union is not an arm type
const unionArm: BoundaryTimerArm = boundedArm;

const boundedTask = {
  id: "operation:BoundedTask",
  kind: SemanticOperationKind.AwaitBoundedUserTask,
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "BoundedTask" },
  input: "place:Flow_Start",
  task: {
    elementId: "BoundedTask",
    name: "Bounded work",
    output: "place:Flow_Normal",
  },
  // @ts-expect-error the Multi-Instance deadline is not admitted for a bounded User Task
  boundaryTimer: multiInstanceArm,
} as const satisfies AwaitBoundedUserTaskOperation;

// The positive side of the same fact: the operation types below name deadlines, so a reader can see
// that the negatives fail on the number rather than on some unrelated shape difference.
type BoundedDeadlineMs =
  AwaitBoundedUserTaskOperation["boundaryTimer"]["durationMs"];
type MultiInstanceDeadlineMs =
  AwaitSequentialMultiInstanceUserTaskOperation["boundaryTimer"]["durationMs"];

const boundedDeadlineMs: BoundedDeadlineMs = 1000;
const multiInstanceDeadlineMs: MultiInstanceDeadlineMs = 5000;

// The assignments above only prove each number belongs; these prove nothing else does. Assigning
// the extracted type back to the literal succeeds exactly when the family's arm carries that one
// number, so a re-widened arm fails here on the deadline itself rather than only on an
// `@ts-expect-error` line that an unrelated error would also satisfy. They are declared rather than
// initialized because a `const` with a union annotation narrows to its initializer, which would
// make the check read as the literal whatever the arm carried.
declare const extractedBoundedDeadlineMs: BoundedDeadlineMs;
declare const extractedMultiInstanceDeadlineMs: MultiInstanceDeadlineMs;
const boundedDeadlineIsOnlyOneNumber: 1000 = extractedBoundedDeadlineMs;
const multiInstanceDeadlineIsOnlyOneNumber: 5000 = extractedMultiInstanceDeadlineMs;

export type {
  BoundedDeadlineMs,
  MultiInstanceDeadlineMs,
};
export {
  boundedDeadlineIsOnlyOneNumber,
  boundedDeadlineMs,
  boundedTask,
  multiInstanceDeadlineIsOnlyOneNumber,
  multiInstanceDeadlineMs,
  unionArm,
  wrongBoundedArm,
  wrongMultiInstanceArm,
};
