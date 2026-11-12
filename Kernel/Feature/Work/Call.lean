module

public import Kernel.Hooks

/-! # Work: Call Activities

A Call Activity starts an instance of a called process the program carries
([BPMN 2.0.2 §10.3.6](../../../docs/reference/bpmn-2.0.2/README.md)): a scope occurrence inside the Call's scope
occurrence that is the called instance's root, named by `State.calledInstanceId` and holding the Call's input
values as its only variables, so the caller's variables stay invisible in the called process. The called process's
none start Event emits inside it. When the root is idle, the Call's output mappings are evaluated against the
called root's variables, the called instance is left with everything in it, and the outputs are written outward
from the Call's scope occurrence before its outgoing flows receive tokens.
-/

public section

namespace Kernel.Feature.Work.Call

/-- Evaluate a Call's mappings against `variables`, each by its dialect (`Ctx.evaluateMappings`). A Data Association's
unavailable source makes the set unavailable, which the state cannot hold at a Call yet, so the step is refused as
`unsupported` with `unavailable` (dynamic-only: whether a source variable is set depends on the run). -/
def copy (ctx : Ctx) (unavailable : String) (context : EvalContext) (mappings : List Mapping) :
    Except Failure (List (String × Value)) := do
  match ← ctx.evaluateMappings context mappings with
  | some bindings => .ok bindings
  | none => .error (.unsupported unavailable) -- dynamic-only: whether a source is set is the run's data

/-- The called process the Call on `header`'s element names, the one its selector admits at its caller's deployment
(`Program.calledProcessFor`, `Program.callerDeployment`). An expression-named called element, a call of the root process
and a selector admitting no process or several are refused at admission (`work.call.calledElementExpression`,
`work.call.rootProcess`, `work.call.calledProcessMissing`, `work.call.ambiguous`). -/
def calledProcess (ctx : Ctx) (header : Header) (work : CallWork) : Except Failure CalledProcess :=
  let resolution := ctx.program.options.calledElementResolution
  match work.calledElement with
  | .expression _ => .error (.unsupported "work-call-called-element-expression")
  | .literal _ =>
    if ctx.program.callsRoot resolution work then .error (.unsupported "work-call-root-process")
    else match ctx.program.calledProcessFor resolution (ctx.program.callerDeployment header) work with
      | [process] => .ok process
      | _ => .error (.semanticFailure "call-without-called-process")

/-- Start the called instance: enter its root, arm the Call's boundaries and the called process's Event Sub-Process
starts (`Signal.armScope`, as `Scopes.enter` arms a Sub-Process), and begin its none start. -/
def invoke (ctx : Ctx) (header : Header) (payload : ActivityPayload) (work : CallWork) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let process ← calledProcess ctx header work
  let children := ctx.program.processChildren process
  let inputs ← copy ctx "call-input-unavailable" (state.evalContext ctx.program occurrence.scope) work.inputs
  match children.findSome? fun child => child.start?.bind fun (start, payload) =>
      if payload.subscription.isNone then some start else none with
  | none => .error (.semanticFailure "called-process-without-none-start")
  | some start =>
    let (state, root) := state.enterCalled ctx.program occurrence inputs process.definition
    let state :=
      if payload.envelope.boundaries.isEmpty || payload.envelope.multiInstance.isSome then state
      else state.signal (.arm occurrence.id header.id occurrence.scope)
    .ok ((state.signal (.armScope root)).signal (.begin { element := start.id, scope := root }))

/-- The body of `Hooks.completeCall`: return from the idle called instance whose root is `root`. -/
def returnFromCall (ctx : Ctx) (_ : Header) (_ : ActivityPayload) (work : CallWork) (root : ScopeOccurrence)
    (owner : Occurrence) (state : State) : Outcome := do
  let outputs ← copy ctx "call-output-unavailable" (state.evalContext ctx.program root.id) work.outputs
  .ok (state.signal (.complete owner.id .outgoing outputs .outward))

/-- What `PropagationHooks.callOutputs` writes when a raised Error or Escalation reaches the called root `root`: its
Call's output mappings evaluated against the called instance, to be written outward from the Call's scope occurrence,
as its normal return writes them (CIB-EXT-0034; `tree/OutputVariablesPropagator.java:34-43`,
`CallableElementActivityBehavior.java:133-139`). The writes take effect before the search goes on, since an outer
Call's outputs read what an inner pass wrote, so `Kernel.Registry` hands them to `Feature.Data.writeOutputs` instead of
queueing a `Signal.write`. Whether the profile selects the pass is the search's to decide. -/
def raisedOutputs (ctx : Ctx) (root : ScopeOccurrence) (state : State) :
    Except Failure (ScopeOccurrenceId × List (String × Value)) := do
  let some work := ((root.element.bind ctx.program.element?).bind (·.activity?)).bind (·.2.work.call?)
    | .error (.semanticFailure "called-root-without-call")
  let some caller := root.parent | .error (.semanticFailure "called-root-without-caller")
  let outputs ← copy ctx "call-output-unavailable" (state.evalContext ctx.program root.id) work.outputs
  .ok (caller, outputs)

/-- The root-level names a User Task submission inside the called instance of `scope` may carry under the
scope-chain submission rule (`Kernel.Feature.Work.Submission`): its Call's input targets and the variables its
outputs read, since the called root's variables grow by output sources the callee has not set yet (CVM-TASK-01).
Empty outside a called instance. -/
def submissionNames (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) : List String :=
  let root := state.instanceRoot scope
  let work : Option CallWork :=
    (state.scopes.find? fun occurrence => occurrence.id == root && occurrence.calledInstance.isSome).bind
      fun occurrence => ((occurrence.element.bind ctx.program.element?).bind (·.activity?)).bind
        fun (_, payload) => payload.work.call?
  match work with
  | none => []
  | some work =>
    work.inputs.map (·.target) ++ work.outputs.filterMap fun mapping =>
      match mapping.source with
      | .variable name => some name
      | .literal _ => none
      | .simpleBoolean _ => none
      | .juel _ => none
      | .foreign _ _ => none

end Kernel.Feature.Work.Call
