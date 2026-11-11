/**
 * Kernel hooks, transcribed from `Kernel/Hooks.lean`.
 *
 * The one seam between the generic step and the features. `step.ts` dispatches on element, event role, input and
 * signal and calls the field for that case; `registry.ts` fills the fields from the features. A lifecycle field a
 * registry leaves at its default refuses with `unsupported`, so an unregistered mechanism never silently drops a token;
 * the notification fields default to no-ops. The order in which `step.ts` calls hooks is semantic and owned by it
 * alone. Features never call each other: a feature that needs another feature's mechanism enqueues a `Signal`.
 */
import {
  MappingDialect,
  OutputContext,
  ValueTag,
  assertNever,
  compareStrings,
  mergeSort,
  elementEvent,
  elementScope,
  elementStart,
  eventPayloadCatch,
  programBoundary,
  programElement,
  programPublicId,
  utf8ByteSize,
  type ActivityPayload,
  type Boundary,
  type ElementId,
  type Envelope,
  type EventPayload,
  type Expression,
  type GatewayPayload,
  type Header,
  type Mapping,
  type MessageTrigger,
  type MultiInstance,
  type Program,
  type ScopePayload,
  type StartPayload,
  type Subscription,
  type Throw,
  type Trigger,
  type Value,
} from "./il/types.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  SignalTag,
  WriteRule,
  committed,
  failed,
  failedWith,
  instanceOf,
  leaveFlows,
  occurrenceOf,
  openKindView,
  signal,
  visible,
  type Binding,
  type CommandAction,
  type CorrelationMatch,
  type DeliveryInput,
  type DeliveryTrigger,
  type EffectOutcome,
  type EvalContext,
  type Fired,
  type Leave,
  type MessageChannel,
  type MultiInstanceRun,
  type Occurrence,
  type OccurrenceRef,
  type OpenItem,
  type Origin,
  type Outcome,
  type Parked,
  type Raised,
  type Result,
  type Resume,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type StartInput,
  type StartTrigger,
  type State,
  type WaitView,
  type WriteEvent,
} from "./state.js";
// Lean's `Kernel.Hooks` re-exports `Kernel.State.Removal` to the features and `Kernel.Step`; so does this module, which
// keeps the removal module's direct importers to this hub (guard 15).
export {
  cancelOccurrence, clearInside, idleWithout, leaveScope, removeOccurrence, withdrawInside, withdrawOccurrence,
} from "./state/removal.js";

/**
 * An in-kernel evaluation. A failure is an absent reference (`unknown-variable`), which `Mapping.dialect` reads, or a
 * JUEL evaluation error (`juel.*`), which rolls the command back (CIB-OP-0004); `unsupported` is a value or Java
 * surface the kernel does not represent, never a semantic outcome
 * ([expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#failure-semantics)).
 */
export enum EvaluationTag {
  Value = "value",
  Failure = "failure",
  Unsupported = "unsupported",
}

export type Evaluation =
  | { readonly tag: EvaluationTag.Value; readonly result: Value }
  | { readonly tag: EvaluationTag.Failure; readonly code: string }
  | { readonly tag: EvaluationTag.Unsupported; readonly code: string };

/**
 * Whether a scope occurrence is a Multi-Instance instance, a compensation handler's context or ordinary. Filled by
 * `step.ts`, which matches `Continuation` and reads the two feature slots that say so.
 */
export enum ScopeRole {
  Ordinary = "ordinary",
  MultiInstanceInstance = "multiInstanceInstance",
  CompensationHandler = "compensationHandler",
}

/** The channel a Message trigger waits on: its Message's and Operation's identifiers, never its name (PC-MESSAGE-01). */
export function messageTriggerChannel(trigger: MessageTrigger): MessageChannel {
  return { messageId: trigger.messageRef, interfaceRef: trigger.interfaceRef, operationRef: trigger.operationRef };
}

export function deliveryTriggerChannel(trigger: DeliveryTrigger): MessageChannel | null {
  switch (trigger.tag) {
    case DeliveryTriggerTag.Message:
      return trigger.channel;
    case DeliveryTriggerTag.Signal:
      return null;
  }
  return assertNever(trigger);
}

