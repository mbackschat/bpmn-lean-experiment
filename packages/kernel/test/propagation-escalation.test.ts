/**
 * What a raised Escalation does around its search (docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md, PC-ESCALATION-01
 * and PC-ESCALATION-03): one no catcher takes lets its thrower leave and changes nothing else (§10.5.1, CIB-INT-0021);
 * the thrower leaves only after the search, and not at all under an interrupting catch, which cancels it with its scope
 * (`ThrowEscalationEventActivityBehavior.java:44-48`); a catch's code variable is written from the host for an
 * interrupting boundary and from the host's parent for a non-interrupting one (`EscalationHandler.java:80-97`); and a
 * Sub-Process its interrupting Escalation boundary interrupts writes its output mappings under `ErrorPathOutputs.mapped`
 * (CIB-EXT-0016). Each program runs to its first wait on `start`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, end, escalationTrigger, flow, literalValue, mapping, scope, start, task, userWork, variable,
  withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = { errorCatchVariables: "eventScope", errorPathOutputs: "mapped", undeclaredWrite: "atInstanceRoot" };
const escalation = (code: string): Json => ({ escalation: { payload: { code } } });

/** An Intermediate throw Event `id` throwing `record`. */
const throwing = (id: string, record: Json, parent: string | null = null): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

const stimulus = (json: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...json });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

function started(json: Json) {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return step(hooks, decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] }));
}

function committed(json: Json): State {
  const outcome = started(json);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

const open = (state: State): string[] => state.openItems.map((item) => item.element);
const rootVariables = (state: State): Record<string, unknown> => {
  const root = state.scopes.find((entry) => entry.parent === null);
  return Object.fromEntries(state.variables.find((entry) => entry.scope === root?.id)?.entries ?? []);
};
const code = { tag: "string", value: "X" };

// `S -> T -> E` with `T` an Intermediate Escalation throw: nothing catches it.
test("an uncaught Intermediate Escalation passes its token on", () => {
  const json = {
    ...base(),
    elements: [start("S"), throwing("T", escalation("X")), activity("W", userWork()), end("E")],
    flows: [flow("f1", "S", "T"), flow("f2", "T", "W"), flow("f3", "W", "E")],
  };
  const state = committed(json);
  assert.equal(state.status, "running");
  assert.deepEqual(open(state), ["W"]);
});

test("an uncaught Escalation End ends only its path", () => {
  const json = { ...base(), elements: [start("S"), end("T", escalation("X"))], flows: [flow("f1", "S", "T")] };
  assert.equal(committed(json).status, "completed");
});

/**
 * `T` is a Sub-Process `PS -> PX -> PW -> PE` whose Intermediate throw `PX` raises `X` and whose Escalation boundary
 * `B`, catching `X` into `code` and leading to the User Task `W`, has the fields `over`. `T` holds `inputs` as locals
 * and maps `outputs`.
 */
function hosted(over: Json, inputs: Json[] = [], outputs: Json[] = []): Json {
  const host = scope("T", "embedded", {}, {
    inputs, outputs, boundaries: [boundary("B", escalationTrigger({ code: "X", codeVariable: "code" }), over)],
  });
  const json = append(task(host)(base()), start("PS", null, [], "T"), throwing("PX", escalation("X"), "T"),
    activity("PW", userWork(), {}, "T"), end("PE", "none", "T"), activity("W", userWork()));
  return withOptions(withFlows(json, flow("pf1", "PS", "PX"), flow("pf2", "PX", "PW"), flow("pf3", "PW", "PE"), flow("fb", "B", "W"),
    flow("fw", "W", "E")), cib);
}

test("a thrower an interrupting catch interrupts ends cancelled and never takes its flows", () => {
  const state = committed(hosted({}));
  assert.deepEqual(open(state), ["W"]);
  const ended = state.journal.flatMap((transition) => transition.ended).filter(([key]) => key.element === "PX");
  assert.deepEqual(ended.map(([, terminal]) => terminal), ["cancelled"]);
  assert.equal(state.journal.some((transition) => transition.started.some((fact) => fact.occurrence.element === "PW")), false);
});

test("a non-interrupting catch begins before its thrower leaves on its flows", () => {
  const state = committed(hosted({ interrupting: false }));
  assert.deepEqual(open(state).toSorted(), ["PW", "W"]);
  const begun = state.journal.flatMap((transition) => transition.started.map((fact) => fact.occurrence.element));
  assert.ok(begun.indexOf("B") < begun.indexOf("PW"), JSON.stringify(begun));
});

const inner = [mapping("code", literalValue({ kind: "string", value: "inner" }))];

test("a non-interrupting boundary writes its code variable from the host's parent, past the host's local", () => {
  assert.deepEqual(rootVariables(committed(hosted({ interrupting: false }, inner))), { code });
});

test("an interrupting boundary writes its code variable into the host's local, which ends with the host", () => {
  assert.deepEqual(rootVariables(committed(hosted({}, inner))), {});
});

test("a Sub-Process an interrupting Escalation boundary interrupts maps its outputs after the code variable", () => {
  assert.deepEqual(rootVariables(committed(hosted({}, inner, [mapping("seen", variable("code"))]))), { seen: code });
  assert.deepEqual(rootVariables(committed(hosted({}, [], [mapping("seen", variable("code"))]))), { code, seen: code });
});

test("without the mapped Error-path outputs the interrupted Sub-Process maps nothing", () => {
  const json = withOptions(hosted({}, [], [mapping("seen", variable("code"))]), { errorPathOutputs: "none" });
  assert.deepEqual(rootVariables(committed(json)), { code });
});
