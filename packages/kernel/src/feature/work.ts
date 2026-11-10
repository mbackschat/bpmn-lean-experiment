/**
 * Work: what an Activity does, transcribed from `Kernel/Feature/Work.lean`.
 *
 * Owns matching on `Work`. An Activity's input mappings are evaluated once, when its occurrence begins, against the
 * variables visible from its scope occurrence; they become the Activity's local values (a User Task's published inputs,
 * an effect's arguments). A task without work completes at once; a User Task, a Service Task's effect and a Receive
 * Task's Message open one item each, and the input that closes the item completes the Activity through the pipeline.
 * The boundaries of a Multi-Instance Activity belong to its body, so an instance arms none.
 *
 * A BPMN error an effect reports leaves the Activity `raised`, then raises from it, so the catcher, which may be a
 * boundary of this Activity, finds nothing of the Activity left to interrupt. A technical failure turns the effect's
 * item into an incident with the same identity and attachments, which a retry turns back.
 */
import {
  ErrorPathOutputs,
  MappingDialect,
  ResultValues,
  OutputContext,
  SubmissionRule,
  TechnicalFailure,
  ValueSourceTag,
  WorkTag,
  assertNever,
  distinctCount,
  elementEnvelope,
  programElement,
  type ActivityPayload,
  type Envelope,
  type Header,
  type Mapping,
  type MultiInstance,
  type UserWork,
  type ValueSource,
} from "../il/types.js";
import {
  CommandActionTag,
  EffectOutcomeTag,
  FailureTag,
  FiredTag,
  InstanceStatus,
  OpenKindTag,
  RaisedTag,
  SignalTag,
  WriteRule,
  committed,
  completeSignal,
  enterScope,
  failed,
  failedWith,
  leaveOutgoing,
  leaveRaised,
  occurrenceOf,
  openItem,
  openKindView,
  optionalChannelEquals,
  signal,
  visible,
  type Binding,
  type CommandAction,
  type EffectOutcome,
  type Fired,
  type Occurrence,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type Signal,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
  type UserTaskDetail,
} from "../state.js";
import { admitValues, ctxEvaluateMappings, deliveryTriggerChannel, evalContext, hold, inValueDomain, messageTriggerChannel, type Ctx } from "../hooks.js";
import * as Call from "./work/call.js";
import * as Decision from "./work/decision.js";
import * as Submission from "./work/submission.js";

/** Open `kind` for the Activity and arm its boundaries on the occurrence. */
function openWork(kind: OpenKind, header: Header, payload: ActivityPayload, occurrence: Occurrence, state: State): State {
  const opened = openItem(state, kind, occurrence);
  if (payload.envelope.boundaries.length === 0 || payload.envelope.multiInstance !== null) return opened;
  return signal(opened, { tag: SignalTag.Arm, host: occurrence.id, element: header.id, scope: occurrence.scope });
}

/**
 * The outputs a completion writes, from the values it submits. The submission must be exactly the Activity's OutputSet
 * (BPMN 2.0.2 §10.4.1): every output mapping evaluates against the submitted values alone, no name is submitted twice,
 * and no submitted value is superfluous (dropping it leaves the outputs evaluable). Anything else is rejected, so a
 * completion never commits a partial or unmediated write. Under `ResultValues.ActivityLocals` a superfluous value is an
 * Activity local that ends with the Activity, never written (CIB-EXT-0015).
 */
function outputs(
  ctx: Ctx,
  nowMs: number,
  unconsumed: ResultValues,
  mappings: readonly Mapping[],
  scope: readonly Binding[],
  values: readonly Binding[],
): Result<readonly Binding[]> {
  const evaluated = (variables: readonly Binding[]): Result<readonly Binding[] | null> =>
    ctxEvaluateMappings(ctx, { variables: [...variables, ...scope], nowMs }, mappings);
  const fills = (variables: readonly Binding[]): boolean => {
    const result = evaluated(variables);
    return result.ok && result.value !== null;
  };
  const names = values.map(([name]) => name);
  if (distinctCount(names) !== names.length) return failed(FailureTag.Rejected, "duplicate-output");
  const written = evaluated(values);
  if (!written.ok) return failedWith(written.failure);
  if (written.value === null) return failed(FailureTag.Rejected, "output-unavailable");
  switch (unconsumed) {
    case ResultValues.ActivityLocals:
      return committed(written.value);
    case ResultValues.OutputSet:
      return names.some((name) => fills(values.filter(([other]) => other !== name)))
        ? failed(FailureTag.Rejected, "undeclared-output")
        : committed(written.value);
  }
  return assertNever(unconsumed);
}

