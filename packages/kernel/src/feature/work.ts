/**
 * Work: what an Activity does, transcribed from `Kernel/Feature/Work.lean`.
 *
 * Owns matching on `Work`. An Activity's input mappings are evaluated once, on arrival, against the variables
 * visible from its scope occurrence; they become the Activity's local values (a User Task's published inputs, an
 * effect's arguments). A task without work passes its token through; a User Task, a Service Task's effect and a
 * Receive Task's Message open one item each, and the input that closes the item completes the Activity: its output
 * mappings write outward, its attached items are disarmed and its outgoing flows receive tokens.
 *
 * An Activity with boundaries signals `arm` for the item it opened; a BPMN error an effect reports is raised from
 * the Activity after its outputs are written and its item and attached items are removed, so the catcher, which may
 * be a boundary of this Activity, finds nothing of the Activity left to interrupt. A technical failure turns the
 * effect's item into an incident with the same identity and attachments, which a retry turns back.
 */
import { ctxEvaluateMappings, type Arrival, type Ctx } from "../hooks.js";
import {
  ValueSourceTag,
  WorkTag,
  assertNever,
  type ActivityPayload,
  type Header,
  type Mapping,
  type MessageTrigger,
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
  clearInside,
  closeItem,
  committed,
  disarm,
  openKindEffect,
  emit,
  failed,
  hold,
  openKindIncident,
  instanceRoot,
  messageChannelEquals,
  openKindMessage,
  openAttached,
  root,
  signal,
  visible,
  write,
  writeOutward,
  type Binding,
  type CommandAction,
  type EffectOutcome,
  type Fired,
  type MessageChannel,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
  type UserTaskDetail,
} from "../state.js";
import { complete as completeCallWork, invoke } from "./work/call.js";
import { check } from "./work/submission.js";

/** Open `kind` for the Activity and arm its boundaries on the new item. */
export function openWork(
  kind: OpenKind,
  header: Header,
  payload: ActivityPayload,
  scope: ScopeOccurrenceId,
  state: State,
): State {
  const [opened, id] = openAttached(state, kind, header.id, scope, null);
  return payload.envelope.boundaries.length === 0
    ? opened
    : signal(opened, { tag: SignalTag.Arm, host: id, element: header.id, scope });
}

/** The Message a Receive Task waits for. An expression-named Message needs the host evaluator. */
export function channel(trigger: MessageTrigger): Result<MessageChannel> {
  const address = (messageId: string | null): MessageChannel => ({
    messageId,
    interfaceRef: trigger.interfaceRef,
    operationRef: trigger.operationRef,
  });
  const name = trigger.name;
  if (name === null) {
    return committed(address(null));
  }
  switch (name.tag) {
    case ValueSourceTag.Literal:
      return committed(address(name.value));
    case ValueSourceTag.Expression:
      return failed(FailureTag.Unsupported, "receive-message-expression");
  }
  return assertNever(name);
}

/**
 * The outputs a completion writes, from the values it submits. The submission must be exactly the Activity's
 * OutputSet (BPMN 2.0.2 §10.4.1): every output mapping evaluates against the submitted values alone, no name is
 * submitted twice, and no submitted value is superfluous (dropping it leaves the outputs evaluable). Anything else is
 * rejected, so a completion never commits a partial or unmediated write; the retained baselines observe it for User
 * Task data outputs (`activity-data-output-omitted`, `structured-composition-serial-null`) and effect result patches
 * alike.
 */
export function outputs(ctx: Ctx, mappings: readonly Mapping[], values: readonly Binding[]): Result<readonly Binding[]> {
  const fills = (submitted: readonly Binding[]): boolean => ctxEvaluateMappings(ctx, submitted, mappings).ok;
  const names = values.map((binding) => binding[0]);
  if (new Set(names).size !== names.length) {
    return failed(FailureTag.Rejected, "duplicate-output");
  }
  const evaluated = ctxEvaluateMappings(ctx, values, mappings);
  if (!evaluated.ok) {
    const failure = evaluated.failure;
    switch (failure.tag) {
      case FailureTag.Unsupported:
        return failed(FailureTag.Unsupported, failure.code);
      case FailureTag.Rejected:
        return failed(FailureTag.Rejected, "output-unavailable");
      case FailureTag.SemanticFailure:
        return failed(FailureTag.Rejected, "output-unavailable");
      case FailureTag.RolledBack:
        return failed(FailureTag.RolledBack, failure.code);
    }
    return assertNever(failure.tag);
  }
  if (names.some((name) => fills(values.filter((binding) => binding[0] !== name)))) {
    return failed(FailureTag.Rejected, "undeclared-output");
  }
  return committed(evaluated.value);
}

