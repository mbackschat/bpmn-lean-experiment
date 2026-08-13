import assert from "node:assert/strict";
import test from "node:test";

import { CommandOutcome } from "@bpmn-lean/semantic-core";
import {
  ProcessCommandResultKind,
  classifyConcurrentCompletionResults,
} from "@bpmn-lean/temporal-testkit";
import type { ProcessCommandResult } from "@bpmn-lean/temporal-testkit";

const committed = {
  kind: ProcessCommandResultKind.Semantic,
  commandId: "commit",
  outcome: CommandOutcome.Committed,
} as const;

const rejected = {
  kind: ProcessCommandResultKind.Semantic,
  commandId: "reject",
  outcome: CommandOutcome.Rejected,
} as const;

const closed = {
  kind: ProcessCommandResultKind.ProcessClosed,
  commandId: "closed",
  receipt: {},
} as unknown as Extract<
  ProcessCommandResult,
  { kind: ProcessCommandResultKind.ProcessClosed }
>;

test("concurrent completion evidence retains accepted and pre-acceptance closure arms", () => {
  assert.deepEqual(
    classifyConcurrentCompletionResults([committed, rejected]),
    {
      completionOutcomes: [
        CommandOutcome.Committed,
        CommandOutcome.Rejected,
      ],
      completionClosureResults: [],
    },
  );
  assert.deepEqual(
    classifyConcurrentCompletionResults([committed, closed]),
    {
      completionOutcomes: [CommandOutcome.Committed],
      completionClosureResults: [closed],
    },
  );
});

test("concurrent completion evidence refuses an unknown Process address", () => {
  assert.throws(
    () => classifyConcurrentCompletionResults([
      {
        kind: ProcessCommandResultKind.ProcessUnknown,
        commandId: "unknown",
        processInstanceId: "Instance_1",
      },
    ]),
    /Concurrent completion resolved to an unknown Process/u,
  );
});
