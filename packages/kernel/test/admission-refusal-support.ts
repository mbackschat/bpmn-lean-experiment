/**
 * Shared builders of the admission refusal tables (`admission-refusals-*.test.ts`): kernel IL programs in the wire
 * form `decodeProgram` reads, small enough that each row names the one construct a refusal code applies to.
 *
 * A row is the base program `Start -> Task -> End` with the construct swapped in or added. Every row is checked against
 * its refusal code, and a row's optional `control` is the same construct in its admitted form: it shows the refusal is
 * the construct's, not the program's. Admission refuses a dangling reference (`il.reference`), so before a row is
 * admitted `wired` derives every flow list and Scope membership from the flows and parents the row leaves; only a
 * `raw` row, which tests that refusal, is admitted as written.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { admit, decodeProgram } from "./lean-paired.ts";

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
/** A JUEL node table (`Kernel.IL.Types.Juel`), in its wire form. */
export const juel = (...nodes: Array<Json | string>): Json => ({ juel: { nodes } });
export const mapping = (target: string, source: Json, dialect = "ioParameter"): Json => ({ target, source, dialect });

// Subscriptions.

const timer = (schedule: Json): Json => ({ timer: { payload: { schedule } } });
export const duration = (lexeme: string): Json => timer({ duration: { value: text(lexeme) } });
export const date = (lexeme: string): Json => timer({ date: { value: text(lexeme) } });
export const cycle = (lexeme: string, dialect = "iso8601"): Json => timer({ cycle: { value: text(lexeme), dialect } });
export const messageBody = (over: Json = {}): Json =>
  ({ messageRef: null, name: null, correlation: [], interfaceRef: null, operationRef: null, itemRef: null, ...over });
export const message = (over: Json = {}): Json => ({ message: { payload: messageBody(over) } });
/** A QName in its wire form, of the base program's namespace (none) unless `namespace` says otherwise. */
export const qName = (localName: string, namespace: string | null = null): Json => ({ namespace, localName });
export const signal = (): Json => ({ signal: { payload: { signalRef: qName("Sig"), name: text("S") } } });
export const condition = (): Json => ({ condition: { payload: { condition: simpleBoolean(), variableName: null, variableEvents: [] } } });
export const errorTrigger = (over: Json = {}): Json => ({ error: { payload: { code: null, codeVariable: null, messageVariable: null, ...over } } });
export const escalationTrigger = (over: Json = {}): Json => ({ escalation: { payload: { code: null, codeVariable: null, ...over } } });
export const compensationTrigger = "compensation";
export const cancelTrigger = "cancel";
/** `alternatives` are a Multiple Event's definitions after the first; `parallelMultiple` its Parallel Multiple mark. */
export const subscription = (trigger: Json | string, outputs: Json[] = [], alternatives: Array<Json | string> = [], parallelMultiple = false): Json =>
  ({ trigger, outputs, alternatives, parallelMultiple });
export const criterion = (key: string, value: Json): Json => ({ key, value });
/** A message trigger an Operation carries, the channel a correlated catch needs. */
export const channel = (over: Json = {}): Json => ({ messageRef: "M", name: text("M"), interfaceRef: "I", operationRef: "O", ...over });

// Elements.

const header = (id: string, sourceType: string, parent: string | null): Json =>
  ({ id, origin: { definition: null, sourceId: id }, sourceType, parent });

export const envelope = (over: Json = {}): Json => ({
  incoming: ["f1"], outgoing: ["f2"], inputs: [], outputs: [], boundaries: [], multiInstance: null, compensationHandlers: [], forCompensation: false,
  defaultFlow: null, asyncBefore: false, asyncAfter: false, ...over,
});

export const boundary = (id: string, trigger: Json | string, over: Json = {}, outputs: Json[] = []): Json =>
  ({ id, sourceId: id, subscription: subscription(trigger, outputs), interrupting: true, outgoing: [], ...over });

export const userWork = (over: Json = {}): Json => ({
  user: {
    payload: {
      name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [], dueDate: null,
      followUpDate: null, priority: null, ...over,
    },
  },
});
export const serviceWork = (protocol = "http", operation = "get", handlerKey: string | null = null): Json =>
  ({ service: { payload: { protocol, operation, handlerKey } } });
