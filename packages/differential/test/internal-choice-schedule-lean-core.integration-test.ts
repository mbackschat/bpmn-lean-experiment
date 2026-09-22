import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { initialState, InternalSchedulingMode, isWellFormedSemanticProcessProgram, runtimeStateDefects,
  enabledInternalOperationCount } from "@bpmn-lean/semantic-core";
import { program, sideProgram, instanceId, start, a, b, end, first, second } from
  "../../semantic-core/test/internal-choice-schedule-fixture.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";

const trace = await import(new URL("../../semantic-core/dist/semantic-transition-trace.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/semantic-transition-trace.ts");

const inputs = [
  { id: "a-then-b", schedule: [first, second] },
  { id: "b-then-a", schedule: [{ ...first, selected: b }, { ordinal: 1, alternatives: [end, a], selected: end }] },
  { id: "merge-before-end", schedule: [first, { ...second, selected: b }] },
  { id: "exact-fuel", limit: 7, schedule: [first, second] },
  { id: "one-short-fuel", limit: 6, schedule: [first, second] },
  { id: "missing", schedule: [] },
  { id: "ordinal-before-frontier", schedule: [{ ordinal: 4, alternatives: [b, a], selected: end }] },
  { id: "frontier-before-member", schedule: [{ ordinal: 0, alternatives: [b, a], selected: end }] },
  { id: "absent-member", schedule: [{ ...first, selected: end }] },
  { id: "late-stale-frontier", schedule: [first, { ...second, alternatives: [a, b] }] },
  { id: "late-missing", schedule: [first] },
  { id: "fuel-before-missing", limit: 1, schedule: [] },
  { id: "fuel-before-stale", limit: 3, schedule: [first, second, first] },
  { id: "unused-after-stable", schedule: [first, second, first] },
  { id: "normalize-before-choice", program: sideProgram, schedule: [first, second] },
  { id: "normalize-before-missing", program: sideProgram, schedule: [] },
  { id: "normalization-exhausts-fuel", program: sideProgram, limit: 3, schedule: [] },
  { id: "forbidden-before-fuel", limit: 0, schedule: [first],
    program: { ...program, internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice } },
  { id: "admission-before-forbidden", limit: 0, schedule: [first],
    stimulus: { ...start, processId: "wrong-process" },
    program: { ...program, internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice } },
  { id: "reject-exact-merge-choice", schedule: [],
    program: { ...program, internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice } },
].map((input) => ({ program, stimulus: start, limit: 8, ...input }));

test("Lean and TypeScript agree on exact Merge choice, rollback precedence and replayed publication", async () => {
  for (const input of inputs) assert.equal(isWellFormedSemanticProcessProgram(input.program), true, input.id);
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-exact-choice-parity-"));
  try {
    const inputPath = path.join(directory, "inputs.jsonl");
    await writeFile(inputPath, `${inputs.map((input) => JSON.stringify(input)).join("\n")}\n`);
    const execution = await runLeanInterpreter("BpmnSemantics/InternalChoiceScheduleJsonMain.lean",
      [inputPath], inputs.length);
    const actual = execution.stdout.trim().split("\n").map((line) => parseStrictJson<unknown>(line, "scheduled Lean result"));
    const expected = inputs.map((input) => {
      const result = trace.applyStimulusWithScheduleAndTrace(input.program, initialState,
        input.stimulus, input.schedule, input.limit);
      return {
        id: input.id,
        outcome: result.result.outcome,
        internalStepBoundExceeded: result.result.internalStepBoundExceeded,
        ambiguousInternalChoice: result.result.ambiguousInternalChoice,
        scheduleFailure: result.result.scheduleFailure,
        stateUnchanged: isDeepStrictEqual(result.result.state, initialState),
        stateWellFormed: runtimeStateDefects(input.program, instanceId, result.result.state).length === 0,
        status: result.result.state.control.kind,
        endOccurrences: result.result.state.endOccurrences,
        lifecycleCount: result.flowNodeOccurrenceLifecycles.length,
        predecessorFrontierCounts: result.committedTransitions.map((_, index) => {
          const before = index === 0 ? initialState : trace.replayCommittedTransitions(input.program,
            initialState, result.committedTransitions.slice(0, index));
          assert.notEqual(before, null, `${input.id} prefix ${index} must replay`);
          return enabledInternalOperationCount(input.program, before!);
        }),
        traceReplays: isDeepStrictEqual(trace.replayCommittedTransitions(input.program, initialState,
          result.committedTransitions), result.result.state),
        publication: result.committedTransitions.length === 0 ? null :
          { transitions: result.committedTransitions, current: result.currentPositions },
      };
    });
    assert.equal(expected[0]?.outcome, "committed");
    assert.equal(expected[0]?.status, "completed");
    assert.equal(expected[0]?.endOccurrences, 2);
    assert.equal(expected[0]?.lifecycleCount, 8);
    assert.equal(actual.length, expected.length);
    for (const [index, value] of expected.entries()) assert.deepEqual(actual[index], value, value.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
