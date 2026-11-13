/**
 * Showcase-side driver that answers only the waits a committed state publishes, moved from the old adapter's runner
 * (`packages/temporal-adapter/runner/src/host-interaction-driver.ts` and `host-interaction-plan.ts` at the kernel
 * rewrite's start) onto the canonical observation and the host's Updates.
 *
 * The driver is blind to BPMN topology and element roles: it reads the observation's open waits, matches them against
 * a declared plan, and submits ordinary `command` and `deliver` Updates. The plan selects *which* published wait to
 * answer; the occurrence identity always comes from the publication, so no showcase code constructs one.
 *
 * Precedence per committed state is load-bearing:
 *
 * 1. answer the first unconsumed response whose wait is open;
 * 2. otherwise keep waiting while a Timer or effect wait is open, because the host resolves those and may withdraw
 *    the other waits (an Event-Based Gateway's Message wait that its Timer is expected to win);
 * 3. otherwise refuse, distinguishing an open wait nobody answers from a Process that can no longer progress.
 *
 * Declared response order, never observation order, decides between two answerable waits.
 */
import { setTimeout as hostDelay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

import type { EngineBinding, EngineOpenWait, EngineStateObservation } from "@bpmn-lean/engine-api";
import type { CommandResult } from "@bpmn-lean/temporal-host/client";

/** The plan vocabulary of `examples/temporal-mvp/*.json`; its kinds are the old canonical stimulus kinds. */
export const InteractionResponseKind = {
  CompleteUserTask: "completeUserTaskInstance",
  DeliverMessage: "deliverMessage",
  DeliverPayloadMessage: "deliverPayloadMessage",
} as const;

export type MessageChannel = Readonly<
  | { kind: "directMessage"; messageId: string }
  | { kind: "operationMessage"; interfaceId: string; interfaceOperationId: string; messageId: string }
>;

type TypedValue = Readonly<{ kind: string } & Record<string, unknown>>;

export type InteractionResponse = Readonly<
  | {
      kind: typeof InteractionResponseKind.CompleteUserTask;
      elementId: string;
      delayMs: number;
      inputVariableNames: readonly string[];
      submittedValues: readonly EngineBinding[];
    }
  | { kind: typeof InteractionResponseKind.DeliverMessage; channel: MessageChannel; delayMs: number }
  | { kind: typeof InteractionResponseKind.DeliverPayloadMessage; channel: MessageChannel; payload: TypedValue; delayMs: number }
>;

export type InteractionPort = Readonly<{
  readState: () => Promise<EngineStateObservation>;
  command: (stimulus: Readonly<Record<string, unknown>>) => Promise<CommandResult>;
  deliver: (stimulus: Readonly<Record<string, unknown>>) => Promise<CommandResult>;
}>;

export const InteractionEventKind = {
  StateObserved: "stateObserved",
  InteractionReady: "interactionReady",
  DelayStarted: "delayStarted",
  DelayFinished: "delayFinished",
  InteractionResolved: "interactionResolved",
  HostWaitObserved: "hostWaitObserved",
} as const;

export type InteractionEvent = Readonly<
  | { kind: typeof InteractionEventKind.StateObserved; state: EngineStateObservation }
  | { kind: typeof InteractionEventKind.InteractionReady; wait: EngineOpenWait }
  | { kind: typeof InteractionEventKind.DelayStarted | typeof InteractionEventKind.DelayFinished; delayMs: number }
  | { kind: typeof InteractionEventKind.InteractionResolved; result: CommandResult }
  | { kind: typeof InteractionEventKind.HostWaitObserved; openTimers: number; openEffects: number }
>;

export const InteractionResultKind = {
  Driven: "driven",
  Refused: "refused",
} as const;

export const InteractionRefusalCode = {
  UnmatchedOpenWait: "unmatchedOpenWait",
  AmbiguousResponse: "ambiguousResponse",
  InteractionNotCommitted: "interactionNotCommitted",
  TaskInputsUnavailable: "taskInputsUnavailable",
  UnconsumedResponses: "unconsumedResponses",
  StalledProcess: "stalledProcess",
  UnknownStatus: "unknownStatus",
  ObservationLimitExceeded: "observationLimitExceeded",
} as const;

export type InteractionResult = Readonly<
  | { kind: typeof InteractionResultKind.Driven; submitted: number }
  | {
      kind: typeof InteractionResultKind.Refused;
      code: typeof InteractionRefusalCode[keyof typeof InteractionRefusalCode];
      evidence: string;
      result?: CommandResult;
    }
>;

/**
 * Bounds how many committed states one run may read. A host-resolved wait that never resolves would otherwise poll
 * forever; exceeding the bound is a showcase refusal, never a BPMN outcome.
 */
const observationLimit = 600;
const hostPollIntervalMs = 250;

type PendingResponse = { readonly response: InteractionResponse; readonly index: number; consumed: boolean };

export async function driveInteractions(
  plan: readonly InteractionResponse[],
  port: InteractionPort,
  wait: (delayMs: number) => Promise<void> = waitForHostDelay,
  observe: (event: InteractionEvent) => void = () => undefined,
): Promise<InteractionResult> {
  const pending: PendingResponse[] = plan.map((response, index) => ({ response, index, consumed: false }));
  let submitted = 0;
  for (let step = 0; step < observationLimit; step += 1) {
    const state = await port.readState();
    observe({ kind: InteractionEventKind.StateObserved, state });
    switch (state.status) {
      case "completed":
      case "cancelled":
      case "failed": {
        const unconsumed = pending.filter(({ consumed }) => !consumed).length;
        return unconsumed > 0
          ? refuse(
              InteractionRefusalCode.UnconsumedResponses,
              `Process terminated with ${unconsumed} configured interaction response(s) never answered.`,
            )
          : { kind: InteractionResultKind.Driven, submitted };
      }
      case "running":
        break;
      default:
        return refuse(InteractionRefusalCode.UnknownStatus, `Process published unknown status ${state.status}.`);
    }
    const selection = selectWait(pending, state.openWaits);
    switch (selection.kind) {
      case SelectionKind.Ambiguous:
        return refuse(
          InteractionRefusalCode.AmbiguousResponse,
          `One configured response matches ${selection.matches} open waits; the driver does not choose between them.`,
        );
      case SelectionKind.None: {
        const openTimers = waitsOf(state, "timer").length;
        const openEffects = waitsOf(state, "effect").length;
        if (openTimers + openEffects > 0) {
          observe({ kind: InteractionEventKind.HostWaitObserved, openTimers, openEffects });
          await wait(hostPollIntervalMs);
          continue;
        }
        return state.openWaits.length > 0
          ? refuse(
              InteractionRefusalCode.UnmatchedOpenWait,
              `${state.openWaits.length} wait(s) are open and no unconsumed response answers any of them.`,
            )
          : refuse(InteractionRefusalCode.StalledProcess, "Running Process published no open wait.");
      }
      case SelectionKind.Matched:
        break;
      default:
        return assertNever(selection);
    }
    const outcome = await answer(selection.wait, selection.pending, port, wait, observe);
    if (outcome.kind === InteractionResultKind.Refused) return outcome;
    selection.pending.consumed = true;
    submitted += 1;
  }
  return refuse(
    InteractionRefusalCode.ObservationLimitExceeded,
    `Run read ${observationLimit} committed states without reaching a terminal Process.`,
  );
}

const SelectionKind = {
  Matched: "matched",
  None: "none",
  Ambiguous: "ambiguous",
} as const;

type Selection =
  | { kind: typeof SelectionKind.Matched; pending: PendingResponse; wait: EngineOpenWait }
  | { kind: typeof SelectionKind.None }
  | { kind: typeof SelectionKind.Ambiguous; matches: number };

function selectWait(pending: readonly PendingResponse[], waits: readonly EngineOpenWait[]): Selection {
  for (const candidate of pending) {
    if (candidate.consumed) continue;
    const matches = waits.filter((wait) => answersWait(candidate.response, wait));
    if (matches.length > 1) return { kind: SelectionKind.Ambiguous, matches: matches.length };
    const [wait] = matches;
    if (wait !== undefined) return { kind: SelectionKind.Matched, pending: candidate, wait };
  }
  return { kind: SelectionKind.None };
}

/**
 * A plain delivery answers only an uncorrelated Message wait of the same channel; its payload arm must agree with
 * whether the wait takes a payload, since the kernel refuses a mismatched delivery.
 */
function answersWait(response: InteractionResponse, wait: EngineOpenWait): boolean {
  const detail = wait.detail;
  switch (response.kind) {
    case InteractionResponseKind.CompleteUserTask:
      return detail.kind === "userTask" && wait.id.elementId === response.elementId;
    case InteractionResponseKind.DeliverMessage:
    case InteractionResponseKind.DeliverPayloadMessage:
      return detail.kind === "message" &&
        isDeepStrictEqual(detail.channel, response.channel) &&
        detail.payload === (response.kind === InteractionResponseKind.DeliverPayloadMessage) &&
        Array.isArray(detail.criteria) && detail.criteria.length === 0;
    default:
      return assertNever(response);
  }
}

async function answer(
  wait: EngineOpenWait,
  pending: PendingResponse,
  port: InteractionPort,
  delay: (delayMs: number) => Promise<void>,
  observe: (event: InteractionEvent) => void,
): Promise<InteractionResult> {
  const { response } = pending;
  if (response.kind === InteractionResponseKind.CompleteUserTask && !publishesInputs(wait, response.inputVariableNames)) {
    return refuse(
      InteractionRefusalCode.TaskInputsUnavailable,
      "Published User Task wait does not carry the configured input variables.",
    );
  }
  observe({ kind: InteractionEventKind.InteractionReady, wait });
  observe({ kind: InteractionEventKind.DelayStarted, delayMs: response.delayMs });
  await delay(response.delayMs);
  observe({ kind: InteractionEventKind.DelayFinished, delayMs: response.delayMs });
  const result = await submit(wait, pending, port);
  observe({ kind: InteractionEventKind.InteractionResolved, result });
  return result.outcome === "committed"
    ? { kind: InteractionResultKind.Driven, submitted: 1 }
    : {
        kind: InteractionResultKind.Refused,
        code: InteractionRefusalCode.InteractionNotCommitted,
        evidence: "The kernel did not commit the submitted interaction; its typed result is reported unchanged.",
        result,
      };
}

function publishesInputs(wait: EngineOpenWait, names: readonly string[]): boolean {
  const inputs = wait.detail.inputs;
  if (!Array.isArray(inputs)) return false;
  const published = new Set(inputs.map((input) => (input as { name?: unknown } | null)?.name));
  return names.every((name) => published.has(name));
}

/**
 * Builds the stimulus from the published wait only. A Message command is bound to its declared response slot, so
 * repeated deliveries at one persistent subscription stay distinct and the same plan is deterministic across retries.
 */
function submit(wait: EngineOpenWait, pending: PendingResponse, port: InteractionPort): Promise<CommandResult> {
  const { response, index } = pending;
  switch (response.kind) {
    case InteractionResponseKind.CompleteUserTask:
      return port.command({
        kind: "command",
        commandId: `mvp-complete-task:${wait.id.elementId}:${wait.id.activation}`,
        occurrence: wait.id,
        action: { kind: "completeUserTask", values: response.submittedValues },
      });
    case InteractionResponseKind.DeliverMessage:
    case InteractionResponseKind.DeliverPayloadMessage:
      return port.deliver({
        kind: "deliver",
        commandId: `mvp-deliver-message:${wait.id.elementId}:${wait.id.activation}:response:${index}`,
        occurrence: wait.id,
        trigger: { kind: "message", channel: wait.detail.channel },
        ...(response.kind === InteractionResponseKind.DeliverPayloadMessage ? { payload: response.payload } : {}),
      });
    default:
      return assertNever(response);
  }
}

export function waitsOf(state: EngineStateObservation, kind: string): readonly EngineOpenWait[] {
  return state.openWaits.filter((wait) => wait.detail.kind === kind);
}

function refuse(code: typeof InteractionRefusalCode[keyof typeof InteractionRefusalCode], evidence: string): InteractionResult {
  return { kind: InteractionResultKind.Refused, code, evidence };
}

async function waitForHostDelay(delayMs: number): Promise<void> {
  await hostDelay(delayMs, undefined, { ref: false });
}

export function validateInteractionPlan(value: unknown): asserts value is readonly InteractionResponse[] {
  if (!Array.isArray(value)) throw new TypeError("Interaction plan must be an array");
  for (const response of value) {
    const record = requireRecord(response, "Interaction response");
    switch (record.kind) {
      case InteractionResponseKind.CompleteUserTask:
        requireExactKeys(record, ["kind", "elementId", "delayMs", "inputVariableNames", "submittedValues"], "User Task completion response");
        requireName(record.elementId, "Completion response elementId");
        requirePositiveInteger(record.delayMs, "Completion response delayMs");
        requireUniqueNames(requireArray(record.inputVariableNames, "Completion response inputVariableNames"), "inputVariableNames");
        requireBindings(record.submittedValues, "Completion response submittedValues");
        break;
      case InteractionResponseKind.DeliverMessage:
      case InteractionResponseKind.DeliverPayloadMessage: {
        const payload = record.kind === InteractionResponseKind.DeliverPayloadMessage;
        requireExactKeys(record, payload ? ["kind", "channel", "payload", "delayMs"] : ["kind", "channel", "delayMs"], "Message delivery response");
        requirePositiveInteger(record.delayMs, "Delivery response delayMs");
        requireChannel(record.channel);
        if (payload) requireTypedValue(record.payload, "Payload delivery response payload");
        break;
      }
      default:
        throw new TypeError(`Interaction response kind is not answered by this showcase driver: ${String(record.kind)}`);
    }
  }
}

function requireChannel(value: unknown): void {
  const channel = requireRecord(value, "Message channel");
  switch (channel.kind) {
    case "directMessage":
      requireExactKeys(channel, ["kind", "messageId"], "Direct Message channel");
      requireName(channel.messageId, "Message channel messageId");
      return;
    case "operationMessage":
      requireExactKeys(channel, ["kind", "interfaceId", "interfaceOperationId", "messageId"], "Operation Message channel");
      for (const key of ["interfaceId", "interfaceOperationId", "messageId"]) requireName(channel[key], `Message channel ${key}`);
      return;
    default:
      throw new TypeError(`Message channel kind is unknown: ${String(channel.kind)}`);
  }
}

function requireBindings(value: unknown, label: string): void {
  const bindings = requireArray(value, label);
  requireUniqueNames(bindings.map((binding) => {
    const record = requireRecord(binding, `${label} binding`);
    requireExactKeys(record, ["name", "value"], `${label} binding`);
    requireTypedValue(record.value, `${label} value`);
    return record.name;
  }), label);
}

function requireTypedValue(value: unknown, label: string): void {
  if (typeof requireRecord(value, label).kind !== "string") throw new TypeError(`${label} must name its kind`);
}

function requireUniqueNames(names: readonly unknown[], label: string): void {
  for (const name of names) requireName(name, `${label} name`);
  if (new Set(names).size !== names.length) throw new TypeError(`${label} repeats a name`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} must have exactly the fields ${expected.join(", ")}`);
  }
}

function requireName(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be a nonempty Unicode scalar string`);
  }
}

function requirePositiveInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new RangeError(`${label} must be a positive safe integer`);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(value)}`);
}