/**
 * An Activity with a compensation handler stays compensable once it completes (BPMN 2.0.2 §13.5.5); a boundary
 * handler restores no context.
 */
export function retain(payload: ActivityPayload, item: OpenItem, state: State): State {
  return payload.envelope.compensationHandler !== null
    ? signal(state, { tag: SignalTag.Completed, element: item.element, scope: item.scope, snapshot: [] })
    : state;
}

/** Close the Activity's item, write `written` outward from its scope and take its outgoing flows. */
export function finish(payload: ActivityPayload, item: OpenItem, written: readonly Binding[], state: State): State {
  const closed = disarm(closeItem(state, item.id), item.id);
  const wrote = written.reduce((current, binding) => writeOutward(current, item.scope, binding), closed);
  return retain(payload, item, emit(wrote, payload.envelope.outgoing, item.scope));
}

/** What an open User Task publishes, with the inputs it was given. */
export function userTaskDetail(task: UserWork, inputs: readonly Binding[]): UserTaskDetail {
  const groups = task.candidateGroups.flatMap((source): string[] => {
    switch (source.tag) {
      case ValueSourceTag.Literal:
        return [source.value];
      case ValueSourceTag.Expression:
        return [];
    }
    return assertNever(source);
  });
  return { name: task.name, candidateGroups: groups, formFields: task.formFields, inputs };
}

/**
 * `Ctx.bodyWait`: one instance of a Multi-Instance User Task opens a User Task that publishes no inputs, its item
 * being published with the Multi-Instance Activity instead; other work does not run as an instance.
 */
export function bodyWait(payload: ActivityPayload): OpenKind | null {
  const work = payload.work;
  switch (work.tag) {
    case WorkTag.User:
      return { tag: OpenKindTag.UserTask, detail: userTaskDetail(work.payload, []) };
    case WorkTag.None:
      return null;
    case WorkTag.Manual:
      return null;
    case WorkTag.Receive:
      return null;
    case WorkTag.Service:
      return null;
    case WorkTag.Send:
      return null;
    case WorkTag.Script:
      return null;
    case WorkTag.Rule:
      return null;
    case WorkTag.Call:
      return null;
  }
  return assertNever(work);
}

/**
 * An input mapping whose source is unavailable makes the InputSet unavailable, and the Activity waits for it
 * (BPMN 2.0.2 §10.4.2): the token is held at the Activity (`FeatureSlots.held`), keeping its scope occurrence alive.
 * Nothing re-evaluates a held InputSet yet, so the token waits until its scope occurrence is cleared.
 */
export function arriveActivity(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  arrival: Arrival,
  state: State,
): Outcome {
  const evaluated = ctxEvaluateMappings(ctx, visible(state, arrival.scope), payload.envelope.inputs);
  if (!evaluated.ok) {
    const failure = evaluated.failure;
    switch (failure.tag) {
      case FailureTag.SemanticFailure:
        return committed(hold(state, { flow: arrival.flow, scope: arrival.scope }));
      case FailureTag.Rejected:
        return failed(FailureTag.Rejected, failure.code);
      case FailureTag.Unsupported:
        return failed(FailureTag.Unsupported, failure.code);
      case FailureTag.RolledBack:
        return failed(FailureTag.RolledBack, failure.code);
    }
    return assertNever(failure.tag);
  }
  const inputs = evaluated.value;
  const work = payload.work;
  switch (work.tag) {
    case WorkTag.None:
      return committed(emit(state, payload.envelope.outgoing, arrival.scope));
    case WorkTag.Manual:
      return committed(emit(state, payload.envelope.outgoing, arrival.scope));
    case WorkTag.User:
      return committed(
        openWork(
          { tag: OpenKindTag.UserTask, detail: userTaskDetail(work.payload, inputs) },
          header,
          payload,
          arrival.scope,
          state,
        ),
      );
    case WorkTag.Receive: {
      const address = channel(work.payload.message);
      if (!address.ok) {
        return address;
      }
      return committed(
        openWork(
          { tag: OpenKindTag.Message, detail: { channel: address.value, payload: false, correlationKey: null } },
          header,
          payload,
          arrival.scope,
          state,
        ),
      );
    }
    case WorkTag.Service:
      return committed(
        openWork(
          {
            tag: OpenKindTag.Effect,
            detail: {
              protocol: work.payload.protocol,
              operation: work.payload.operation,
              arguments: inputs,
              failures: 0,
            },
          },
          header,
          payload,
          arrival.scope,
          state,
        ),
      );
    case WorkTag.Send:
      return failed(FailureTag.Unsupported, "send-task");
    case WorkTag.Script:
      return failed(FailureTag.Unsupported, "script-task");
    case WorkTag.Rule:
      return failed(FailureTag.Unsupported, "business-rule-task");
    case WorkTag.Call:
      return invoke(ctx, header, payload, work.payload, arrival, state);
  }
  return assertNever(work);
}