export const receiveWork = (over: Json = {}, instantiate = false, data: Json = {}): Json =>
  ({ receive: { payload: { message: messageBody(over), instantiate, dataOutputs: [], outputSets: 0, ...data } } });
/**
 * A Call Activity's work; unless `over` sets `calledQName`, a literal `calledElement` resolves to that id in the base
 * program's namespace, as the reader resolves an unprefixed name.
 */
export const callWork = (over: Json = {}): Json => {
  const calledElement = (over.calledElement ?? text("Called")) as Json;
  const literal = (calledElement.literal as Json | undefined)?.value;
  return {
    call: {
      payload: {
        calledElement, calledQName: typeof literal === "string" ? qName(literal) : null, binding: "latest", tenant: null,
        businessKey: null, inputs: [], outputs: [], propagateAllInputs: false, propagateAllOutputs: false, ...over,
      },
    },
  };
};

export const sendWork = (): Json => ({ send: { payload: { binding: { protocol: "http", operation: "post" }, handlerKey: null, recipient: null, correlation: [], messageRef: null, operationRef: null } } });
export const scriptWork = (over: Json = {}): Json =>
  ({ script: { payload: { format: "js", source: "1", resultVariable: null, resource: null, ...over } } });
export const ruleWork = (over: Json = {}): Json =>
  ({ rule: { payload: { decision: text("d"), resultVariable: null, binding: "latest", resultMapping: "singleEntry", tenant: null, ...over } } });

/** A Multi-Instance loop the kernel runs: one User Task per item of a collection variable, read once on entry. */
export const loop = (over: Json = {}): Json => ({
  mode: "parallel", count: { collection: { items: variable("items") } }, elementVariable: null, completionCondition: null,
  inputDataItem: "item", outputDataItem: "result", outputCollection: null,
  asyncBefore: false, asyncAfter: false, loopDataInputRef: null, inputDataItemName: null, ...over,
});

/** The definition a called process is bound to; a binding field set here is refused. */
export const definitionRef = (key: string, over: Json = {}): Json =>
  ({ key, namespace: null, version: null, versionTag: null, deployment: null, tenant: null, sourceSha256: null, ...over });

/** An Activity: `work` is a `Work` value, `env` overrides the envelope fields, `parent` its enclosing Scope. */
export const activity = (id: string, work: Json | string, env: Json = {}, parent: string | null = null): Json =>
  ({ activity: { header: header(id, "task", parent), payload: { work, envelope: envelope(env) } } });

export const start = (id: string, trigger: Json | string | null = null, outputs: Json[] = [], parent: string | null = null): Json => ({
  start: {
    header: header(id, "startEvent", parent),
    payload: { subscription: trigger === null ? null : subscription(trigger, outputs), outgoing: ["f1"] },
  },
});

const event = (id: string, sourceType: string, role: Json, placement: string, parent: string | null, incoming: string[],
  alternativeThrows: Array<Json | string> = []): Json =>
  ({ event: { header: header(id, sourceType, parent), payload: { role, placement, incoming, outgoing: [], alternativeThrows } } });

/** An End Event throwing `record` (a `Throw` value), and `alternativeThrows` besides it as a Multiple End Event. */
export const end = (id: string, record: Json | string = "none", parent: string | null = null, alternativeThrows: Array<Json | string> = []): Json =>
  event(id, "endEvent", { throw: { record } }, "finish", parent, ["f2"], alternativeThrows);

export const catchEvent = (id: string, trigger: Json | string, outputs: Json[] = [], parent: string | null = null): Json =>
  event(id, "intermediateCatchEvent", { catch: { subscription: subscription(trigger, outputs) } }, "intermediate", parent, ["f1"]);

export const link = (id: string, role: "linkCatch" | "linkThrow", name: string, parent: string | null = null): Json =>
  event(id, role === "linkCatch" ? "intermediateCatchEvent" : "intermediateThrowEvent", { [role]: { name } }, "intermediate", parent,
    role === "linkCatch" ? [] : ["f1"]);

/** An Event-Based Gateway's kind; `instantiation` is `none`, `exclusive` or `parallel`. */
export const eventBased = (instantiation = "none"): Json => ({ eventBased: { instantiation } });

export const gateway = (id: string, kind: Json | string, over: Json = {}, parent: string | null = null): Json =>
  ({ gateway: { header: header(id, "gateway", parent), payload: { kind, incoming: ["f1"], outgoing: ["f2"], ...over } } });

