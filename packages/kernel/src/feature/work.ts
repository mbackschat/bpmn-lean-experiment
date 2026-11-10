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
  MultiInstanceCounters,
  ResultValues,
  OutputContext,
  SubmissionRule,
  TechnicalFailure,
  ValueSourceTag,
  WorkTag,
  assertNever,
  distinctCount,
  elementEnvelope,
  multiInstanceCounterNames,
  programElement,
  type ActivityPayload,
  type Envelope,
  type Header,
  type Mapping,
  type MultiInstance,
  type Program,
  type RuleWork,
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
  type Origin,
  type Outcome,
  type Signal,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
  type UserTaskDetail,
} from "../state.js";
import {
  admitValues, ctxEvaluateMappings, ctxEvaluateMappingsWith, ctxOutputReads, deliveryTriggerChannel, evalContext, hold, inValueDomain,
  messageTriggerChannel, ownVariables, type Ctx,
} from "../hooks.js";
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
 * Activity local that ends with the Activity, never written (CIB-EXT-0015). The mappings also read `scope` behind the
 * submitted values (`activityScope`), and `installed`, the values the completion set through the Activity's frame
 * before its outputs run, where that write left them (`ctxOutputReads`); no name is installed twice either.
 */
function completionOutputs(
  ctx: Ctx,
  nowMs: number,
  unconsumed: ResultValues,
  mappings: readonly Mapping[],
  scope: readonly [readonly Binding[], readonly Binding[]],
  installed: readonly Binding[],
  values: readonly Binding[],
): Result<readonly Binding[]> {
  const evaluated = (variables: readonly Binding[]): Result<readonly Binding[] | null> =>
    ctxEvaluateMappingsWith(ctx, ctxOutputReads(ctx, nowMs, [...variables, ...scope[0]], installed, scope[1]), mappings);
  const fills = (variables: readonly Binding[]): boolean => {
    const result = evaluated(variables);
    return result.ok && result.value !== null;
  };
  const names = values.map(([name]) => name);
  const given = [...names, ...installed.map(([name]) => name)];
  if (distinctCount(given) !== given.length) return failed(FailureTag.Rejected, "duplicate-output");
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
 * The sub-features Work joins through its own hooks record, since features never import each other (ARCHITECTURE-SPEC
 * "Modules and build shape"); `registry.ts` fills it. `runDecision` is `feature/decision.ts` `runDecision`: the writes a decision
 * task makes against the variables visible from its scope occurrence.
 */
export interface WorkHooks {
  readonly runDecision: (program: Program, work: RuleWork, variables: readonly Binding[]) => Result<readonly Binding[]>;
}

export const defaultWorkHooks: WorkHooks = { runDecision: () => failed(FailureTag.Unsupported, "work-rule") };

/**
 * An Activity's occurrence began. An input mapping whose source is unavailable makes the InputSet unavailable, and an
 * occurrence a token began waits for it (BPMN 2.0.2 §10.4.2), held in `FeatureSlots.held` until its scope occurrence
 * is cleared. An occurrence no token began has no flow to hold on, which is refused; it may do a task without work, a
 * User Task or a Service Task (`scope.implicitStart` and `compensation.handlerWork` at admission). A
 * `camunda:inputParameter`, whose unresolved expression is no unavailable Data Input, rolls the command back instead
 * of holding (`ctxEvaluateMappings`).
 */
export function arriveActivity(hooks: WorkHooks, ctx: Ctx, header: Header, payload: ActivityPayload, occurrence: Occurrence,
  state: State): Outcome {
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
    case WorkTag.None: {
      // A plain Task completes with the empty submission; its output parameters, which admission admits only where
      // they read the Task's own scope (`activity.outputMappings`), are written as it leaves (CIB-EXT-0031).
      const written = completionOutputs(ctx, entered.logicalTimeMs, ResultValues.OutputSet, payload.envelope.outputs,
        activityScope(ctx, entered, occurrence.id, occurrence.scope), [], []);
      if (!written.ok) return failedWith(written.failure);
      return committed(signal(entered, completeSignal(occurrence.id, leaveOutgoing, written.value, WriteRule.Outward)));
    }
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
    case WorkTag.Rule:
      return evaluateDecision(hooks, ctx, payload, work.payload, occurrence, entered);
    case WorkTag.Call:
      if (!begunByToken) return failed(FailureTag.Unsupported, "scope-implicit-start");
      return Call.invoke(ctx, header, payload, work.payload, occurrence, entered);
  }
  return assertNever(work);
}