/**
 * The members of an input collection in order, `null` for a value that is not a collection; a String List's members
 * are Strings.
 */
export function collectionItems(collection: Value): readonly Value[] | null {
  switch (collection.tag) {
    case ValueTag.StringList:
      return collection.items.map((value): Value => ({ tag: ValueTag.String, value }));
    case ValueTag.List:
      return collection.items;
    case ValueTag.Null:
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.Decimal:
    case ValueTag.String:
    case ValueTag.Map:
      return null;
  }
  return assertNever(collection);
}

export const multiInstanceRunItems = (run: MultiInstanceRun): readonly Value[] | null => collectionItems(run.collection);

// The portable value domain (docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#values). Step checks every input's values
// against it and features measure submissions by it; they share it here because they never import each other.

/**
 * Bytes `JSON.stringify` emits for `text` as a JSON string, quotes included: a quote, a backslash and the five named
 * controls take two bytes, every other control six (`\u00XX`). Every escaped byte is ASCII, so the census runs over the
 * UTF-8 bytes.
 */
export function stringBytes(text: string): number {
  let total = 2;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const named = code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x22 || code === 0x5c;
    total += code >= 0x80 ? utf8ByteSize(char) : named ? 2 : code < 0x20 ? 6 : 1;
  }
  return total;
}

/** Bytes of a JSON array whose members take `sizes`, brackets and separators included. */
export function arrayBytes(sizes: readonly number[]): number {
  return 2 + sizes.reduce((sum, size) => sum + size, 0) + Math.max(0, sizes.length - 1);
}

const shellBytes = (shell: string): number => utf8ByteSize(shell);

/**
 * The canonical JSON bytes of a portable value: no whitespace, `kind` before `value` (or `coefficient` and `scale`),
 * Map entries `name` before `value`; the field order changes no count. A String List is outside the portable value
 * arms and has no measure.
 */
export function valueBytes(value: Value): number | null {
  switch (value.tag) {
    case ValueTag.Null:
      return shellBytes("{\"kind\":\"null\"}");
    case ValueTag.Bool:
      return shellBytes("{\"kind\":\"boolean\",\"value\":}") + utf8ByteSize(String(value.value));
    case ValueTag.Int:
      return shellBytes("{\"kind\":\"integer\",\"value\":}") + utf8ByteSize(String(value.value));
    case ValueTag.Decimal:
      return shellBytes("{\"kind\":\"decimal\",\"coefficient\":,\"scale\":}") + stringBytes(value.coefficient.toString()) +
        utf8ByteSize(String(value.scale));
    case ValueTag.String:
      return shellBytes("{\"kind\":\"string\",\"value\":}") + stringBytes(value.value);
    case ValueTag.StringList:
      return null;
    case ValueTag.List: {
      const items = itemsBytes(value.items);
      return items === null ? null : shellBytes("{\"kind\":\"list\",\"value\":}") + arrayBytes(items);
    }
    case ValueTag.Map: {
      const entries = entriesBytes(value.entries);
      return entries === null ? null : shellBytes("{\"kind\":\"map\",\"value\":}") + arrayBytes(entries);
    }
  }
  return assertNever(value);
}

function itemsBytes(items: readonly Value[]): readonly number[] | null {
  const sizes: number[] = [];
  for (const item of items) {
    const size = valueBytes(item);
    if (size === null) return null;
    sizes.push(size);
  }
  return sizes;
}

/** Each entry as `{"name":…,"value":…}`. */
export function entriesBytes(entries: readonly Binding[]): readonly number[] | null {
  const sizes: number[] = [];
  for (const [name, value] of entries) {
    const size = valueBytes(value);
    if (size === null) return null;
    sizes.push(shellBytes("{\"name\":,\"value\":}") + stringBytes(name) + size);
  }
  return sizes;
}

/** A Decimal in canonical form: zero at scale 0; else scale `0..6`, a signed 64-bit coefficient, no trailing zero at a positive scale. */
export function canonicalDecimal(coefficient: bigint, scale: bigint): boolean {
  if (coefficient === 0n) return scale === 0n;
  return scale >= 0n && scale <= 6n && BigInt.asIntN(64, coefficient) === coefficient && (scale === 0n || coefficient % 10n !== 0n);
}