/** A field's literal value; admission refuses the expression-valued fields until the Task fields JUEL level. */
function literalOf(source: ValueSource | null): string | null {
  if (source === null) return null;
  switch (source.tag) {
    case ValueSourceTag.Literal:
      return source.value;
    case ValueSourceTag.Expression:
      return null;
  }
  return assertNever(source);
}

/**
 * What an open User Task publishes, with the inputs it was given: its literal metadata as the model states it, the
 * priority as the `int` CIB parses it into (`TaskDecorator#initializeTaskPriority`), whose decimal form admission
 * checks.
 */
function userTaskDetail(task: UserWork, inputs: readonly Binding[]): UserTaskDetail {
  const literals = (sources: readonly ValueSource[]): string[] =>
    sources.flatMap((source) => {
      const value = literalOf(source);
      return value === null ? [] : [value];
    });
  const priority = literalOf(task.priority);
  return {
    name: task.name,
    assignee: literalOf(task.assignee),
    candidateUsers: literals(task.candidateUsers),
    candidateGroups: literals(task.candidateGroups),
    formKey: task.formKey,
    formFields: task.formFields,
    dueDate: literalOf(task.dueDate),
    followUpDate: literalOf(task.followUpDate),
    priority: priority === null ? null : Number.parseInt(priority, 10),
    inputs,
  };
}

/**
 * Enter the Activity's local-variable scope when it has inputs (CIB-EXT-0015): the completion pipeline disposes of it
 * with the Activity.
 */
function enterLocal(header: Header, inputs: readonly Binding[], occurrence: Occurrence, state: State): State {
  return inputs.length === 0 ? state : enterScope(state, header.id, occurrence.scope, inputs, occurrence.id)[0];
}

/**
 * An Activity's occurrence began. An input mapping whose source is unavailable makes the InputSet unavailable, and an
 * occurrence a token began waits for it (BPMN 2.0.2 §10.4.2), held in `FeatureSlots.held` until its scope occurrence
 * is cleared. An occurrence no token began has no flow to hold on, which is refused; it may do a task without work, a
 * User Task or a Service Task (`scope.implicitStart` and `compensation.handlerWork` at admission). A
 * `camunda:inputParameter`, whose unresolved expression is no unavailable Data Input, rolls the command back instead
 * of holding (`ctxEvaluateMappings`).
 */
