/**
 * Work: Call Activities, transcribed from `Kernel/Feature/Work/Call.lean`.
 *
 * A Call Activity starts an instance of a called process the program carries (BPMN 2.0.2 §10.3.6): a scope
 * occurrence inside the Call's scope occurrence that is the called instance's root, named by `calledInstanceId`
 * and holding the Call's input values as its only variables, so the caller's variables stay invisible in the called
 * process. The called process's none start Event emits inside it. When the root is idle, the Call's output mappings
 * are evaluated against the called root's variables, the called instance is left with everything in it, and the
 * outputs are written outward from the Call's scope occurrence before its outgoing flows receive tokens.
 */
import {
  EvaluationTag,
  type Arrival,
  type Ctx,
} from "../../hooks.js";
import {
  ExpressionTag,
  ValueSourceTag,
  ValueTag,
  WorkTag,
  assertNever,
  type ActivityPayload,
  type CalledProcess,
  type CallWork,
  type Header,
  type Mapping,
  type Work,
} from "../../il/types.js";
import {
  elementActivity,
  elementScope,
  elementStart,
  programCalledProcess,
  programElement,
  programProcessChildren,
} from "../../il/query.js";
import {
  FailureTag,
  SignalTag,
  committed,
  disarm,
  emit,
  enterCalled,
  failed,
  instanceRoot,
  leaveScope,
  signal,
  visible,
  writeOutward,
  type Binding,
  type Outcome,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "../../state.js";

/**
 * Evaluate a Call's mappings against `variables`. A CIB copy reads an unset variable source as null
 * (`CallWork.unsetSourceReadsNull`); a BPMN Data Association from an unset source makes the set unavailable, which
 * the state cannot hold at a Call yet, so the step is refused as `unsupported` with `unavailable`.
 */
export function copy(
  ctx: Ctx,
  work: CallWork,
  unavailable: string,
  variables: readonly Binding[],
  mappings: readonly Mapping[],
): Result<readonly Binding[]> {
  const copied: Binding[] = [];
  for (const mapping of mappings) {
    const source = mapping.source;
    const unset = ((): boolean => {
      switch (source.tag) {
        case ExpressionTag.Variable:
          return !variables.some((binding) => binding[0] === source.name);
        case ExpressionTag.Literal:
          return false;
        case ExpressionTag.SimpleBoolean:
          return false;
        case ExpressionTag.Foreign:
          return false;
      }
      return assertNever(source);
    })();
    if (unset) {
      if (!work.unsetSourceReadsNull) {
        return failed(FailureTag.Unsupported, unavailable);
      }
      copied.push([mapping.target, { tag: ValueTag.Null }]);
      continue;
    }
    const evaluation = ctx.evaluate(variables, source);
    switch (evaluation.tag) {
      case EvaluationTag.Value:
        copied.push([mapping.target, evaluation.result]);
        continue;
      case EvaluationTag.NeedsHost:
        return failed(FailureTag.Unsupported, "host-evaluation");
      case EvaluationTag.Failure:
        return failed(FailureTag.SemanticFailure, evaluation.code);
    }
    return assertNever(evaluation);
  }
  return committed(copied);
}

/**
 * The called process a Call names. An expression-named called element needs the host evaluator, and a call of the
 * root process would need the root's elements in a called instance.
 */
export function calledProcess(ctx: Ctx, work: CallWork): Result<CalledProcess> {
  const called = work.calledElement;
  switch (called.tag) {
    case ValueSourceTag.Expression:
      return failed(FailureTag.Unsupported, "call-element-expression");
    case ValueSourceTag.Literal: {
      if (called.value === ctx.program.identity.processId) {
        return failed(FailureTag.Unsupported, "call-root-process");
      }
      const process = programCalledProcess(ctx.program, called.value);
      return process === null ? failed(FailureTag.SemanticFailure, "call-without-called-process") : committed(process);
    }
  }
  return assertNever(called);
}

/**
 * Start the called instance. An Event Sub-Process of the called process would need its start subscriptions armed in
 * the called root, which `Signal.armScope` cannot name, so a called process that declares one is refused.
 */
export function invoke(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  work: CallWork,
  arrival: Arrival,
  state: State,
): Outcome {
  const process = calledProcess(ctx, work);
  if (!process.ok) {
    return process;
  }
  const children = programProcessChildren(ctx.program, process.value);
  if (
    children.some((child) => {
      const scope = elementScope(child);
      return scope !== null && ctx.eventStart(scope[1]) !== null;
    })
  ) {
    return failed(FailureTag.Unsupported, "called-event-subprocess");
  }
  const inputs = copy(ctx, work, "call-input-unavailable", visible(state, arrival.scope), work.inputs);
  if (!inputs.ok) {
    return inputs;
  }
  let start = null;
  for (const child of children) {
    const found = elementStart(child);
    if (found !== null && found[1].subscription === null) {
      start = found[1];
      break;
    }
  }
  if (start === null) {
    return failed(FailureTag.SemanticFailure, "called-process-without-none-start");
  }
  const [entered, root] = enterCalled(state, header.id, arrival.scope, inputs.value);
  const armed =
    payload.envelope.boundaries.length === 0
      ? entered
      : signal(entered, { tag: SignalTag.Arm, host: root, element: header.id, scope: arrival.scope });
  return committed(emit(armed, start.outgoing, root));
}

/** `Hooks.completeCall`: return from the idle called instance whose root is `occurrence`. */
export function complete(
  ctx: Ctx,
  _header: Header,
  payload: ActivityPayload,
  work: CallWork,
  occurrence: ScopeOccurrence,
  state: State,
): Outcome {
  const parent = occurrence.parent;
  if (parent === null) {
    return failed(FailureTag.SemanticFailure, "called-instance-without-caller");
  }
  const outputs = copy(ctx, work, "call-output-unavailable", visible(state, occurrence.id), work.outputs);
  if (!outputs.ok) {
    return outputs;
  }
  const left = disarm(leaveScope(state, occurrence.id), occurrence.id);
  const written = outputs.value.reduce((current, binding) => writeOutward(current, parent, binding), left);
  return committed(emit(written, payload.envelope.outgoing, parent));
}

export function callWork(work: Work): CallWork | null {
  switch (work.tag) {
    case WorkTag.Call:
      return work.payload;
    case WorkTag.None:
      return null;
    case WorkTag.Manual:
      return null;
    case WorkTag.User:
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
  }
  return assertNever(work);
}

/**
 * The root-level names a User Task submission inside the called instance of `scope` may carry under the scope-chain
 * submission rule (`work/submission.ts`): its Call's input targets and the variables its outputs read, since the
 * called root's variables grow by output sources the callee has not set yet (CVM-TASK-01). Empty outside a called
 * instance.
 */
export function submissionNames(ctx: Ctx, state: State, scope: ScopeOccurrenceId): readonly string[] {
  const top = instanceRoot(state, scope);
  const occurrence = state.scopes.find((candidate) => candidate.id === top && candidate.calledInstance !== null);
  const element = occurrence?.element ?? null;
  const found = element === null ? null : programElement(ctx.program, element);
  const activity = found === null ? null : elementActivity(found);
  const work = activity === null ? null : callWork(activity[1].work);
  if (work === null) {
    return [];
  }
  return [
    ...work.inputs.map((mapping) => mapping.target),
    ...work.outputs.flatMap((mapping): string[] => {
      const source = mapping.source;
      switch (source.tag) {
        case ExpressionTag.Variable:
          return [source.name];
        case ExpressionTag.Literal:
          return [];
        case ExpressionTag.SimpleBoolean:
          return [];
        case ExpressionTag.Foreign:
          return [];
      }
      return assertNever(source);
    }),
  ];
}