/**
 * A decision task (PC-AUTO-07, PC-AUTO-08) reads its inputs, which CIB holds as locals of the task's scope
 * (`BpmnParse.java:2357-2360`), and writes the mapped result outward from that scope, as `setVariable` on the task's
 * execution does (`DecisionEvaluationUtil.java:86`), so a task-local of the result's name holds it. The write is its
 * own signal ahead of the completion, so the outgoing conditions read it whatever the condition order; the outputs read
 * the result where that write left it, behind an earlier output's write of its name unless a task-local holds it
 * (`ctxOutputReads`), and a result no output reads is no error.
 */
function evaluateDecision(hooks: WorkHooks, ctx: Ctx, payload: ActivityPayload, work: RuleWork, occurrence: Occurrence,
  state: State): Outcome {
  const scope = localScope(state, occurrence.id) ?? occurrence.scope;
  const writes = hooks.runDecision(ctx.program, work, evalContext(state, scope).variables);
  if (!writes.ok) return writes;
  const written = completionOutputs(ctx, state.logicalTimeMs, ResultValues.ActivityLocals, payload.envelope.outputs, activityScope(ctx, state, occurrence.id, occurrence.scope), writes.value, []);
  if (!written.ok) return failedWith(written.failure);
  const result = writes.value.length === 0 ? state : signal(state, { tag: SignalTag.Write, scope, writes: writes.value, rule: WriteRule.Outward });
  return committed(signal(result, completeSignal(occurrence.id, leaveOutgoing, written.value, WriteRule.Outward)));
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
 * The loop whose instance submits exactly its output data item: a Multi-Instance Activity's, unless the loop declares
 * none and the submission installs variables (CIB-EXT-0005), where CIB's `TaskService.complete` sets the instance's
 * submission through its task execution as for any task.
 */
function submittedItem(submission: SubmissionRule, envelope: Envelope): MultiInstance | null {
  const loop = envelope.multiInstance;
  return loop !== null && (loop.outputDataItem !== null || submission === SubmissionRule.OutputSet) ? loop : null;
}

/**
 * Under CIB's counters (`MultiInstanceCounters.cibLocals`, CIB-INT-0018) an instance's installed submission naming a
 * counter would rewrite CIB's loop state, which the kernel computes rather than holds: the body execution's `loopCounter`
 * and `nrOfInstances` that the next sequential instance reads (`SequentialMultiInstanceActivityBehavior.java:48-59`), or
 * the parallel body's `nrOfActiveInstances` and `nrOfCompletedInstances` that end it
 * (`ParallelMultiInstanceActivityBehavior.java:84-87,123`). The input data item is the instance's own local, which no
 * later step reads, so it is no such name. `feature/multi-instance.ts` refuses a result so named with the same code.
 */
function shadowsCounter(ctx: Ctx, envelope: Envelope, values: readonly Binding[]): boolean {
  return envelope.multiInstance !== null && ctx.program.options.multiInstanceCounters === MultiInstanceCounters.CibLocals &&
    values.some(([name]) => multiInstanceCounterNames.includes(name));
}


/**
 * Under a profile whose submission installs variables (CIB-EXT-0005) the completion first writes every submitted value
 * from the task's own local scope occurrence, as `TaskService.complete` sets it through the task's execution
 * (`AbstractVariableScope#setVariable`): a name the task holds as a local stays there and ends with the task, any other
 * reaches its nearest owner or the root. The write is its own signal ahead of the completion, so the outgoing conditions
 * read it even when they precede the outputs (CIB-INT-0011). The outputs then read the submitted values where that
 * write left them (`ctxOutputReads`), a value no mapping reads being no error. Otherwise the submission is the task's OutputSet (`completionOutputs`), which for a task without
 * outputs admits only the empty submission. A Multi-Instance instance submits its output data item instead
 * (`submittedItem`); a name its loop's counters own is `unsupported` (`shadowsCounter`). The scope-chain rule, when the profile selects it, applies first, from the task's own frame, so the
 * task's own locals are names it may submit (UTL-TASK-01; `submission.ts`).
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
    const checked = Submission.check(ctx, state, localScope(state, item.occurrence) ?? item.scope, limit, values);
    if (!checked.ok) return failedWith(checked.failure);
  }
  const loop = submittedItem(ctx.program.options.submission, payload.envelope);
  if (loop !== null) {
    const submitted = instanceOutput(loop, values);
    if (!submitted.ok) return failedWith(submitted.failure);
    // CIB reads no `outputDataItem` (CIB-LIM-0001) and sets the submission through the instance's task execution
    // (CIB-EXT-0005), so it also reaches its nearest owner or the root; the slot keeps BPMN 2.0.2 §13.3.7.
    const installed = ctx.program.options.submission === SubmissionRule.InstallsVariables
      ? signal(state, { tag: SignalTag.Write, scope: item.scope, writes: values, rule: WriteRule.Outward })
      : state;
    return committed(signal(installed, completeSignal(item.occurrence, leaveOutgoing, values, WriteRule.Own)));
  }
  const submission = ctx.program.options.submission;
  switch (submission) {
    case SubmissionRule.InstallsVariables: {
      // Dynamic-only: a submission's names are the run's data.
      if (shadowsCounter(ctx, payload.envelope, values)) return failed(FailureTag.Unsupported, "multiInstance.resultShadowsInstance");
      const written = completionOutputs(ctx, state.logicalTimeMs, ResultValues.ActivityLocals, payload.envelope.outputs, outputScope(ctx, state, item), values, []);
      if (!written.ok) return failedWith(written.failure);
      const installed = signal(state, { tag: SignalTag.Write, scope: localScope(state, item.occurrence) ?? item.scope, writes: values, rule: WriteRule.Outward });
      return committed(signal(installed, completeSignal(item.occurrence, leaveOutgoing, written.value, WriteRule.Outward)));
    }
    case SubmissionRule.OutputSet: {
      const written = completionOutputs(ctx, state.logicalTimeMs, ResultValues.OutputSet, payload.envelope.outputs, outputScope(ctx, state, item), [], values);
      if (!written.ok) return failedWith(written.failure);
      return committed(signal(state, completeSignal(item.occurrence, leaveOutgoing, written.value, WriteRule.Outward)));
    }
  }
  return assertNever(submission);
}

/**
 * The frame an open item's outputs read (`activityScope`): CIB evaluates an output parameter in the Activity's
 * execution (`OutputParameter.java:47`).
 */
function outputScope(ctx: Ctx, state: State, item: OpenItem): readonly [readonly Binding[], readonly Binding[]] {
  return activityScope(ctx, state, item.occurrence, item.scope);
}

/**
 * The frame the outputs of the Activity occurrence `occurrence` in `scope` read besides the submitted values: nothing
 * under the standards reading; under `OutputContext.ActivityScope` (CIB-EXT-0031) its own locals, the captured inputs,
 * and the chain from `scope`, into which the outputs are written, which `ctxOutputReads` orders.
 */
function activityScope(ctx: Ctx, state: State, occurrence: number, scope: ScopeOccurrenceId): readonly [readonly Binding[], readonly Binding[]] {
  switch (ctx.program.options.outputContext) {
    case OutputContext.Submission:
      return [[], []];
    case OutputContext.ActivityScope: {
      const local = localScope(state, occurrence);
      return [local === null ? [] : ownVariables(state, local), visible(state, scope)];
    }
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
 * An effect's result patch is its OutputSet. A BPMN error raises from the Activity with the occurrence as host, which
 * leaves only once its catcher is known (`mappedErrorOutputs`): it writes no outputs (BPMN 2.0.2 §13.3.2) unless the
 * profile maps them on the error path (CIB-EXT-0004, -0009, -0016). A technical failure has no BPMN meaning (§13.3.3
 * defines only a fault) and refuses unless the profile opens an incident (CIB-EXT-0013, CIB-CFG-0008).
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
      const written = completionOutputs(ctx, state.logicalTimeMs, unconsumed(ctx, envelope), mappings, outputScope(ctx, state, item), [], outcome.outputs);
      if (!written.ok) return failedWith(written.failure);
      return committed(signal(state, effectCompletion(envelope, unconsumed(ctx, envelope), item.occurrence, written.value, outcome.outputs)));
    }
    case EffectOutcomeTag.BusinessFailure: {
      const admitted = admitValues(outcome.outputs.map(([, value]) => value));
      if (!admitted.ok) return failedWith(admitted.failure);
      const accepted = errorPatchAccepted(ctx, outcome.outputs);
      if (!accepted.ok) return failedWith(accepted.failure);
      const activation = occurrenceOf(state, item.occurrence)?.activation ?? 0;
      return committed(signal(state, {
        tag: SignalTag.Raise,
        event: { tag: RaisedTag.Error, code: outcome.code, message: outcome.message },
        origin: { element: item.element, scope: item.scope, activation, host: item.occurrence, patch: outcome.outputs },
      }));
    }
    case EffectOutcomeTag.TechnicalFailure:
      return technicalFailure(ctx, item, state);
  }
  return assertNever(outcome);
}