export function arriveActivity(ctx: Ctx, header: Header, payload: ActivityPayload, occurrence: Occurrence, state: State): Outcome {
  const evaluated = ctxEvaluateMappings(ctx, evalContext(state, occurrence.scope), payload.envelope.inputs);
  if (!evaluated.ok) return failedWith(evaluated.failure);
  if (evaluated.value === null) {
    if (occurrence.incoming !== null) return committed(hold(state, { occurrence: occurrence.id, flow: occurrence.incoming, scope: occurrence.scope }));
    // Dynamic-only: whether the source is set depends on the run.
    return failed(FailureTag.Unsupported, "started-activity-input-unavailable");
  }
  const inputs = evaluated.value;
  const entered = enterLocal(header, inputs, occurrence, state);
  // An instance of a Multi-Instance body, the only occurrence of a looping Activity this hook sees, follows the token
  // its body began on; admission refuses a looping compensation handler (`activity.compensationHandler`).
  const begunByToken = occurrence.incoming !== null || payload.envelope.multiInstance !== null;
  const complete = (current: State): State => signal(current, completeSignal(occurrence.id, leaveOutgoing, [], WriteRule.Outward));
  const work = payload.work;
  switch (work.tag) {
    case WorkTag.None:
    case WorkTag.Manual:
      return committed(complete(entered));
    case WorkTag.User:
      return committed(openWork({ tag: OpenKindTag.UserTask, detail: userTaskDetail(work.payload, inputs) }, header, payload, occurrence, entered));
    case WorkTag.Receive: {
      if (!begunByToken) return failed(FailureTag.Unsupported, "scope-implicit-start");
      const channel = messageTriggerChannel(work.payload.message);
      // Admission refuses it (`work.receive.messageExpression`).
      if (channel === null) return failed(FailureTag.Unsupported, "work-receive-message-expression");
      return committed(openWork({ tag: OpenKindTag.Message, detail: { channel, payload: false, criteria: [] } }, header, payload, occurrence, entered));
    }
    case WorkTag.Service:
      return committed(openWork({
        tag: OpenKindTag.Effect,
        detail: { protocol: work.payload.protocol, operation: work.payload.operation, arguments: inputs, failures: 0, send: null },
      }, header, payload, occurrence, entered));
    // Admission refuses the two (`work.send`, `work.script`).
    case WorkTag.Send:
      return failed(FailureTag.Unsupported, "work-send");
    case WorkTag.Script:
      return failed(FailureTag.Unsupported, "work-script");
    case WorkTag.Rule: {
      // The decision's result is written before the task leaves, so its outgoing conditions read it (PC-AUTO-07).
      const writes = Decision.run(ctx.program, work.payload, evalContext(entered, occurrence.scope).variables);
      if (!writes.ok) return writes;
      return committed(complete(writes.value.length === 0
        ? entered
        : signal(entered, { tag: SignalTag.Write, scope: occurrence.scope, writes: writes.value, rule: WriteRule.Outward })));
    }
    case WorkTag.Call:
      if (!begunByToken) return failed(FailureTag.Unsupported, "scope-implicit-start");
      return Call.invoke(ctx, header, payload, work.payload, occurrence, entered);
  }
  return assertNever(work);
}

/** One Multi-Instance instance submits exactly its output data item, written locally to the instance. */
function instanceOutput(loop: MultiInstance, values: readonly Binding[]): Result<null> {
  const [only] = values;
  if (loop.outputDataItem !== null && values.length === 1 && only !== undefined) {
    return only[0] !== loop.outputDataItem ? failed(FailureTag.Rejected, "undeclared-output") : committed(null);
  }
  if (loop.outputDataItem !== null && values.length === 0) return failed(FailureTag.Rejected, "output-unavailable");
  return failed(FailureTag.Rejected, "undeclared-output");
}

/**
 * Under a profile whose submission installs variables (CIB-EXT-0005) the completion first writes every submitted value
 * from the task's own local scope occurrence, as `TaskService.complete` sets it through the task's execution
 * (`AbstractVariableScope#setVariable`): a name the task holds as a local stays there and ends with the task, any other
 * reaches its nearest owner or the root. The write is its own signal ahead of the completion, so the outgoing conditions
 * read it even when they precede the outputs (CIB-INT-0011). The outputs then map from the submitted values, a value no
 * mapping reads being no error. Otherwise the submission is the task's OutputSet (`outputs`), which for a task without
 * outputs admits only the empty submission. The scope-chain rule, when the profile selects it, applies first
 * (`submission.ts`).
 */
