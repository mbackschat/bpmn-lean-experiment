/**
 * Refusal tests of the compensation order under `BranchSchedule.orderInvariant` (DC15 (c), candidate (iii);
 * docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I1 (d)): records completed in one closure are ordered by the
 * program's structural order, never by the order the closure ran them, so admission refuses a model in which one
 * Compensation throw or Cancel End may meet two records of one closure whose order `precedes` needs and that order
 * cannot give: two dependent subjects neither of which follows the other in one direction only
 * (`compensation.unorderedDependency`), a subject that completes again after itself in one closure
 * (`compensation.repeatsInClosure`), and a sequential Multi-Instance Sub-Process whose instances complete in one closure
 * (`compensation.sequentialInstancesInClosure`). A refusal of a pair names both subjects. Records of one closure
 * that BPMN 2.0.2 §13.5.5 leaves unordered (parallel instances, independent subjects) stay admitted.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admitLocated, decodeProgram } from "./lean-paired.ts";
import {
  activity, base, end, flow, gateway, loop, scope, simpleBoolean, start, wired, withOptions, writer,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { compensateAll, handlerTask, userTask } from "./compensation-support.ts";

/** The located refusal of `json`, wired, or `null` when admitted. */
function located(json: Json): ReturnType<typeof admitLocated> {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : `the program does not decode: ${decoded.refusal}`);
  return admitLocated(decoded.value);
}

/** A program of `elements` and `flows`, declaring `items`. */
const program = (elements: Json[], flows: Json[]): Json => ({ ...base(), variables: ["items"], elements, flows });

/**
 * A Sub-Process `id` compensable by `H<id>` (the User Task `handler` defaults to), running `<id>S -> <id>T -> <id>E`,
 * where `<id>T` is a Manual Task (non-waiting; compensation counts it as reading and writing every name, D1 (c)) or a
 * User Task when `waits`.
 */
function quick(id: string, waits = false, env: Json = {}, handler: Json[] = [handlerTask(`H${id}`)]): Json[] {
  const inner = waits ? userTask(`${id}T`, null, id) : activity(`${id}T`, "manual", {}, id);
  return [
    scope(id, "embedded", {}, { compensationHandlers: [`H${id}`], ...env }), start(`${id}S`, null, [], id), inner,
    end(`${id}E`, "none", id), ...handler,
  ];
}
const inner = (id: string): Json[] => [flow(`${id}0`, `${id}S`, `${id}T`), flow(`${id}1`, `${id}T`, `${id}E`)];

/** `... -> X -> E`: the User Task `X`, then a Compensation End compensating every record. */
const tail = (from: string): [Json[], Json[]] =>
  [[userTask("X"), end("E", compensateAll)], [flow("tx", from, "X"), flow("te", "X", "E")]];

/** `S -> P`, a Parallel fork to the Sub-Processes `SA` and `SB`, joined by `J`; each holds a Manual Task (`waits`: a User Task in `SB`). */
function parallelPair(waits = false): Json {
  const [elements, flows] = tail("J");
  return program(
    [start("S"), gateway("P", "parallel"), ...quick("SA"), ...quick("SB", waits), gateway("J", "parallel"), ...elements],
    [flow("s0", "S", "P"), flow("pa", "P", "SA"), flow("pb", "P", "SB"), flow("ja", "SA", "J"), flow("jb", "SB", "J"),
      ...inner("SA"), ...inner("SB"), ...flows],
  );
}

test("two dependent Sub-Processes completing concurrently in one closure are refused, naming both", () => {
  assert.deepEqual(located(parallelPair()), { code: "compensation.unorderedDependency", element: "SA", related: ["SB"] });
});

test("two dependent Sub-Processes in sequence in one closure are admitted: the second follows the first", () => {
  const [elements, flows] = tail("SB");
  const json = program([start("S"), ...quick("SA"), ...quick("SB"), ...elements],
    [flow("s0", "S", "SA"), flow("ab", "SA", "SB"), ...inner("SA"), ...inner("SB"), ...flows]);
  assert.equal(located(json), null);
});

test("two dependent Sub-Processes, one of which waits, complete in different closures and are admitted", () => {
  assert.equal(located(parallelPair(true)), null);
});

/** `S -> M -> A -> G`, `G` looping back to `M` on a false condition, else to `X`; `U` a User Task between `A` and `G` when `waits`. */
function looping(waits: boolean): Json {
  const [elements, flows] = tail("G");
  const gate = gateway("G", { exclusive: { candidates: ["back"], default: "tx" } });
  const middle = waits ? [userTask("U")] : [];
  const route = waits ? [flow("au", "A", "U"), flow("ug", "U", "G")] : [flow("ag", "A", "G")];
  return program(
    [start("S"), gateway("M", { exclusive: { candidates: [], default: null } }), ...quick("A"), ...middle, gate, ...elements],
    [flow("sm", "S", "M"), flow("ma", "M", "A"), ...route, flow("back", "G", "M", simpleBoolean(false)), ...inner("A"), ...flows],
  );
}

test("a Sub-Process that may complete again after itself in one closure is refused", () => {
  assert.deepEqual(located(looping(false)), { code: "compensation.repeatsInClosure", element: "A", related: [] });
});

test("a Sub-Process whose loop passes a wait is admitted: each completion is in a closure of its own", () => {
  assert.equal(located(looping(true)), null);
});

/** `S -> M -> X -> E`, `M` a Multi-Instance Sub-Process of `mode` over `items`, its body non-waiting unless `waits`. */
function instances(mode: string, waits: boolean): Json {
  const [elements, flows] = tail("M");
  return program([start("S"), ...quick("M", waits, { multiInstance: loop({ mode, outputDataItem: null }) }), ...elements],
    [flow("sm", "S", "M"), ...inner("M"), ...flows]);
}

test("a sequential Multi-Instance Sub-Process whose instances complete in one closure is refused", () => {
  assert.deepEqual(located(instances("sequential", false)), { code: "compensation.sequentialInstancesInClosure", element: "M", related: [] });
});

test("a sequential Multi-Instance Sub-Process whose body waits is admitted", () => {
  assert.equal(located(instances("sequential", true)), null);
});

test("a parallel Multi-Instance Sub-Process whose instances complete in one closure is admitted: they are unordered", () => {
  assert.equal(located(instances("parallel", false)), null);
});

/**
 * `instances("parallel", false)` whose handler `HM` is a Sub-Process writing `outcome`, under `schedule`: the
 * instances' records of one closure have no order, so the Compensation End `E` runs `HM` once per record concurrently.
 */
function writingHandler(schedule: string): Json {
  const [elements, flows] = tail("M");
  const [handler, handlerFlows] = writer("HM", "outcome", "undone", null, { forCompensation: true, incoming: [], outgoing: [] });
  const looped = quick("M", false, { multiInstance: loop({ mode: "parallel", outputDataItem: null }) }, handler);
  return withOptions(program([start("S"), ...looped, ...elements], [flow("sm", "S", "M"), ...inner("M"), ...handlerFlows, ...flows]),
    { branchSchedule: schedule });
}

test("a parallel Multi-Instance Sub-Process's writing handler runs once per unordered record, so the runs race and are refused", () => {
  assert.deepEqual(located(writingHandler("orderInvariant")), { code: "flow.concurrentWrite", element: "E", related: [] });
});

test("a parallel Multi-Instance Sub-Process's writing handler is admitted under CIB's schedule, which orders the records", () => {
  assert.equal(located(writingHandler("declarationDepthFirst")), null);
});