/** A Scope; `kind` is `"embedded"`, a transaction or an Event Sub-Process kind. */
export const scope = (id: string, kind: Json | string, over: Json = {}, env: Json = {}, parent: string | null = null): Json => ({
  scope: {
    header: header(id, "subProcess", parent),
    payload: { kind, children: [], localVariables: [], items: [], envelope: envelope(env), ...over },
  },
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
export const conditionOn = (program: Json, id: string, conditionExpression: Json | null): Json =>
  ({ ...program, flows: (program.flows as Json[]).map((entry) => (entry.id === id ? { ...entry, condition: conditionExpression } : entry)) });

export const append = (program: Json, ...elements: Json[]): Json => ({ ...program, elements: [...(program.elements as Json[]), ...elements] });

/** The program with `flows` added. */
export const withFlows = (program: Json, ...flows: Json[]): Json => ({ ...program, flows: [...(program.flows as Json[]), ...flows] });

/**
 * `T` becomes an Exclusive Gateway choosing among `candidates` with the default `fd`, a second flow to `E`: a sole
 * conditioned candidate without a default is refused (`gateway.exclusive.singleConditionWithoutDefault`).
 */
export const choice = (candidates: string[]) => (program: Json): Json =>
  withFlows(replace(program, "T", gateway("T", { exclusive: { candidates, default: "fd" } })), flow("fd", "T", "E"));

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
  /** The row is admitted as written, without `wired`. */
  raw?: boolean;
}>;

const payloadOf = (element: Json): Json => (Object.values(element)[0] as Json).payload as Json;

/**
 * The program with the flows whose endpoints it lacks removed, every element's and boundary's flow lists rebuilt from
 * the remaining flows, and every Scope's children rebuilt from the elements naming it as parent.
 */
export function wired(program: Json): Json {
  const elements = program.elements as Json[];
  const ids = new Set(elements.map(elementId));
  const boundaryIds = new Set(elements.flatMap((element) =>
    (((payloadOf(element).envelope as Json | undefined)?.boundaries as Json[] | undefined) ?? []).map((entry) => entry.id as string)));
  const flows = (program.flows as Json[]).filter((entry) =>
    (ids.has(entry.source as string) || boundaryIds.has(entry.source as string)) && ids.has(entry.target as string));
  const into = (id: string): string[] => flows.filter((entry) => entry.target === id).map((entry) => entry.id as string);
  const from = (id: string): string[] => flows.filter((entry) => entry.source === id).map((entry) => entry.id as string);
  const rewired = elements.map((element) => {
    const [tag, body] = Object.entries(element)[0] as [string, Json];
    const id = elementId(element);
    const payload = body.payload as Json;
    const children = elements.filter((child) => ((Object.values(child)[0] as Json).header as Json).parent === id).map(elementId);
    const lists = (over: Json): Json => {
      const envelope = over.envelope as Json | undefined;
      if (envelope === undefined) return tag === "start" ? { ...over, outgoing: from(id) } : { ...over, incoming: into(id), outgoing: from(id) };
      const boundaries = (envelope.boundaries as Json[]).map((entry) => ({ ...entry, outgoing: from(entry.id as string) }));
      return { ...over, envelope: { ...envelope, incoming: into(id), outgoing: from(id), boundaries } };
    };
    const rebuilt = tag === "scope" ? lists({ ...payload, children }) : lists(payload);
    return { [tag]: { ...body, payload: rebuilt } };
  });
  return { ...program, elements: rewired, flows };
}

/**
 * The first refusal of `json` after it decodes, wired unless `raw`: a decode failure is a defect of the row, never a
 * refusal.
 */
export function refusalOf(json: Json, raw = false): string | null {
  const decoded = decodeProgram(raw ? json : wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : `the row's program does not decode: ${decoded.refusal}`);
  return admit(decoded.value);
}

/** One test per row, plus one that the unmutated base program is admitted. */
export function refusalTests(family: string, rows: readonly Row[]): void {
  test(`${family}: the base program is admitted`, () => assert.equal(refusalOf(base()), null));
  for (const row of rows) {
    test(`${family}: ${row.description} is refused as ${row.code}`, () => {
      assert.equal(refusalOf(row.mutate(base()), row.raw), row.code);
      if (row.control !== undefined) assert.equal(refusalOf(row.control(base()), row.raw), null, "the control form is admitted");
    });
  }
}