/** Map keys of at most `textBytes` UTF-8 bytes, in strictly increasing Unicode-scalar order. */
function keysInDomain(entries: readonly Binding[]): boolean {
  return entries.every(([key], index) => utf8ByteSize(key) <= textBytes &&
    (index === 0 || compareStrings(entries[index - 1]?.[0] ?? "", key) < 0));
}

/** The portable domain's bounds: project policy, not CIB limits (the portable-values contract's "Finite limits"). */
const containerLevels = 4;
const containerMembers = 32;
const valueNodes = 256;
const valueJsonBytes = 16384;
const textBytes = 1024;
const integerBound = 9007199254740991;

/**
 * The value nodes of `value`, the root included, when every node lies in the portable domain and no container is
 * nested deeper than `containerLevels` counting from `depth` containers above it; `null` otherwise. A String List is
 * outside the portable arms at every depth.
 */
function domainNodes(value: Value, depth: number): number | null {
  switch (value.tag) {
    case ValueTag.Null:
    case ValueTag.Bool:
      return 1;
    case ValueTag.Int:
      return Number.isSafeInteger(value.value) && value.value >= 0 && value.value <= integerBound ? 1 : null;
    case ValueTag.Decimal:
      return canonicalDecimal(value.coefficient, BigInt(value.scale)) ? 1 : null;
    case ValueTag.String:
      return utf8ByteSize(value.value) <= textBytes ? 1 : null;
    case ValueTag.StringList:
      return null;
    case ValueTag.List:
      return depth < containerLevels && value.items.length <= containerMembers ? memberNodes(value.items, depth + 1) : null;
    case ValueTag.Map:
      return depth < containerLevels && value.entries.length <= containerMembers && keysInDomain(value.entries)
        ? memberNodes(value.entries.map(([, member]) => member), depth + 1)
        : null;
  }
  return assertNever(value);
}

function memberNodes(members: readonly Value[], depth: number): number | null {
  let total = 1;
  for (const member of members) {
    const nodes = domainNodes(member, depth);
    if (nodes === null) return null;
    total += nodes;
  }
  return total;
}

/**
 * Whether `value` may be a variable's value: a portable value within every bound, or a `stringList` as a whole variable
 * value with at most `containerMembers` Strings of at most `textBytes` bytes, the bounds its wire form has
 * (DATA-SEMANTICS-SPEC "Values").
 */
export function inValueDomain(value: Value): boolean {
  if (value.tag === ValueTag.StringList) {
    return value.items.length <= containerMembers && value.items.every((item) => utf8ByteSize(item) <= textBytes);
  }
  const nodes = domainNodes(value, 0);
  const bytes = valueBytes(value);
  return nodes !== null && nodes <= valueNodes && bytes !== null && bytes <= valueJsonBytes;
}

/** Refuse an input whose values leave the domain, before its transition: rejected whole, never truncated. */
export function admitValues(values: readonly Value[]): Result<null> {
  return values.every(inValueDomain) ? committed(null) : failed(FailureTag.Rejected, "value-outside-domain");
}

/** Lean's `admitValues values *> next`, as `Kernel.Step` writes it: `next` runs only on values inside the domain. */
export function admitThen<T>(values: readonly Value[], next: () => Result<T>): Result<T> {
  const admitted = admitValues(values);
  return admitted.ok ? next() : failedWith(admitted.failure);
}

/**
 * The start Event a start input starts among the starts its trigger fired (`Hooks.startsFired`): the one it names, else
 * the only one; several unnamed are `start-ambiguous`, since one input starts one instance at one start.
 */
export function chooseStart(named: ElementId | null, fired: readonly ElementId[]): Result<ElementId> {
  if (named !== null) return fired.includes(named) ? committed(named) : failed(FailureTag.Rejected, "no-start-event");
  const [only, ...others] = fired;
  if (only === undefined) return failed(FailureTag.Rejected, "no-start-event");
  return others.length === 0 ? committed(only) : failed(FailureTag.Rejected, "start-ambiguous");
}

