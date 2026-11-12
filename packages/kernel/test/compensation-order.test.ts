/**
 * The order of one trigger's handlers (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I1, D1; BPMN 2.0.2
 * §13.5.5): beside a Sequence Flow between subjects, one leaving a boundary Event of the earlier subject, a name the
 * later subject reads that the earlier can write, and repeated records of one subject each make the later handler
 * complete first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, base, boundary, end, errorTrigger, escalationTrigger, flow, gateway, literalValue, loop, mapping, qName, scope, start, userWork,
  variable, wired, withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, complete, drive, driveFrom, handlerTask, parts, throwing, userTask, waiting } from "./compensation-support.ts";

const text = (value: string): Json => literalValue({ kind: "string", value });

/** A User Task `id` compensable by `handler`, writing `outputs`. */
const writing = (id: string, handler: string, outputs: Json[], parent: string | null = null): Json =>
  activity(id, userWork(), { compensationHandlers: [handler], outputs }, parent);

/** A User Task `id` compensable by `handler`, reading `name` into a local when it begins. */
const reading = (id: string, handler: string, name: string): Json =>
  activity(id, userWork(), { compensationHandlers: [handler], inputs: [mapping("z", variable(name))] });

/** Every name the programs read, bound at the start. */
const bound = ["x", "y"].map((name) => ({ name, value: { kind: "string", value: name } }));

/**
 * A Parallel Gateway starting `branches`, each `[first, ...]` running to its own None End, and `X` leading to the
 * Compensation End `E`; `extra` adds the elements and flows inside the branches' Scopes and the handlers.
 */
function forked(branches: Json[], extra: Json[], extraFlows: Json[] = []): Json {
  const ids = branches.map((element) => ((Object.values(element)[0] as Json).header as Json).id as string);
  return wired({
    ...base(),
    variables: ["items", "x", "y", "z"],
    elements: [start("S"), gateway("P", "parallel"), ...branches, ...ids.map((id) => end(`E${id}`)), userTask("X"), end("E", compensateAll), ...extra],
    flows: [
      flow("s0", "S", "P"), ...ids.flatMap((id) => [flow(`p${id}`, "P", id), flow(`e${id}`, id, `E${id}`)]), flow("x0", "P", "X"),
      flow("x1", "X", "E"), ...extraFlows,
    ],
  });
}

test("a handler whose subject a boundary Event of another subject leads to runs first", () => {
  // `A` runs `PS -> PX -> PT -> PE`; `PX` escalates `X`, which `A`'s non-interrupting boundary `BA` catches into `B`,
  // which completes while `A` still runs.
  const caught = boundary("BA", escalationTrigger({ code: "X" }), { interrupting: false });
  const program = chain([
    scope("A", "embedded", {}, { compensationHandlers: ["HA"], boundaries: [caught] }),
    userTask("X"),
  ], compensateAll, parts({
    elements: [
      start("PS", null, [], "A"), throwing("PX", { escalation: { payload: { code: "X" } } }, "A"), userTask("PT", null, "A"),
      end("PE", "none", "A"), userTask("B", "HB"), end("EB"), handlerTask("HA"), handlerTask("HB"),
    ],
    flows: [flow("a0", "PS", "PX"), flow("a1", "PX", "PT"), flow("a2", "PT", "PE"), flow("b0", "BA", "B"), flow("b1", "B", "EB")],
  }));
  assert.deepEqual(waiting(drive(program)), ["B", "PT"]);
  const compensating = [complete("B"), complete("PT"), complete("X")];
  assert.deepEqual(waiting(drive(program, ...compensating)), ["HB"]);
  assert.deepEqual(waiting(drive(program, ...compensating, complete("HB"))), ["HA"]);
});

test("repeated records of one subject run one at a time, the latest completion first", () => {
  // Two flows from the Parallel Gateway send two tokens through `A`.
  const json = wired({
    ...base(),
    elements: [
      start("S"), gateway("P", "parallel"), userTask("A", "HA"), end("EA"), userTask("X"), end("E", compensateAll), handlerTask("HA"),
    ],
    flows: [
      flow("s0", "S", "P"), flow("a1", "P", "A"), flow("a2", "P", "A"), flow("a3", "A", "EA"), flow("x0", "P", "X"),
      flow("x1", "X", "E"),
    ],
  });
  const both = [complete("A", 1), complete("A", 2), complete("X")];
  assert.deepEqual(waiting(drive(json, ...both)), ["HA"]);
  assert.deepEqual(waiting(drive(json, ...both, complete("HA", 1))), ["HA"]);
  assert.equal(drive(json, ...both, complete("HA", 1), complete("HA", 2)).ok, true);
});

