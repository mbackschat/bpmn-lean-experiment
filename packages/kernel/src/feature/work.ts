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
  ResultValues,
  SubmissionRule,
  TechnicalFailure,
  ValueSourceTag,
  WorkTag,
  assertNever,
  distinctCount,
  elementEnvelope,
  programElement,
  type ActivityPayload,
  type Header,
  type Mapping,
  type MultiInstance,
  type UserWork,
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
  instanceRoot,
  leaveOutgoing,
  leaveRaised,
  occurrenceOf,
  openItem,
  openKindView,
  optionalChannelEquals,
  root,
  signal,
  type Binding,
  type CommandAction,
  type EffectOutcome,
  type Fired,
  type Occurrence,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type Result,
  type ScopeOccurrence,
  type State,
  type UserTaskDetail,
} from "../state.js";
import { ctxEvaluateMappings, deliveryTriggerChannel, evalContext, hold, messageTriggerChannel, type Ctx } from "../hooks.js";
import * as Call from "./work/call.js";
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
  values: readonly Binding[],
): Result<readonly Binding[]> {
  const evaluated = (variables: readonly Binding[]): Result<readonly Binding[] | null> =>
    ctxEvaluateMappings(ctx, { variables, nowMs }, mappings);
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

/** What an open User Task publishes, with the inputs it was given. */
function userTaskDetail(task: UserWork, inputs: readonly Binding[]): UserTaskDetail {
  const groups = task.candidateGroups.flatMap((group) => {
    switch (group.tag) {
      case ValueSourceTag.Literal:
        return [group.value];
      case ValueSourceTag.Expression:
        return [];
    }
    return assertNever(group);
  });
  return {
    name: task.name,
    assignee: null,
    candidateUsers: [],
    candidateGroups: groups,
    formKey: null,
    formFields: task.formFields,
    dueDate: null,
    followUpDate: null,
    priority: null,
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
  const begunByToken = occurrence.incoming !== null;
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
    // Admission refuses the three (`work.send`, `work.script`, `work.rule`).
    case WorkTag.Send:
      return failed(FailureTag.Unsupported, "work-send");
    case WorkTag.Script:
      return failed(FailureTag.Unsupported, "work-script");
    case WorkTag.Rule:
      return failed(FailureTag.Unsupported, "work-rule");
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
 * A User Task without output mappings, under a profile whose submission installs variables (CIB-EXT-0005), writes the
 * submitted values from its scope; otherwise the submission is the task's OutputSet (`outputs`), which for a task
 * without outputs admits only the empty submission. The scope-chain rule, when the profile selects it, applies first
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
  if (ctx.program.options.submission === SubmissionRule.InstallsVariables && payload.envelope.outputs.length === 0) {
    return committed(signal(state, completeSignal(item.occurrence, leaveOutgoing, values, WriteRule.Outward)));
  }
  const written = outputs(ctx, state.logicalTimeMs, ResultValues.OutputSet, payload.envelope.outputs, values);
  if (!written.ok) return failedWith(written.failure);
  return committed(signal(state, completeSignal(item.occurrence, leaveOutgoing, written.value, WriteRule.Outward)));
}

/** Replace the kind of the open item `id`, keeping its identity and attachments. */
function reopen(state: State, id: number, kind: OpenKind): State {
  return { ...state, openItems: state.openItems.map((item) => (item.id === id ? { ...item, kind } : item)) };
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
  const mappings = (element === null ? null : elementEnvelope(element))?.outputs ?? [];
  switch (outcome.tag) {
    case EffectOutcomeTag.Success: {
      const written = outputs(ctx, state.logicalTimeMs, ctx.program.options.effectResultValues, mappings, outcome.outputs);
      if (!written.ok) return failedWith(written.failure);
      return committed(signal(state, completeSignal(item.occurrence, leaveOutgoing, written.value, WriteRule.Outward)));
    }
    case EffectOutcomeTag.BusinessFailure: {
      const written = errorPathWrites(ctx, state, mappings, outcome.outputs);
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

function errorPathWrites(ctx: Ctx, state: State, mappings: readonly Mapping[], patch: readonly Binding[]): Result<readonly Binding[]> {
  switch (ctx.program.options.errorPathOutputs) {
    case ErrorPathOutputs.Mapped:
      return outputs(ctx, state.logicalTimeMs, ctx.program.options.effectResultValues, mappings, patch);
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
      // Dynamic-only: a retried effect's second failure is a run outcome; PC-AUTO retries own it.
      if (detail.failures > 0) return failed(FailureTag.Unsupported, "repeated-effect-incident");
      const effect = { ...detail, failures: detail.failures + 1 };
      const cancellable = ctx.program.options.incidentProcessCancellation;
      return committed(reopen(state, item.id, { tag: OpenKindTag.Incident, detail: { effect, generation: 1, cancellable } }));
    }
  }
  return assertNever(ctx.program.options.technicalFailure);
}

/**
 * A retry reopens the failed effect with the same occurrence (CIB-EXT-0013); cancelling the incident's process ends the
 * instance as cancelled, keeping its Process variables (CIB-EXT-0014, CIB-OP-0009), and is offered only for an incident
 * of the root process instance under a profile that selects it. A command naming another generation than the open
 * incident's is stale and rejected, so it never resolves an incident its issuer did not observe.
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
      // Dynamic-only: whether the incident is in a called instance depends on the run.
      if (instanceRoot(state, item.scope) !== root) return failed(FailureTag.Unsupported, "called-incident-cancellation");
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