/** Hold an occurrence whose InputSet is unavailable (`FeatureSlots.held`). */
export function hold(state: State, held: Parked): State {
  return { ...state, slots: { ...state.slots, held: [...state.slots.held, held] } };
}

/** What an expression evaluated from `scope` reads. */
export function evalContext(state: State, scope: ScopeOccurrenceId): EvalContext {
  return { variables: visible(state, scope), nowMs: state.logicalTimeMs };
}

/** The variables `scope` itself holds, without the chain behind it. */
export function ownVariables(state: State, scope: ScopeOccurrenceId): readonly Binding[] {
  return state.variables.find((entry) => entry.scope === scope)?.entries ?? [];
}

/** How a catch trigger catches a raised event: its precedence, lower first, and the variables it writes. */
export interface Catch {
  readonly rank: number;
  readonly writes: readonly Binding[];
}

/**
 * What every hook may read: the program, the evaluator the profile selects, and the cross-owner queries. A feature
 * that needs to inspect a guarded type it does not own asks that type's owner through one of these queries, which
 * `step.ts` fills from the `Hooks` field of the same name.
 */
export interface Ctx {
  readonly program: Program;
  readonly evaluate: (context: EvalContext, expression: Expression) => Evaluation;
  /** Subscriptions: how a catch trigger catches a raised event, or `null` when it does not catch it. */
  readonly catches: (raised: Raised, trigger: Trigger) => Catch | null;
  /** Scopes: the start subscription and interrupting flag of an Event Sub-Process, `null` for another scope. */
  readonly eventStart: (payload: ScopePayload) => readonly [Subscription, boolean] | null;
  /** `step.ts`: what a scope occurrence is, for a search that must not treat it as ordinary. */
  readonly scopeRole: (state: State, scope: ScopeOccurrenceId) => ScopeRole;
}

/**
 * `bindings` with only the last binding of each target, by target name: a target bound twice keeps the value written
 * last, as CIB's sequential writes do, and the bindings, one per target, then commute, so they are kept in the name
 * order a publication shows them in.
 */
export function lastWrites(bindings: readonly Binding[]): readonly Binding[] {
  const kept: Binding[] = [];
  for (let index = bindings.length - 1; index >= 0; index -= 1) {
    const binding = bindings[index] as Binding;
    if (!kept.some(([name]) => name === binding[0])) kept.unshift(binding);
  }
  return mergeSort(kept, (left, right) => compareStrings(left[0], right[0]) <= 0);
}

/**
 * Evaluate each mapping's source in document order, as CIB runs a parameter list one at a time (`IoMapping.java:38-48`),
 * against `reads(earlier)`, the context given the bindings `earlier` the mappings before it made. A failed source is
 * read by the mapping's dialect: a Data Association's source is unavailable (`null`, BPMN 2.0.2 §10.4.2, which the
 * caller decides on) and the later sources are still evaluated, an `ioParameter` expression rolls the command back with
 * the evaluation's own code (CIB-EXT-0024), and a `callVariable` copy reads null (CIB-EXT-0021). The first rollback or
 * `unsupported` ends the evaluation, so a later mapping is never reached, as in CIB, where the first throwing parameter
 * ends the command. A target bound twice keeps its last value (`lastWrites`). Features share it here because they
 * never import each other.
 */
export function ctxEvaluateMappingsWith(
  ctx: Ctx,
  reads: (earlier: readonly Binding[]) => EvalContext,
  mappings: readonly Mapping[],
): Result<readonly Binding[] | null> {
  const made: Binding[] = [];
  let available = true;
  for (const mapping of mappings) {
    const next = mappingStep(mapping, ctx.evaluate(reads(made), mapping.source));
    if (!next.ok) return next;
    if (next.value === null) available = false;
    else made.push([mapping.target, next.value]);
  }
  return committed(available ? lastWrites(made) : null);
}

