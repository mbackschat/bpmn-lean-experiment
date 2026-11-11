/**
 * Work: Call Activities, transcribed from `Kernel/Feature/Work/Call.lean`.
 *
 * A Call Activity starts an instance of a called process the program carries (BPMN 2.0.2 §10.3.6): a scope occurrence
 * inside the Call's scope occurrence that is the called instance's root, named by `calledInstanceId` and holding the
 * Call's input values as its only variables, so the caller's variables stay invisible in the called process. The
 * called process's none start Event emits inside it. When the root is idle, the Call's output mappings are evaluated
 * against the called root's variables, the called instance is left with everything in it, and the outputs are written
 * outward from the Call's scope occurrence before its outgoing flows receive tokens.
 */
import {
  ExpressionTag,
  ValueSourceTag,
  assertNever,
  elementActivity,
  elementStart,
  programCalledProcessFor,
  programCallerDeployment,
  programCallsRoot,
  programElement,
  programProcessChildren,
  workCall,
  type ActivityPayload,
  type CallWork,
  type CalledProcess,
  type Header,
  type Mapping,
} from "../../il/types.js";
import {
  FailureTag,
  SignalTag,
  WriteRule,
  beginRequest,
  committed,
  completeSignal,
  enterCalled,
  failed,
  instanceRoot,
  leaveOutgoing,
  signal,
  type Binding,
  type EvalContext,
  type Occurrence,
  type Outcome,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "../../state.js";
import { ctxEvaluateMappings, evalContext, type Ctx } from "../../hooks.js";

/**
 * Evaluate a Call's mappings against `variables`, each by its dialect (`ctxEvaluateMappings`). A Data Association's
 * unavailable source makes the set unavailable, which the state cannot hold at a Call yet, so the step is refused as
 * `unsupported` with `unavailable` (dynamic-only: whether a source variable is set depends on the run).
 */
function copy(ctx: Ctx, unavailable: string, context: EvalContext, mappings: readonly Mapping[]): Result<readonly Binding[]> {
  const evaluated = ctxEvaluateMappings(ctx, context, mappings);
  if (!evaluated.ok) return evaluated;
  // dynamic-only: whether a source is set is the run's data
  return evaluated.value === null ? failed(FailureTag.Unsupported, unavailable) : committed(evaluated.value);
}

/**
 * The called process the Call on `header`'s element names, the one its selector admits at its caller's deployment
 * (`programCalledProcessFor`, `programCallerDeployment`). An expression-named called element, a call of the root
 * process and a selector admitting no process or several are refused at admission (`work.call.calledElementExpression`,
 * `work.call.rootProcess`, `work.call.calledProcessMissing`, `work.call.ambiguous`).
 */
function calledProcess(ctx: Ctx, header: Header, work: CallWork): Result<CalledProcess> {
  const called = work.calledElement;
  const resolution = ctx.program.options.calledElementResolution;
  switch (called.tag) {
    case ValueSourceTag.Expression:
      return failed(FailureTag.Unsupported, "work-call-called-element-expression");
    case ValueSourceTag.Literal: {
      if (programCallsRoot(ctx.program, resolution, work)) return failed(FailureTag.Unsupported, "work-call-root-process");
      const deployment = programCallerDeployment(ctx.program, header);
      const [process, ...others] = programCalledProcessFor(ctx.program, resolution, deployment, work);
      return process === undefined || others.length > 0
        ? failed(FailureTag.SemanticFailure, "call-without-called-process")
        : committed(process);
    }
  }
  return assertNever(called);
}

/**
 * Start the called instance: enter its root, arm the Call's boundaries and the called process's Event Sub-Process
 * starts (`Signal.armScope`, as `Scopes.enter` arms a Sub-Process), and begin its none start.
 */
export function invoke(ctx: Ctx, header: Header, payload: ActivityPayload, work: CallWork, occurrence: Occurrence, state: State): Outcome {
  const process = calledProcess(ctx, header, work);
  if (!process.ok) return process;
  const children = programProcessChildren(ctx.program, process.value);
  const inputs = copy(ctx, "call-input-unavailable", evalContext(state, occurrence.scope), work.inputs);
  if (!inputs.ok) return inputs;
  const start = children.map(elementStart).find((entry) => entry !== null && entry[1].subscription === null) ?? null;
  if (start === null) return failed(FailureTag.SemanticFailure, "called-process-without-none-start");
  const [entered, root] = enterCalled(state, occurrence, inputs.value, process.value.definition);
  const hosted = payload.envelope.boundaries.length === 0 || payload.envelope.multiInstance !== null
    ? entered
    : signal(entered, { tag: SignalTag.Arm, host: occurrence.id, element: header.id, scope: occurrence.scope });
  const armed = signal(hosted, { tag: SignalTag.ArmScope, scope: root });
  return committed(signal(armed, { tag: SignalTag.Begin, request: beginRequest({ element: start[0].id, scope: root }) }));
}

/** The body of `Hooks.completeCall`: return from the idle called instance whose root is `root`. */
export function returnFromCall(
  ctx: Ctx,
  _header: Header,
  _payload: ActivityPayload,
  work: CallWork,
  root: ScopeOccurrence,
  owner: Occurrence,
  state: State,
): Outcome {
  const outputs = copy(ctx, "call-output-unavailable", evalContext(state, root.id), work.outputs);
  if (!outputs.ok) return outputs;
  return committed(signal(state, completeSignal(owner.id, leaveOutgoing, outputs.value, WriteRule.Outward)));
}

/**
 * What `PropagationHooks.callOutputs` writes when a raised Error or Escalation reaches the called root `root`: its
 * Call's output mappings evaluated against the called instance, to be written outward from the Call's scope occurrence,
 * as its normal return writes them (CIB-EXT-0034; `tree/OutputVariablesPropagator.java:34-43`,
 * `CallableElementActivityBehavior.java:133-139`). The writes take effect before the search goes on, since an outer
 * Call's outputs read what an inner pass wrote, so `registry.ts` hands them to `Data.writeOutputs` instead of queueing
 * a write signal. Whether the profile selects the pass is the search's to decide.
 */
export function raisedOutputs(ctx: Ctx, root: ScopeOccurrence, state: State): Result<readonly [ScopeOccurrenceId, readonly Binding[]]> {
  const element = root.element === null ? null : programElement(ctx.program, root.element);
  const activity = element === null ? null : elementActivity(element);
  const work = activity === null ? null : workCall(activity[1].work);
  if (work === null) return failed(FailureTag.SemanticFailure, "called-root-without-call");
  if (root.parent === null) return failed(FailureTag.SemanticFailure, "called-root-without-caller");
  const outputs = copy(ctx, "call-output-unavailable", evalContext(state, root.id), work.outputs);
  if (!outputs.ok) return outputs;
  return committed([root.parent, outputs.value] as const);
}

/**
 * The root-level names a User Task submission inside the called instance of `scope` may carry under the scope-chain
 * submission rule (`submission.ts`): its Call's input targets and the variables its outputs read, since the called
 * root's variables grow by output sources the callee has not set yet (CVM-TASK-01). Empty outside a called instance.
 */
export function submissionNames(ctx: Ctx, state: State, scope: ScopeOccurrenceId): readonly string[] {
  const top = instanceRoot(state, scope);
  const occurrence = state.scopes.find((candidate) => candidate.id === top && candidate.calledInstance !== null);
  const element = occurrence?.element == null ? null : programElement(ctx.program, occurrence.element);
  const activity = element === null ? null : elementActivity(element);
  const work = activity === null ? null : workCall(activity[1].work);
  if (work === null) return [];
  return [
    ...work.inputs.map((mapping) => mapping.target),
    ...work.outputs.flatMap((mapping) => {
      const source = mapping.source;
      switch (source.tag) {
        case ExpressionTag.Variable:
          return [source.name];
        case ExpressionTag.Literal:
        case ExpressionTag.SimpleBoolean:
        case ExpressionTag.Juel:
        case ExpressionTag.Foreign:
          return [];
      }
      return assertNever(source);
    }),
  ];
}