/** A business Error's result patch must be empty unless the profile maps outputs on the error path. */
function errorPatchAccepted(ctx: Ctx, patch: readonly Binding[]): Result<null> {
  switch (ctx.program.options.errorPathOutputs) {
    case ErrorPathOutputs.Mapped:
      return committed(null);
    case ErrorPathOutputs.None:
      return patch.length === 0 ? committed(null) : failed(FailureTag.Rejected, "error-path-outputs-not-accepted");
  }
  return assertNever(ctx.program.options.errorPathOutputs);
}

/** The outputs the raising Activity `host` writes as it leaves (`mappedErrorOutputs`). */
function errorExitOutputs(ctx: Ctx, state: State, host: number, origin: Origin, envelope: Envelope | null,
  installed: readonly Binding[]): Result<readonly Binding[]> {
  switch (ctx.program.options.errorPathOutputs) {
    case ErrorPathOutputs.Mapped:
      return completionOutputs(ctx, state.logicalTimeMs, unconsumed(ctx, envelope), envelope?.outputs ?? [],
        activityScope(ctx, state, host, origin.scope), installed, origin.patch);
    case ErrorPathOutputs.None:
      return committed([]);
  }
  return assertNever(ctx.program.options.errorPathOutputs);
}

/** Apply writes at once, as `Data.writeOutputs` does, which `registry.ts` passes in. */
export type WriteOutputs = (ctx: Ctx, scope: ScopeOccurrenceId, writes: readonly Binding[], rule: WriteRule, state: State) => Outcome;