/**
 * `Hooks.startActivity`: begin, in `scope`, an Activity that no token reaches: one without incoming Sequence Flow in
 * a Scope without a start Event, or a compensation handler. An unavailable InputSet has no token to hold, so it is
 * refused, as is work other than a task without work, a User Task or a Service Task.
 */
export function startActivity(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  scope: ScopeOccurrenceId,
  state: State,
): Outcome {
  const evaluated = ctxEvaluateMappings(ctx, visible(state, scope), payload.envelope.inputs);
  if (!evaluated.ok) {
    const failure = evaluated.failure;
    switch (failure.tag) {
      case FailureTag.SemanticFailure:
        return failed(FailureTag.Unsupported, "started-activity-input-unavailable");
      case FailureTag.Rejected:
        return evaluated;
      case FailureTag.Unsupported:
        return evaluated;
      case FailureTag.RolledBack:
        return evaluated;
    }
    return assertNever(failure.tag);
  }
  const inputs = evaluated.value;
  const work = payload.work;
  switch (work.tag) {
    case WorkTag.None:
      return committed(emit(state, payload.envelope.outgoing, scope));
    case WorkTag.Manual:
      return committed(emit(state, payload.envelope.outgoing, scope));
    case WorkTag.User:
      return committed(
        openWork({ tag: OpenKindTag.UserTask, detail: userTaskDetail(work.payload, inputs) }, header, payload, scope, state),
      );
    case WorkTag.Service:
      return committed(
        openWork(
          {
            tag: OpenKindTag.Effect,
            detail: {
              protocol: work.payload.protocol,
              operation: work.payload.operation,
              arguments: inputs,
              failures: 0,
            },
          },
          header,
          payload,
          scope,
          state,
        ),
      );
    case WorkTag.Receive:
      return failed(FailureTag.Unsupported, "started-receive-task");
    case WorkTag.Send:
      return failed(FailureTag.Unsupported, "send-task");
    case WorkTag.Script:
      return failed(FailureTag.Unsupported, "script-task");
    case WorkTag.Rule:
      return failed(FailureTag.Unsupported, "business-rule-task");
    case WorkTag.Call:
      return failed(FailureTag.Unsupported, "started-call-activity");
  }
  return assertNever(work);
}

/**
 * A User Task without output mappings, under a profile whose submission installs variables (CIB-EXT-0005), writes
 * the submitted values from its scope; otherwise the submission is the task's OutputSet (`outputs`), which for a
 * task without outputs admits only the empty submission. The scope-chain rule, when the profile selects it, applies
 * first (`work/submission.ts`).
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
    const checked = check(ctx, state, item.scope, limit, values);
    if (!checked.ok) {
      return checked;
    }
  }
  if (payload.envelope.outputs.length === 0 && ctx.program.options.submissionInstallsVariables) {
    const written = values.reduce((current, [name, value]) => write(current, item.scope, name, value), state);
    return committed(
      retain(payload, item, emit(disarm(closeItem(written, item.id), item.id), payload.envelope.outgoing, item.scope)),
    );
  }
  const written = outputs(ctx, payload.envelope.outputs, values);
  if (!written.ok) {
    return written;
  }
  return committed(finish(payload, item, written.value, state));
}

/** Replace the kind of the open item `id`, keeping its identity, activation and attachments. */
export function reopen(state: State, id: number, kind: OpenKind): State {
  return { ...state, openItems: state.openItems.map((item) => (item.id === id ? { ...item, kind } : item)) };
}

/**
 * An effect's result patch is its OutputSet. A BPMN error writes its outputs too, then raises from the Activity with
 * the closed item as host, as the mapped-boundary-error baseline observes.
 */