export function completeUserTask(
  ctx: Ctx,
  _header: Header,
  payload: ActivityPayload,
  item: OpenItem,
  values: readonly Binding[],
  state: State,
): Outcome {
  const admitted = admitValues(values.map(([, value]) => value));
  if (!admitted.ok) return failedWith(admitted.failure);
  const limit = ctx.program.options.scopeChainSubmissionBytes;
  if (limit !== null) {
    const checked = Submission.check(ctx, state, item.scope, limit, values);
    if (!checked.ok) return failedWith(checked.failure);
  }
  const loop = payload.envelope.multiInstance;
  if (loop !== null) {
    const submitted = instanceOutput(loop, values);
    if (!submitted.ok) return failedWith(submitted.failure);
    return committed(signal(state, completeSignal(item.occurrence, leaveOutgoing, values, WriteRule.Own)));
  }
  const submission = ctx.program.options.submission;
  switch (submission) {
    case SubmissionRule.InstallsVariables: {
      const written = outputs(ctx, state.logicalTimeMs, ResultValues.ActivityLocals, payload.envelope.outputs, outputScope(ctx, state, item), values);
      if (!written.ok) return failedWith(written.failure);
      const installed = signal(state, { tag: SignalTag.Write, scope: localScope(state, item.occurrence) ?? item.scope, writes: values, rule: WriteRule.Outward });
      return committed(signal(installed, completeSignal(item.occurrence, leaveOutgoing, written.value, WriteRule.Outward)));
    }
    case SubmissionRule.OutputSet: {
      const written = outputs(ctx, state.logicalTimeMs, ResultValues.OutputSet, payload.envelope.outputs, outputScope(ctx, state, item), values);
      if (!written.ok) return failedWith(written.failure);
      return committed(signal(state, completeSignal(item.occurrence, leaveOutgoing, written.value, WriteRule.Outward)));
    }
  }
  return assertNever(submission);
}

/**
 * What an Activity's outputs read behind the submitted values: nothing under the standards reading; under
 * `OutputContext.ActivityScope` (CIB-EXT-0031) the variables visible from the Activity's own scope, its captured inputs
 * first, since CIB evaluates an output parameter in the Activity's execution (`OutputParameter.java:47`).
 */
function outputScope(ctx: Ctx, state: State, item: OpenItem): readonly Binding[] {
  switch (ctx.program.options.outputContext) {
    case OutputContext.Submission:
      return [];
    case OutputContext.ActivityScope:
      return visible(state, localScope(state, item.occurrence) ?? item.scope);
  }
  return assertNever(ctx.program.options.outputContext);
}

/** The local-variable scope occurrence an Activity's occurrence owns, when its inputs gave it one (`enterLocal`). */
function localScope(state: State, occurrence: number): ScopeOccurrenceId | null {
  return state.scopes.find((scope) => scope.occurrence === occurrence && scope.calledInstance === null)?.id ?? null;
}

/** Replace the kind of the open item `id`, keeping its identity and attachments. */
function reopen(state: State, id: number, kind: OpenKind): State {
  return { ...state, openItems: state.openItems.map((item) => (item.id === id ? { ...item, kind } : item)) };
}

/**
 * What an effect result value no output mapping consumes becomes: the profile's rule where CIB gives the delegate an
 * execution of its own, which ends with the task: an instance of a Multi-Instance Activity, or a task with
 * `camunda:inputOutput`, which CIB makes a scope (`BpmnParse.java:4797-4814`); the OutputSet otherwise, since on a task
 * CIB makes no scope the delegate's local reaches the flow execution that continues past it (CIB-EXT-0015). A
 * non-compensation boundary also makes a CIB task a scope (`BpmnParse.java:3297`); such a task without mappings keeps
 * the OutputSet reading, which no witness separates.
 */
function unconsumed(ctx: Ctx, envelope: Envelope | null): ResultValues {
  if (envelope === null) return ResultValues.OutputSet;
  const ioParameters = [...envelope.inputs, ...envelope.outputs].some((mapping) => mapping.dialect === MappingDialect.IoParameter);
  return envelope.multiInstance !== null || ioParameters ? ctx.program.options.effectResultValues : ResultValues.OutputSet;
}

/**
 * An effect's successful completion. A Multi-Instance instance under `ResultValues.activityLocals` writes its result
 * values as locals of its own scope occurrence, which stays until its completion condition has run, so the condition
 * reads them (CIB-EXT-0015; EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", result locals); every other completion
 * writes its outputs outward.
 */
function effectCompletion(envelope: Envelope | null, rule: ResultValues, occurrence: number, written: readonly Binding[],
  patch: readonly Binding[]): Signal {
  return envelope?.multiInstance !== undefined && envelope.multiInstance !== null && rule === ResultValues.ActivityLocals
    ? completeSignal(occurrence, leaveOutgoing, patch, WriteRule.Own)
    : completeSignal(occurrence, leaveOutgoing, written, WriteRule.Outward);
}