/**
 * How an Activity that raised a business Error leaves, once the search for its catcher has decided:
 * `feature/propagation.ts` calls it through `PropagationHooks` with the values `installed` through the Activity's frame,
 * its own boundary's catch variables, or none when the search went on outward and any catch variables are already
 * written. Under `ErrorPathOutputs.mapped` CIB sets those on the task's execution before `deleteCascade` destroys it and
 * runs its output parameters (`BpmnExceptionHandler.java:146-154`, `PvmAtomicOperationCancelActivity.java:60`,
 * `PvmExecutionImpl.java:613-626`, `ExecutionEntity.java:521-525`). An installed value of a name the frame holds, an
 * input local or a result value the delegate set with `setVariableLocal`, is that local and ends with the Activity; any
 * other is written outward from the frame first, so an output of its name is written after it. The outputs read the
 * result `origin.patch` as a completion's do (`completionOutputs`). Both writes apply at once through `write`
 * (`Data.writeOutputs`), so that the interrupted host's outputs the search evaluates next read them; the Activity's
 * removal is queued as raised.
 */
export function mappedErrorOutputs(write: WriteOutputs, ctx: Ctx, origin: Origin, installed: readonly Binding[], state: State): Outcome {
  const host = origin.host;
  if (host === null) return failed(FailureTag.SemanticFailure, "error-exit-without-host");
  const element = programElement(ctx.program, origin.element);
  const envelope = element === null ? null : elementEnvelope(element);
  const frame = localScope(state, host);
  const held = [...origin.patch, ...(frame === null ? [] : ownVariables(state, frame))].map(([name]) => name);
  const outward = installed.filter(([name]) => !held.includes(name));
  const written = errorExitOutputs(ctx, state, host, origin, envelope, installed);
  if (!written.ok) return failedWith(written.failure);
  const installedState = outward.length === 0 ? committed(state) : write(ctx, frame ?? origin.scope, outward, WriteRule.Outward, state);
  if (!installedState.ok) return installedState;
  const left = write(ctx, origin.scope, written.value, WriteRule.Outward, installedState.value);
  return left.ok ? committed(signal(left.value, completeSignal(host, leaveRaised, [], WriteRule.Outward))) : left;
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

/**
 * A delivery completes a Receive Task only on the channel it waits on; the Message carries no payload here. The wait is
 * uncorrelated, since admission refuses a Receive Task correlation (`work.receive.correlation`), so a delivery naming a
 * criterion is refused as a Message subscription refuses one it does not bind (`subscriptions.ts` `admitFiring`).
 */
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
      if (fired.delivery.correlation.length > 0) return failed(FailureTag.Rejected, "message-correlation-mismatch");
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
      return Call.returnFromCall(ctx, header, payload, work.payload, calledRoot, owner, state);
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
