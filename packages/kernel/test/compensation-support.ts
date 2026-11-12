/**
 * Programs and a driver for the compensation tests (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md). A program
 * runs through `step` without admission, so a test can select a profile option admission still refuses; every program
 * here is wired by `wired`, which rebuilds the flow lists from the flows.
 */
import assert from "node:assert/strict";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, end, flow, scope, start, userWork, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

export const instance = "I";

/** An untargeted Compensation throw record that waits for its handlers. */
export const compensateAll: Json = { compensation: { payload: { activity: null, waitForCompletion: true } } };
export const compensateOne = (subject: string): Json => ({ compensation: { payload: { activity: subject, waitForCompletion: true } } });
export const raiseError = (code: string): Json => ({ error: { payload: { code, message: null } } });

/** A User Task `id` in `parent`, compensable by `handler` when one is named. */
export const userTask = (id: string, handler: string | null = null, parent: string | null = null): Json =>
  activity(id, userWork(), handler === null ? {} : { compensationHandlers: [handler] }, parent);

/** An unconnected User Task `id` in `parent`, marked for compensation. */
export const handlerTask = (id: string, parent: string | null = null): Json =>
  activity(id, userWork(), { incoming: [], outgoing: [], forCompensation: true }, parent);

/** An Intermediate throw Event `id` in `parent` throwing `record`. */
export const throwing = (id: string, record: Json, parent: string | null = null): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

/** Elements and flows a program gains beside its main sequence. */
export type Part = Readonly<{ elements: Json[]; flows: Json[] }>;

const idOf = (element: Json): string => ((Object.values(element)[0] as Json).header as Json).id as string;

/** `ids` joined in order by flows named `<prefix><index>`. */
const sequence = (prefix: string, ids: string[]): Json[] =>
  ids.slice(1).map((target, index) => flow(`${prefix}${index}`, ids[index] as string, target));

/** An unconnected Sub-Process handler `id` in `parent` running `<id>S -> body... -> <id>E`, marked for compensation. */
export function handlerScope(id: string, body: Json[], endRecord: Json | string = "none", parent: string | null = null): Part {
  return {
    elements: [
      scope(id, "embedded", {}, { incoming: [], outgoing: [], forCompensation: true }, parent),
      start(`${id}S`, null, [], id), ...body, end(`${id}E`, endRecord, id),
    ],
    flows: sequence(`${id}f`, [`${id}S`, ...body.map(idOf), `${id}E`]),
  };
}

/** The parts' elements and flows together. */
export const parts = (...all: Part[]): Part => ({ elements: all.flatMap((part) => part.elements), flows: all.flatMap((part) => part.flows) });

/** `S -> steps... -> E` at the process level, where `E` ends with `endRecord`; `extra` adds unconnected parts. */
export function chain(steps: Json[], endRecord: Json | string, extra: Part = parts(), options: Json = {}): Json {
  const program = base();
  return wired({
    ...program,
    elements: [start("S"), ...steps, end("E", endRecord), ...extra.elements],
    flows: [...sequence("f", ["S", ...steps.map(idOf), "E"]), ...extra.flows],
    options: { ...(program.options as Json), ...options },
  });
}

/** A User Task completion command for the activation `activation` of `element`, submitting `values`. */
export const complete = (element: string, activation = 1, values: [string, Json][] = []): Json => ({
  kind: "command", occurrence: { processInstanceId: instance, elementId: element, activation },
  action: { kind: "completeUserTask", values: values.map(([name, value]) => ({ name, value })) },
});

/** Start the instance and apply `stimuli` in order; the outcome of the last, or of the first that does not commit. */
export const drive = (json: Json, ...stimuli: Json[]): Outcome => driveFrom(json, [], ...stimuli);

/** `drive`, starting the instance with `variables` (`{ name, value }` bindings). */
export function driveFrom(json: Json, variables: Json[], ...stimuli: Json[]): Outcome {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  let outcome: Outcome | null = null;
  for (const [index, raw] of [{ kind: "start", instanceId: instance, variables }, ...stimuli].entries()) {
    const parsed = stimulusFromJson({ commandId: `c${index}`, ...raw });
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.refusal);
    outcome = step(decoded.value, state, parsed.value[1]);
    if (!outcome.ok) return outcome;
    state = outcome.value;
  }
  return outcome!;
}

/** The committed state of `outcome`. */
export function committedState(outcome: Outcome): State {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

/** The elements waiting for a command, sorted. */
export const waiting = (outcome: Outcome): string[] => committedState(outcome).openItems.map((item) => item.element).sort();
