/**
 * Shared builders of the admission refusal tables (`admission-refusals-*.test.ts`): kernel IL programs in the wire
 * form `decodeProgram` reads, small enough that each row names the one construct a refusal code applies to.
 *
 * Admission reads one construct at a time and never follows a flow, so a row is the base program `Start -> Task -> End`
 * with the construct swapped in or added. Every row is checked against its refusal code, and a row's optional
 * `control` is the same construct in its admitted form: it shows the refusal is the construct's, not the program's.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { admit, decodeProgram } from "@bpmn-lean/kernel";

export type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

// Values, expressions and value sources.

export const bool = (value: boolean): Json => ({ kind: "boolean", value });
/** A `ValueSource` given literally. */
export const text = (value: string): Json => ({ literal: { value } });
/** A `ValueSource` given by an expression. */
export const computed = (body: Json): Json => ({ expression: { body } });
export const variable = (name: string): Json => ({ variable: { name } });
export const literalValue = (value: Json): Json => ({ literal: { value } });
export const simpleBoolean = (value = true): Json => ({ simpleBoolean: { body: { literal: { value } } } });
export const foreign = (): Json => ({ foreign: { language: "juel", source: "${x}" } });
export const mapping = (target: string, source: Json, dialect = "ioParameter"): Json => ({ target, source, dialect });

// Subscriptions.

const timer = (schedule: Json): Json => ({ timer: { payload: { schedule } } });
export const duration = (lexeme: string): Json => timer({ duration: { value: text(lexeme) } });
export const date = (lexeme: string): Json => timer({ date: { value: text(lexeme) } });
export const cycle = (lexeme: string, dialect = "iso8601"): Json => timer({ cycle: { value: text(lexeme), dialect } });
export const messageBody = (over: Json = {}): Json => ({ name: null, correlation: [], interfaceRef: null, operationRef: null, ...over });
export const message = (over: Json = {}): Json => ({ message: { payload: messageBody(over) } });
export const signal = (): Json => ({ signal: { payload: { name: text("S") } } });
export const condition = (): Json => ({ condition: { payload: { condition: simpleBoolean(), variableName: null, variableEvents: [] } } });
export const errorTrigger = (over: Json = {}): Json => ({ error: { payload: { code: null, codeVariable: null, messageVariable: null, ...over } } });
export const escalationTrigger = (over: Json = {}): Json => ({ escalation: { payload: { code: null, codeVariable: null, ...over } } });
export const compensationTrigger = "compensation";
export const cancelTrigger = "cancel";
export const subscription = (trigger: Json | string, outputs: Json[] = []): Json => ({ trigger, outputs });
export const criterion = (key: string, value: Json): Json => ({ key, value });
/** A message trigger an Operation carries, the channel a correlated catch needs. */
export const channel = (over: Json = {}): Json => ({ name: text("M"), interfaceRef: "I", operationRef: "O", ...over });

// Elements.

const header = (id: string, sourceType: string, parent: string | null): Json =>
  ({ id, origin: { definition: null, sourceId: id }, sourceType, parent });

export const envelope = (over: Json = {}): Json => ({
  incoming: ["f1"], outgoing: ["f2"], inputs: [], outputs: [], boundaries: [], multiInstance: null, compensationHandler: null,
  defaultFlow: null, asyncBefore: false, asyncAfter: false, ...over,
});

export const boundary = (id: string, trigger: Json | string, over: Json = {}, outputs: Json[] = []): Json =>
  ({ id, subscription: subscription(trigger, outputs), interrupting: true, outgoing: [], ...over });

export const userWork = (over: Json = {}): Json => ({
  user: {
    payload: {
      name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [], dueDate: null,
      followUpDate: null, priority: null, ...over,
    },
  },
});
export const serviceWork = (protocol = "http", operation = "get"): Json => ({ service: { payload: { protocol, operation } } });
export const receiveWork = (over: Json = {}): Json => ({ receive: { payload: { message: messageBody(over) } } });
export const callWork = (over: Json = {}): Json => ({
  call: {
    payload: {
      calledElement: text("Called"), binding: "latest", tenant: null, businessKey: null, inputs: [], outputs: [],
      propagateAllInputs: false, propagateAllOutputs: false, ...over,
    },
  },
});

export const sendWork = (): Json => ({ send: { payload: { binding: { protocol: "http", operation: "post" }, recipient: null, correlation: [], messageRef: null, operationRef: null } } });
export const scriptWork = (): Json => ({ script: { payload: { format: "js", source: "1", resultVariable: null } } });
export const ruleWork = (): Json => ({ rule: { payload: { decision: text("d"), resultVariable: null, binding: "latest", resultMapping: "singleEntry" } } });

/** A Multi-Instance loop the kernel runs: one User Task per item of a collection variable, read once on entry. */
export const loop = (over: Json = {}): Json => ({
  mode: "parallel", count: { collection: { items: variable("items") } }, elementVariable: null, completionCondition: null,
  inputDataItem: "item", outputDataItem: "result", outputCollection: null, mutableCollection: "entrySnapshot", ...over,
});

/** The definition a called process is bound to; a binding field set here is refused. */
export const definitionRef = (key: string, over: Json = {}): Json =>
  ({ key, version: null, versionTag: null, deployment: null, tenant: null, sourceSha256: null, ...over });