/** `ctxEvaluateMappingsWith` where every mapping reads `context`, which no earlier mapping changes. */
export function ctxEvaluateMappings(ctx: Ctx, context: EvalContext, mappings: readonly Mapping[]): Result<readonly Binding[] | null> {
  return ctxEvaluateMappingsWith(ctx, () => context, mappings);
}

/** One mapping's binding, `null` when its Data Association source is unavailable. */
function mappingStep(mapping: Mapping, evaluation: Evaluation): Result<Value | null> {
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return committed(evaluation.result);
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
    case EvaluationTag.Failure:
      return unavailableSource(mapping, evaluation.code);
  }
  return assertNever(evaluation);
}

function unavailableSource(mapping: Mapping, code: string): Result<Value | null> {
  switch (mapping.dialect) {
    case MappingDialect.DataAssociation:
      return committed(null);
    case MappingDialect.IoParameter:
      return failed(FailureTag.RolledBack, code);
    case MappingDialect.CallVariable:
      return committed({ tag: ValueTag.Null });
  }
  return assertNever(mapping.dialect);
}

/**
 * What an Activity's or a Scope's next output mapping reads, given the outputs `written` before it: `own`, the frame's
 * submitted values and own locals, `installed`, the values the frame set before its outputs run, then `outer`, the
 * chain the outputs are written into. Under `OutputContext.activityScope` the outputs read every name where CIB holds
 * it when the next parameter resolves in the frame. CIB writes each output parameter into the outer scope before it
 * evaluates the next one (`IoMapping.java:44-48`, `OutputParameter.java:44-52`), so the outputs already written stand
 * behind `own`, the latest first. An installed value went through `setVariable` on the frame's execution
 * (`AbstractVariableScope.java:331-345`): one of a name the frame holds is that local and shadows, any other reached
 * its nearest owner or the root, where a later write of the same name replaces it, so it stands behind the written
 * outputs and ahead of the outer chain (CIB-EXT-0031).
 */
export function ctxOutputReads(
  ctx: Ctx, nowMs: number, own: readonly Binding[], installed: readonly Binding[], outer: readonly Binding[],
): (written: readonly Binding[]) => EvalContext {
  switch (ctx.program.options.outputContext) {
    case OutputContext.Submission:
      return () => ({ variables: [...installed, ...own, ...outer], nowMs });
    case OutputContext.ActivityScope: {
      const owned = (name: string): boolean => own.some(([other]) => other === name);
      const held = installed.filter(([name]) => owned(name));
      const outward = installed.filter(([name]) => !owned(name));
      return (written) => ({ variables: [...held, ...own, ...[...written].reverse(), ...outward, ...outer], nowMs });
    }
  }
  return assertNever(ctx.program.options.outputContext);
}

/** The bindings of `mappings` where an unavailable source has no state to wait in, a semantic failure. */
export function ctxRequireMappingsWith(
  ctx: Ctx, reads: (earlier: readonly Binding[]) => EvalContext, mappings: readonly Mapping[],
): Result<readonly Binding[]> {
  const evaluated = ctxEvaluateMappingsWith(ctx, reads, mappings);
  if (!evaluated.ok) return evaluated;
  return evaluated.value === null
    ? failed(FailureTag.SemanticFailure, "mapping-source-unavailable")
    : committed(evaluated.value);
}

/** `ctxRequireMappingsWith` where every mapping reads `context`. */
export function ctxRequireMappings(ctx: Ctx, context: EvalContext, mappings: readonly Mapping[]): Result<readonly Binding[]> {
  return ctxRequireMappingsWith(ctx, () => context, mappings);
}

/** The open item with the public identity `occurrence` whose view has the detail `detail` reads. */
export function itemOf(ctx: Ctx, state: State, occurrence: OccurrenceRef, detail: (view: WaitView) => unknown): OpenItem | null {
  return state.openItems.find((item) =>
    programPublicId(ctx.program, item.element) === occurrence.element &&
    occurrenceOf(state, item.occurrence)?.activation === occurrence.activation &&
    detail(openKindView(item.kind)) !== null &&
    instanceOf(state, item.scope) === occurrence.processInstanceId) ?? null;
}

