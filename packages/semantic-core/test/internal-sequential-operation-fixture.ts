import assert from "node:assert/strict";
import { SemanticOperationKind as Kind } from "@bpmn-lean/semantic-core";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";
import { reviewProgram } from "./sequential-multi-instance-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

export function sequentialOperationFromTask(
  original: Extract<SemanticOperation, { kind: Kind.AwaitUserTask }>, name: string,
) {
  const template = reviewProgram.operations.find(({ kind }) => kind === Kind.AwaitSequentialMultiInstanceUserTask);
  assert.ok(template?.kind === Kind.AwaitSequentialMultiInstanceUserTask);
  const boundary = controlPlace(`${name}_Review_Deadline`);
  const operation: Extract<SemanticOperation, { kind: Kind.AwaitSequentialMultiInstanceUserTask }> = {
    ...template, id: original.id, origin: original.origin, input: original.input, task: original.task,
    normalOutput: original.output,
    boundaryTimer: { ...template.boundaryTimer, elementId: `${name}_Deadline`,
      output: boundary.id, origin: boundary.origin },
  };
  const boundaryEnd = { ...operationBase(`${name}_Deadline_End`), kind: Kind.ReachNoneEnd, input: boundary.id } as const;
  return { operation, boundary, boundaryEnd };
}
