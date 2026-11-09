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

/-- The called process a Call names. An expression-named called element and a call of the root process are refused
at admission (`work.call.calledElementExpression`, `work.call.rootProcess`). -/
def calledProcess (ctx : Ctx) (work : CallWork) : Except Failure CalledProcess :=
  match work.calledElement with
  | .expression _ => .error (.unsupported "work-call-called-element-expression")
  | .literal id =>
    if id == ctx.program.identity.processId then .error (.unsupported "work-call-root-process")
    else match ctx.program.calledProcess? id with
      | some process => .ok process
      | none => .error (.semanticFailure "call-without-called-process")

/-- Start the called instance. The Event Sub-Processes of a called process are not admitted yet
(`call.calledEventSubProcess`): `armScope` and the raise search read a scope occurrence's element's children, which for
a called root are the Call's, so they need the called process's children instead. -/
def invoke (ctx : Ctx) (header : Header) (payload : ActivityPayload) (work : CallWork) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let process ← calledProcess ctx work
  let children := ctx.program.processChildren process
  if children.any (fun child => (child.scope?.bind fun (_, scope) => ctx.eventStart scope).isSome) then
    .error (.unsupported "call-called-event-subprocess")
  else
    let inputs ← copy ctx "call-input-unavailable" (state.evalContext occurrence.scope) work.inputs
    match children.findSome? fun child => child.start?.bind fun (start, payload) =>
        if payload.subscription.isNone then some start else none with
    | none => .error (.semanticFailure "called-process-without-none-start")
    | some start =>
      let (state, root) := state.enterCalled occurrence inputs process.definition
      let state :=
        if payload.envelope.boundaries.isEmpty || payload.envelope.multiInstance.isSome then state
        else state.signal (.arm occurrence.id header.id occurrence.scope)
      .ok (state.signal (.begin { element := start.id, scope := root }))

/-- `Hooks.completeCall`: return from the idle called instance whose root is `root`. -/
def complete (ctx : Ctx) (_ : Header) (_ : ActivityPayload) (work : CallWork) (root : ScopeOccurrence)
    (owner : Occurrence) (state : State) : Outcome := do
  let outputs ← copy ctx "call-output-unavailable" (state.evalContext root.id) work.outputs
  .ok (state.signal (.complete owner.id .outgoing outputs .outward))

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
      | .foreign _ _ => none

end Kernel.Feature.Work.Call