/**
 * The subscription an open item belongs to: a boundary's, a catch Event's or an Event Sub-Process start's; an
 * Activity's own subscription (a Receive Task) is the work feature's. Subscriptions and Correlation share it here
 * because features never import each other.
 */
export function subscriptionOf(ctx: Ctx, item: OpenItem): Subscription | null {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) return boundary[1].subscription;
  const element = programElement(ctx.program, item.element);
  const event = element === null ? null : elementEvent(element);
  const catchEvent = event === null ? null : eventPayloadCatch(event[1]);
  if (catchEvent !== null) return catchEvent;
  const start = element === null ? null : elementStart(element);
  const parent = start === null || start[0].parent === null ? null : programElement(ctx.program, start[0].parent);
  const scope = parent === null ? null : elementScope(parent);
  return (scope === null ? null : ctx.eventStart(scope[1]))?.[0] ?? null;
}

/**
 * The one way a boundary fires: an interrupting boundary first cancels the occurrence `host` it hangs on, if any; then
 * the boundary's occurrence, the reservation `reserved` or a fresh one, begins and leaves on its flows in `scope`
 * (BPMN 2.0.2 §13.5.3, §10.5.6).
 */
export function boundaryFire(
  boundary: Boundary,
  host: number | null,
  reserved: number | null,
  scope: ScopeOccurrenceId,
  writes: readonly Binding[],
  state: State,
): State {
  const interrupted = boundary.interrupting && host !== null
    ? signal(state, { tag: SignalTag.Cancel, occurrence: host })
    : state;
  const leave = leaveFlows(boundary.outgoing);
  return signal(interrupted, reserved !== null
    ? { tag: SignalTag.Complete, occurrence: reserved, leave, writes, rule: WriteRule.Outward }
    : { tag: SignalTag.Occur, element: boundary.id, scope, leave, writes, rule: WriteRule.Outward });
}

/**
 * What a Scope begins with besides its evaluated inputs. `inner` is the reservation of an Event Sub-Process's start
 * Event, when a subscription triggered it.
 */
export interface ScopeEntry {
  readonly locals: readonly Binding[];
  readonly inner: number | null;
}

/** The default of every lifecycle hook: the mechanism is not registered. */
function refuse(code: string): Outcome {
  return failed(FailureTag.Unsupported, code);
}