export function effectResult(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  item: OpenItem,
  outcome: EffectOutcome,
  state: State,
): Outcome {
  switch (outcome.tag) {
    case EffectOutcomeTag.Success: {
      const written = outputs(ctx, payload.envelope.outputs, outcome.outputs);
      if (!written.ok) {
        return written;
      }
      return committed(finish(payload, item, written.value, state));
    }
    case EffectOutcomeTag.BusinessFailure: {
      const written = outputs(ctx, payload.envelope.outputs, outcome.outputs);
      if (!written.ok) {
        return written;
      }
      const closed = disarm(closeItem(state, item.id), item.id);
      const wrote = written.value.reduce((current, binding) => writeOutward(current, item.scope, binding), closed);
      return committed(
        signal(wrote, {
          tag: SignalTag.Raise,
          event: { tag: RaisedTag.Error, code: outcome.code, message: outcome.message },
          origin: { element: header.id, scope: item.scope, host: item.id, activation: item.activation },
        }),
      );
    }
    case EffectOutcomeTag.TechnicalFailure: {
      const detail = openKindEffect(item.kind);
      if (detail === null) {
        return failed(FailureTag.SemanticFailure, "effect-result-without-effect");
      }
      if (detail.failures > 0) {
        return failed(FailureTag.Unsupported, "repeated-effect-incident");
      }
      const effect = { ...detail, failures: detail.failures + 1 };
      return committed(
        reopen(state, item.id, {
          tag: OpenKindTag.Incident,
          detail: { effect, generation: 1, cancellable: ctx.program.options.incidentProcessCancellation },
        }),
      );
    }
  }
  return assertNever(outcome);
}

/**
 * A retry reopens the failed effect with the same occurrence (CIB-EXT-0013); cancelling the incident's process ends
 * the instance as cancelled, keeping its Process variables (CIB-EXT-0014, CIB-OP-0009), and is offered only for an
 * incident of the root process instance under a profile that selects it.
 */
export function resolveIncident(
  _ctx: Ctx,
  _header: Header,
  _payload: ActivityPayload,
  item: OpenItem,
  action: CommandAction,
  state: State,
): Outcome {
  const incident = openKindIncident(item.kind);
  if (incident === null) {
    return failed(FailureTag.SemanticFailure, "incident-command-without-incident");
  }
  switch (action.tag) {
    case CommandActionTag.RetryIncident:
      return committed(reopen(state, item.id, { tag: OpenKindTag.Effect, detail: incident.effect }));
    case CommandActionTag.CancelIncidentProcess:
      if (!incident.cancellable) {
        return failed(FailureTag.Rejected, "incident-process-cancellation-unavailable");
      }
      if (instanceRoot(state, item.scope) !== root) {
        return failed(FailureTag.Unsupported, "called-incident-cancellation");
      }
      return committed({ ...clearInside(state, root), status: InstanceStatus.Cancelled });
    case CommandActionTag.CompleteUserTask:
      return failed(FailureTag.SemanticFailure, "incident-user-task-completion");
  }
  return assertNever(action);
}

/** A delivery completes a Receive Task only on the channel it waits on; the Message carries no payload here. */
export function triggerActivity(
  _ctx: Ctx,
  _header: Header,
  payload: ActivityPayload,
  item: OpenItem,
  fired: Fired,
  state: State,
): Outcome {
  switch (fired.tag) {
    case FiredTag.Timer:
      return failed(FailureTag.SemanticFailure, "activity-timer-without-timer");
    case FiredTag.Message: {
      const detail = openKindMessage(item.kind);
      if (detail === null) {
        return failed(FailureTag.SemanticFailure, "activity-message-without-message");
      }
      if (!messageChannelEquals(fired.delivery.channel, detail.channel)) {
        return failed(FailureTag.Rejected, "message-channel-mismatch");
      }
      if (fired.delivery.payload !== null) {
        return failed(FailureTag.Rejected, "unexpected-message-payload");
      }
      return committed(finish(payload, item, [], state));
    }
  }
  return assertNever(fired);
}

/** `Hooks.completeCall`: only a Call Activity starts a called instance. */
export function completeCall(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  occurrence: ScopeOccurrence,
  state: State,
): Outcome {
  const work = payload.work;
  const notCall = (): Outcome => failed(FailureTag.SemanticFailure, "called-instance-without-call");
  switch (work.tag) {
    case WorkTag.Call:
      return completeCallWork(ctx, header, payload, work.payload, occurrence, state);
    case WorkTag.None:
      return notCall();
    case WorkTag.Manual:
      return notCall();
    case WorkTag.User:
      return notCall();
    case WorkTag.Receive:
      return notCall();
    case WorkTag.Service:
      return notCall();
    case WorkTag.Send:
      return notCall();
    case WorkTag.Script:
      return notCall();
    case WorkTag.Rule:
      return notCall();
  }
  return assertNever(work);
}