/**
 * An effect's result patch is its OutputSet. A BPMN error raises from the Activity with the occurrence as host: it
 * writes no outputs (BPMN 2.0.2 §13.3.2) unless the profile maps them on the error path (CIB-EXT-0004, -0009, -0016). A
 * technical failure has no BPMN meaning (§13.3.3 defines only a fault) and refuses unless the profile opens an incident
 * (CIB-EXT-0013, CIB-CFG-0008).
 */
export function effectResult(ctx: Ctx, item: OpenItem, outcome: EffectOutcome, state: State): Outcome {
  // A throw Event's effect has no envelope and so no output mappings (PC-MESSAGE-09).
  const element = programElement(ctx.program, item.element);
  const envelope = element === null ? null : elementEnvelope(element);
  const mappings = envelope?.outputs ?? [];
  switch (outcome.tag) {
    case EffectOutcomeTag.Success: {
      const admitted = admitValues(outcome.outputs.map(([, value]) => value));
      if (!admitted.ok) return failedWith(admitted.failure);
      const written = outputs(ctx, state.logicalTimeMs, unconsumed(ctx, envelope), mappings, outputScope(ctx, state, item), outcome.outputs);
      if (!written.ok) return failedWith(written.failure);
      return committed(signal(state, effectCompletion(envelope, unconsumed(ctx, envelope), item.occurrence, written.value, outcome.outputs)));
    }
    case EffectOutcomeTag.BusinessFailure: {
      const admitted = admitValues(outcome.outputs.map(([, value]) => value));
      if (!admitted.ok) return failedWith(admitted.failure);
      const written = errorPathWrites(ctx, state, item, unconsumed(ctx, envelope), mappings, outcome.outputs);
      if (!written.ok) return failedWith(written.failure);
      const activation = occurrenceOf(state, item.occurrence)?.activation ?? 0;
      const completed = signal(state, completeSignal(item.occurrence, leaveRaised, written.value, WriteRule.Outward));
      return committed(signal(completed, {
        tag: SignalTag.Raise,
        event: { tag: RaisedTag.Error, code: outcome.code, message: outcome.message },
        origin: { element: item.element, scope: item.scope, activation, host: item.occurrence },
      }));
    }
    case EffectOutcomeTag.TechnicalFailure:
      return technicalFailure(ctx, item, state);
  }
  return assertNever(outcome);
}

function errorPathWrites(
  ctx: Ctx,
  state: State,
  item: OpenItem,
  rule: ResultValues,
  mappings: readonly Mapping[],
  patch: readonly Binding[],
): Result<readonly Binding[]> {
  switch (ctx.program.options.errorPathOutputs) {
    case ErrorPathOutputs.Mapped:
      return outputs(ctx, state.logicalTimeMs, rule, mappings, outputScope(ctx, state, item), patch);
    case ErrorPathOutputs.None:
      return patch.length === 0 ? committed([]) : failed(FailureTag.Rejected, "error-path-outputs-not-accepted");
  }
  return assertNever(ctx.program.options.errorPathOutputs);
}

function technicalFailure(ctx: Ctx, item: OpenItem, state: State): Outcome {
  const detail = openKindView(item.kind).effect;
  switch (ctx.program.options.technicalFailure) {
    case TechnicalFailure.HostFailure:
      // Dynamic-only: a host failure is an input; no admission can tell whether it will arrive.
      return failed(FailureTag.Unsupported, "effect-technical-failure");
    case TechnicalFailure.Incident: {
      if (detail === null) return failed(FailureTag.SemanticFailure, "effect-result-without-effect");
      // Each failure is the next incident generation of the occurrence, so a command its issuer took from an earlier
      // incident is stale (CIB-EXT-0013; `fulfilment-repeated-incident` publishes generation 2 after one retry).
      const effect = { ...detail, failures: detail.failures + 1 };
      const cancellable = ctx.program.options.incidentProcessCancellation;
      return committed(reopen(state, item.id, {
        tag: OpenKindTag.Incident, detail: { effect, generation: effect.failures, cancellable },
      }));
    }
  }
  return assertNever(ctx.program.options.technicalFailure);
}