export interface Hooks {
  /** Subscriptions: a start Event's occurrence began, fired by the trigger. */
  readonly arriveStart: (ctx: Ctx, header: Header, payload: StartPayload, trigger: StartTrigger, occurrence: Occurrence, state: State) => Outcome;
  /** Work: an Activity's occurrence began. */
  readonly arriveActivity: (ctx: Ctx, header: Header, payload: ActivityPayload, occurrence: Occurrence, state: State) => Outcome;
  /** MultiInstance: the body occurrence of an element with Multi-Instance loop characteristics began. */
  readonly arriveMultiInstance: (
    ctx: Ctx, header: Header, envelope: Envelope, loop: MultiInstance, occurrence: Occurrence, state: State) => Outcome;
  /** Scopes. */
  readonly arriveScope: (
    ctx: Ctx, header: Header, payload: ScopePayload, occurrence: Occurrence, entry: ScopeEntry, state: State) => Outcome;
  /** Flow. */
  readonly arriveGateway: (ctx: Ctx, header: Header, payload: GatewayPayload, occurrence: Occurrence, state: State) => Outcome;
  /** Subscriptions. */
  readonly arriveCatch: (
    ctx: Ctx, header: Header, payload: EventPayload, subscription: Subscription, occurrence: Occurrence, state: State) => Outcome;
  /** Propagation. */
  readonly arriveThrow: (
    ctx: Ctx, header: Header, payload: EventPayload, thrown: Throw, occurrence: Occurrence, state: State) => Outcome;
  /** Flow. */
  readonly arriveLink: (ctx: Ctx, header: Header, payload: EventPayload, occurrence: Occurrence, state: State) => Outcome;
  /** Scopes: the scope occurrence of a Scope element is idle. The last argument is its owning occurrence. */
  readonly completeScope: (
    ctx: Ctx, header: Header, payload: ScopePayload, scope: ScopeOccurrence, owner: Occurrence, state: State) => Outcome;
  /** Work: the root of a called process instance is idle; the header and payload are its Call Activity's. */
  readonly completeCall: (
    ctx: Ctx, header: Header, payload: ActivityPayload, root: ScopeOccurrence, owner: Occurrence, state: State) => Outcome;
  /** MultiInstance: the scope occurrence of a Multi-Instance body is idle. */
  readonly completeBody: (
    ctx: Ctx, header: Header, envelope: Envelope, loop: MultiInstance, occurrence: Occurrence, state: State) => Outcome;
  /** Work: complete an open User Task with the submitted values. */
  readonly completeUserTask: (
    ctx: Ctx, header: Header, payload: ActivityPayload, item: OpenItem, values: readonly Binding[], state: State) => Outcome;
  /** Work: the outcome of an open effect. */
  readonly effectResult: (ctx: Ctx, item: OpenItem, outcome: EffectOutcome, state: State) => Outcome;
  /** Work: retry an open incident or cancel its process. */
  readonly resolveIncident: (ctx: Ctx, item: OpenItem, action: CommandAction, state: State) => Outcome;
  /** Work: a message or timer subscription an Activity opened itself (a Receive Task) fired. */
  readonly triggerActivity: (
    ctx: Ctx, header: Header, payload: ActivityPayload, item: OpenItem, fired: Fired, state: State) => Outcome;
  /** Subscriptions: any other message or timer subscription fired. */
  readonly trigger: (ctx: Ctx, item: OpenItem, fired: Fired, state: State) => Outcome;
  /** Subscriptions: `Signal.arm`. */
  readonly arm: (ctx: Ctx, host: number, element: ElementId, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Subscriptions: `Signal.armScope`. */
  readonly armScope: (ctx: Ctx, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Subscriptions: `Signal.armGateway`. */
  readonly armGateway: (ctx: Ctx, occurrence: number, gateway: ElementId, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Propagation: `Signal.raise`. */
  readonly raise: (ctx: Ctx, raised: Raised, origin: Origin, state: State) => Outcome;
  /** Compensation: `Signal.compensate`. */
  readonly compensate: (
    ctx: Ctx,
    scope: ScopeOccurrenceId,
    activity: ElementId | null,
    trigger: OccurrenceRef,
    leave: number | null,
    resume: Resume | null,
    state: State,
  ) => Outcome;
  /** Compensation: `Signal.compensationFailed`. */
  readonly failCompensation: (
    ctx: Ctx, handler: ScopeOccurrenceId, code: string, message: string | null, origin: Origin, state: State) => Outcome;
  // The completion pipeline, in the order `step.ts` runs it
  /** Subscriptions: disarm the items attached to the completing occurrence. */
  readonly leave: (ctx: Ctx, occurrence: Occurrence, state: State) => Outcome;
  /**
   * Flow: resolve a completion's outgoing flows when the profile evaluates its conditions before its output writes
   * (`ConditionOrder.beforeOutputs`); otherwise the leave is unchanged and `outflow` resolves it.
   */
  readonly select: (ctx: Ctx, occurrence: Occurrence, leave: Leave, state: State) => Result<Leave>;
  /** Data: apply writes from a scope occurrence: a completion's, and `Signal.write`. */
  readonly writeOutputs: (ctx: Ctx, scope: ScopeOccurrenceId, writes: readonly Binding[], rule: WriteRule, state: State) => Outcome;
  /** Data: `Signal.remove`. */
  readonly removeVariables: (ctx: Ctx, scope: ScopeOccurrenceId, names: readonly string[], state: State) => Outcome;
  /** Compensation: retain the completed occurrence when its element has a handler. */
  readonly completed: (ctx: Ctx, occurrence: Occurrence, state: State) => Outcome;
  /** Flow: leave through flows. */
  readonly outflow: (ctx: Ctx, occurrence: Occurrence, leave: Leave, state: State) => Outcome;
  /** MultiInstance: one instance of the body occurrence completed. */
  readonly instanceCompleted: (ctx: Ctx, body: number, occurrence: Occurrence, writes: readonly Binding[], state: State) => Outcome;
  /** Compensation: a handler of the run in that scope occurrence completed. */
  readonly handlerCompleted: (ctx: Ctx, run: ScopeOccurrenceId, occurrence: Occurrence, state: State) => Outcome;
  // Notifications
  /** A generic cancellation removed the occurrence; a feature that must react has this one place. */
  readonly cancelled: (ctx: Ctx, occurrence: Occurrence, state: State) => Outcome;
  /** Subscriptions: variables were written (PC-CONDITION-01). */
  readonly written: (ctx: Ctx, writes: readonly WriteEvent[], state: State) => Outcome;
  // Queries and the evaluator
  readonly evaluate: (context: EvalContext, expression: Expression) => Evaluation;
  /** Subscriptions: `Ctx.catches`. */
  readonly catches: (raised: Raised, trigger: Trigger) => Catch | null;
  /** Scopes: `Ctx.eventStart`. */
  readonly eventStart: (payload: ScopePayload) => readonly [Subscription, boolean] | null;
  /**
   * Subscriptions: the root start Events a start input's trigger fires, in document order; `chooseStart` picks the one
   * the input starts. `population.ts` asks it too, to start every fired start.
   */
  readonly startsFired: (ctx: Ctx, input: StartInput) => Result<readonly ElementId[]>;
  /**
   * Subscriptions: whether the open item is a correlated Message subscription on the channel whose criteria, evaluated
   * in the current state, equal the delivered correlation; `false` for any other item. `population.ts` asks it to find
   * the candidates of a correlated publication.
   */
  readonly correlates: (
    ctx: Ctx, item: OpenItem, channel: MessageChannel, correlation: readonly CorrelationMatch[], state: State) => Result<boolean>;
  /** Subscriptions: the open item a `deliver` input fires, with its firing, or the delivery's refusal; `step.ts` fires it. */
  readonly delivered: (ctx: Ctx, data: DeliveryInput, state: State) => Result<readonly [OpenItem, Fired]>;
}

export const defaultHooks: Hooks = {
  arriveStart: () => refuse("start"),
  arriveActivity: () => refuse("activity"),
  arriveMultiInstance: () => refuse("multiInstance"),
  arriveScope: () => refuse("scope"),
  arriveGateway: () => refuse("gateway"),
  arriveCatch: () => refuse("catchEvent"),
  arriveThrow: () => refuse("throwEvent"),
  arriveLink: () => refuse("linkEvent"),
  completeScope: () => refuse("completeScope"),
  completeCall: () => refuse("completeCall"),
  completeBody: () => refuse("completeBody"),
  completeUserTask: () => refuse("completeUserTask"),
  effectResult: () => refuse("effectResult"),
  resolveIncident: () => refuse("resolveIncident"),
  triggerActivity: () => refuse("triggerActivity"),
  trigger: () => refuse("trigger"),
  arm: () => refuse("arm"),
  armScope: () => refuse("armScope"),
  armGateway: () => refuse("armGateway"),
  raise: () => refuse("raise"),
  compensate: () => refuse("compensate"),
  failCompensation: () => refuse("failCompensation"),
  leave: () => refuse("leave"),
  select: () => failed(FailureTag.Unsupported, "select"), // dynamic-only: a registry without the hook
  writeOutputs: () => refuse("writeOutputs"),
  removeVariables: () => refuse("removeVariables"),
  completed: () => refuse("completed"),
  outflow: () => refuse("outflow"),
  instanceCompleted: () => refuse("instanceCompleted"),
  handlerCompleted: () => refuse("handlerCompleted"),
  cancelled: (_ctx, _occurrence, state) => committed(state),
  written: (_ctx, _writes, state) => committed(state),
  evaluate: () => ({ tag: EvaluationTag.Failure, code: "no-evaluator" }),
  catches: () => null,
  eventStart: () => null,
  startsFired: () => committed([]),
  correlates: () => failed(FailureTag.Unsupported, "correlates"), // dynamic-only: a registry without the hook
  delivered: () => failed(FailureTag.Unsupported, "delivered"), // dynamic-only: a registry without the hook
};