test("a later subject that reads a name an earlier one writes is compensated first", () => {
  const program = forked(
    [writing("A", "HA", [mapping("x", text("a"))]), reading("B", "HB", "x")],
    [handlerTask("HA"), handlerTask("HB")],
  );
  const compensating = [complete("A"), complete("B"), complete("X")];
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating)), ["HB"]);
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating, complete("HB"))), ["HA"]);
});

test("a later subject that reads no name an earlier one writes is compensated concurrently", () => {
  const program = forked(
    [writing("A", "HA", [mapping("x", text("a"))]), reading("B", "HB", "y")],
    [handlerTask("HA"), handlerTask("HB")],
  );
  const started = driveFrom(program, bound, complete("A"), complete("B"), complete("X"));
  assert.deepEqual(waiting(started), ["HA", "HB"]);
});

/** `A`, a Sub-Process holding `inner` between `AS` and `AE` and `extra`, beside `B`, which reads `y`. */
function aroundScope(inner: Json, extra: Json[] = [], extraFlows: Json[] = []): Json {
  const id = ((Object.values(inner)[0] as Json).header as Json).id as string;
  return forked(
    [scope("A", "embedded", {}, { compensationHandlers: ["HA"] }), reading("B", "HB", "y")],
    [start("AS", null, [], "A"), inner, end("AE", "none", "A"), ...extra, handlerTask("HA"), handlerTask("HB")],
    [flow("i0", "AS", id), flow("i1", id, "AE"), ...extraFlows],
  );
}

test("a task kind compensation cannot inspect counts as writing every name", () => {
  const program = aroundScope(activity("M", "manual", {}, "A"));
  const compensating = [complete("B"), complete("X")];
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating)), ["HB"]);
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating, complete("HB"))), ["HA"]);
});

test("a Sub-Process whose inner User Task writes nothing is compensated concurrently with a later reader", () => {
  const program = aroundScope(userTask("M", null, "A"));
  assert.deepEqual(waiting(driveFrom(program, bound, complete("M"), complete("B"), complete("X"))), ["HA", "HB"]);
});

test("a Multi-Instance element writes its output collection", () => {
  const counted = loop({ count: { collection: { items: variable("items") } }, outputCollection: "y", outputDataItem: "result" });
  const program = aroundScope(activity("M", userWork(), { multiInstance: counted }, "A"));
  const items = [{ name: "items", value: { kind: "list", value: [{ kind: "string", value: "i" }] } }, ...bound];
  const submitted = complete("M", 1, [["result", { kind: "string", value: "r" }]]);
  assert.deepEqual(waiting(driveFrom(program, items, submitted, complete("B"), complete("X"))), ["HB"]);
});

test("a Sub-Process whose inner Error boundary sets a name a later subject reads is compensated after it", () => {
  // `BM` would set `y` from a caught Error's code; `M` completes, so the boundary never fires.
  const caught = boundary("BM", errorTrigger({ codeVariable: "y" }));
  const program = aroundScope(activity("M", userWork(), { boundaries: [caught] }, "A"), [end("EM", "none", "A")], [flow("m0", "BM", "EM")]);
  const compensating = [complete("M"), complete("B"), complete("X")];
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating)), ["HB"]);
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating, complete("HB"))), ["HA"]);
});

test("a Sub-Process whose inner Signal throw installs a name a later subject reads is compensated after it", () => {
  const signal: Json = {
    signal: {
      payload: {
        signalRef: qName("Sig"), name: { literal: { value: "S" } }, payload: [mapping("y", text("s"))], propagateAll: null,
        localOnly: false, businessKey: null, asynchronous: false,
      },
    },
  };
  const program = withOptions(aroundScope(throwing("M", signal, "A")), { signalPayload: "variables" });
  const compensating = [complete("B"), complete("X")];
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating)), ["HB"]);
  assert.deepEqual(waiting(driveFrom(program, bound, ...compensating, complete("HB"))), ["HA"]);
});