/**
 * A retry reopens the failed effect with the same occurrence (CIB-EXT-0013); cancelling the incident's process ends the
 * whole instance as cancelled, keeping its root's Process variables, under a profile that selects it (CIB-EXT-0014,
 * CIB-OP-0009). An incident inside a called instance cancels the root too: the operator deletes the root Process
 * instance, which deletes its called instances with it (`CibSevenCommandExecutor`, `deleteProcessInstance(root)`). A
 * command naming another generation than the open incident's is stale and rejected, so it never resolves an incident its
 * issuer did not observe.
 */
export function resolveIncident(_ctx: Ctx, item: OpenItem, action: CommandAction, state: State): Outcome {
  const incident = openKindView(item.kind).incident;
  if (incident === null) return failed(FailureTag.SemanticFailure, "incident-command-without-incident");
  const stale: Outcome = failed(FailureTag.Rejected, "incident-generation-stale");
  switch (action.tag) {
    case CommandActionTag.RetryIncident:
      if (action.generation !== incident.generation) return stale;
      return committed(reopen(state, item.id, { tag: OpenKindTag.Effect, detail: incident.effect }));
    case CommandActionTag.CancelIncidentProcess:
      if (action.generation !== incident.generation) return stale;
      if (!incident.cancellable) return failed(FailureTag.Rejected, "incident-process-cancellation-unavailable");
      return committed(signal(state, { tag: SignalTag.EndInstance, status: InstanceStatus.Cancelled, failure: null }));
    case CommandActionTag.CompleteUserTask:
      return failed(FailureTag.SemanticFailure, "incident-user-task-completion");
    case CommandActionTag.SetVariables:
    case CommandActionTag.RemoveVariables:
      return failed(FailureTag.SemanticFailure, "incident-variable-command");
  }
  return assertNever(action);
}

/** A delivery completes a Receive Task only on the channel it waits on; the Message carries no payload here. */
export function triggerActivity(
  _ctx: Ctx,
  _header: Header,
  _payload: ActivityPayload,
  item: OpenItem,
  fired: Fired,
  state: State,
): Outcome {
  switch (fired.tag) {
    case FiredTag.Timer:
      return failed(FailureTag.SemanticFailure, "activity-timer-without-timer");
    case FiredTag.Signal:
      return failed(FailureTag.SemanticFailure, "activity-signal-without-signal");
    case FiredTag.Condition:
      return failed(FailureTag.SemanticFailure, "activity-condition-without-condition");
    case FiredTag.Message: {
      const channel = openKindView(item.kind).channel;
      if (channel === null) return failed(FailureTag.SemanticFailure, "activity-message-without-message");
      if (fired.delivery.payload !== null && !inValueDomain(fired.delivery.payload)) return failed(FailureTag.Rejected, "value-outside-domain");
      if (!optionalChannelEquals(deliveryTriggerChannel(fired.delivery.trigger), channel)) {
        return failed(FailureTag.Rejected, "message-channel-mismatch");
      }
      if (fired.delivery.payload !== null) return failed(FailureTag.Rejected, "unexpected-message-payload");
      return committed(signal(state, completeSignal(item.occurrence, leaveOutgoing, [], WriteRule.Outward)));
    }
  }
  return assertNever(fired);
}

/** `Hooks.completeCall`: only a Call Activity starts a called instance. */
export function completeCall(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  calledRoot: ScopeOccurrence,
  owner: Occurrence,
  state: State,
): Outcome {
  const work = payload.work;
  switch (work.tag) {
    case WorkTag.Call:
      return Call.complete(ctx, header, payload, work.payload, calledRoot, owner, state);
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Receive:
    case WorkTag.Service:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
      return failed(FailureTag.SemanticFailure, "called-instance-without-call");
  }
  return assertNever(work);
}