/** An Activity: `work` is a `Work` value, `env` overrides the envelope fields, `parent` its enclosing Scope. */
export const activity = (id: string, work: Json | string, env: Json = {}, parent: string | null = null): Json =>
  ({ activity: { header: header(id, "task", parent), payload: { work, envelope: envelope(env) } } });

export const start = (id: string, trigger: Json | string | null = null, outputs: Json[] = [], parent: string | null = null): Json => ({
  start: {
    header: header(id, "startEvent", parent),
    payload: { subscription: trigger === null ? null : subscription(trigger, outputs), outgoing: ["f1"] },
  },
});

const event = (id: string, sourceType: string, role: Json, placement: string, parent: string | null, incoming: string[]): Json =>
  ({ event: { header: header(id, sourceType, parent), payload: { role, placement, incoming, outgoing: [] } } });

/** An End Event throwing `record` (a `Throw` value). */
export const end = (id: string, record: Json | string = "none", parent: string | null = null): Json =>
  event(id, "endEvent", { throw: { record } }, "finish", parent, ["f2"]);

export const catchEvent = (id: string, trigger: Json | string, outputs: Json[] = [], parent: string | null = null): Json =>
  event(id, "intermediateCatchEvent", { catch: { subscription: subscription(trigger, outputs) } }, "intermediate", parent, ["f1"]);

export const link = (id: string, role: "linkCatch" | "linkThrow", name: string, parent: string | null = null): Json =>
  event(id, role === "linkCatch" ? "intermediateCatchEvent" : "intermediateThrowEvent", { [role]: { name } }, "intermediate", parent,
    role === "linkCatch" ? [] : ["f1"]);

export const gateway = (id: string, kind: Json | string, over: Json = {}, parent: string | null = null): Json =>
  ({ gateway: { header: header(id, "gateway", parent), payload: { kind, incoming: ["f1"], outgoing: ["f2"], ...over } } });

/** A Scope; `kind` is `"embedded"`, a transaction or an Event Sub-Process kind. */
export const scope = (id: string, kind: Json | string, over: Json = {}, env: Json = {}, parent: string | null = null): Json => ({
  scope: { header: header(id, "subProcess", parent), payload: { kind, children: [], localVariables: [], envelope: envelope(env), ...over } },
});
export const eventSubProcess = (trigger: Json | string, interrupting: boolean): Json =>
  ({ eventSubProcess: { start: subscription(trigger), interrupting } });

export const flow = (id: string, source: string, target: string, conditionExpression: Json | null = null): Json =>
  ({ id, source, target, condition: conditionExpression });

// Programs.

/** `Start -> Task -> End`, the admitted base every row mutates. */
export function base(): Json {
  return {
    ...slice,
    variables: [],
    processes: [],
    elements: [start("S"), activity("T", "manual"), end("E")],
    flows: [flow("f1", "S", "T"), flow("f2", "T", "E")],
  };
}

/** The element with its header's `origin` replaced. */
export function withOrigin(element: Json, origin: Json): Json {
  const [tag, body] = Object.entries(element)[0] as [string, Json];
  return { [tag]: { ...body, header: { ...(body.header as Json), origin } } };
}

/** The header identifier of an element. */
export const elementId = (element: Json): string => ((Object.values(element)[0] as Json).header as Json).id as string;

/** The program with the element `id` replaced by `element`. */
export function replace(program: Json, id: string, element: Json): Json {
  const elements = program.elements as Json[];
  assert.ok(elements.some((entry) => elementId(entry) === id), `the base program has no element ${id}`);
  return { ...program, elements: elements.map((entry) => (elementId(entry) === id ? element : entry)) };
}

/** The program with its Sequence Flow `id` carrying `conditionExpression`. */
export const conditionOn = (program: Json, id: string, conditionExpression: Json): Json =>
  ({ ...program, flows: (program.flows as Json[]).map((entry) => (entry.id === id ? { ...entry, condition: conditionExpression } : entry)) });

export const append = (program: Json, ...elements: Json[]): Json => ({ ...program, elements: [...(program.elements as Json[]), ...elements] });

export const withOptions = (program: Json, over: Json): Json => ({ ...program, options: { ...(program.options as Json), ...over } });

/** The base program with its Task replaced by `element`. */
export const task = (element: Json) => (program: Json): Json => replace(program, "T", element);

// Tables.

export type Row = Readonly<{
  code: string;
  description: string;
  mutate: (program: Json) => Json;
  /** The same construct in its admitted form. */
  control?: (program: Json) => Json;
}>;

/** The first refusal of `json` after it decodes: a decode failure is a defect of the row, never a refusal. */
export function refusalOf(json: Json): string | null {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : `the row's program does not decode: ${decoded.refusal}`);
  return admit(decoded.value);
}

/** One test per row, plus one that the unmutated base program is admitted. */
export function refusalTests(family: string, rows: readonly Row[]): void {
  test(`${family}: the base program is admitted`, () => assert.equal(refusalOf(base()), null));
  for (const row of rows) {
    test(`${family}: ${row.description} is refused as ${row.code}`, () => {
      assert.equal(refusalOf(row.mutate(base())), row.code);
      if (row.control !== undefined) assert.equal(refusalOf(row.control(base())), null, "the control form is admitted");
    });
  }
}
