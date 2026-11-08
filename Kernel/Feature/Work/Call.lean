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

/-- Evaluate a Call's mappings against `variables`. A CIB copy reads an unset variable source as null
(`CallWork.unsetSourceReadsNull`); a BPMN Data Association from an unset source makes the set unavailable, which
the state cannot hold at a Call yet, so the step is refused as `unsupported` with `unavailable`. -/
def copy (ctx : Ctx) (work : CallWork) (unavailable : String) (variables : List (String × Value))
    (mappings : List Mapping) : Except Failure (List (String × Value)) :=
  mappings.mapM fun mapping =>
    let unset : Bool :=
      match mapping.source with
      | .variable name => !variables.any (·.1 == name)
      | .literal _ => false
      | .simpleBoolean _ => false
      | .foreign _ _ => false
    if unset then
      if work.unsetSourceReadsNull then .ok (mapping.target, .null) else .error (.unsupported unavailable)
    else
      match ctx.evaluate variables mapping.source with
      | .value value => .ok (mapping.target, value)
      | .needsHost => .error (.unsupported "host-evaluation")
      | .failure code => .error (.semanticFailure code)

/-- The called process a Call names. An expression-named called element needs the host evaluator, and a call of
the root process would need the root's elements in a called instance. -/
def calledProcess (ctx : Ctx) (work : CallWork) : Except Failure CalledProcess :=
  match work.calledElement with
  | .expression _ => .error (.unsupported "call-element-expression")
  | .literal id =>
    if id == ctx.program.identity.processId then .error (.unsupported "call-root-process")
    else match ctx.program.calledProcess? id with
      | some process => .ok process
      | none => .error (.semanticFailure "call-without-called-process")

/-- Start the called instance. An Event Sub-Process of the called process would need its start subscriptions armed
in the called root, which `Signal.armScope` cannot name, so a called process that declares one is refused. -/
def invoke (ctx : Ctx) (header : Header) (payload : ActivityPayload) (work : CallWork) (arrival : Arrival)
    (state : State) : Outcome := do
  let process ← calledProcess ctx work
  let children := ctx.program.processChildren process
  if children.any (fun child => (child.scope?.bind fun (_, scope) => ctx.eventStart scope).isSome) then
    .error (.unsupported "called-event-subprocess")
  else
    let inputs ← copy ctx work "call-input-unavailable" (state.visible arrival.scope) work.inputs
    match children.findSome? fun child => child.start?.bind fun (_, start) =>
        if start.subscription.isNone then some start else none with
    | none => .error (.semanticFailure "called-process-without-none-start")
    | some start =>
      let (state, root) := state.enterCalled header.id arrival.scope inputs
      let state :=
        if payload.envelope.boundaries.isEmpty then state else state.signal (.arm root.value header.id arrival.scope)
      .ok (state.emit start.outgoing root)

/-- `Hooks.completeCall`: return from the idle called instance whose root is `occurrence`. -/
def complete (ctx : Ctx) (_ : Header) (payload : ActivityPayload) (work : CallWork) (occurrence : ScopeOccurrence)
    (state : State) : Outcome := do
  let parent ← match occurrence.parent with
    | some parent => .ok parent
    | none => .error (.semanticFailure "called-instance-without-caller")
  let outputs ← copy ctx work "call-output-unavailable" (state.visible occurrence.id) work.outputs
  let left := (state.leaveScope occurrence.id).disarm occurrence.id.value
  let written := outputs.foldl (fun state binding => state.writeOutward parent binding) left
  .ok (written.emit payload.envelope.outgoing parent)

def callWork? : Work → Option CallWork
  | .call work => some work
  | .none => none
  | .manual => none
  | .user _ => none
  | .receive _ => none
  | .service _ => none
  | .send _ => none
  | .script _ => none
  | .rule _ => none

/-- The root-level names a User Task submission inside the called instance of `scope` may carry under the
scope-chain submission rule (`Kernel.Feature.Work.Submission`): its Call's input targets and the variables its
outputs read, since the called root's variables grow by output sources the callee has not set yet (CVM-TASK-01).
Empty outside a called instance. -/
def submissionNames (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) : List String :=
  let root := state.instanceRoot scope
  let work : Option CallWork :=
    (state.scopes.find? fun occurrence => occurrence.id == root && occurrence.calledInstance.isSome).bind
      fun occurrence => ((occurrence.element.bind ctx.program.element?).bind (·.activity?)).bind
        fun (_, payload) => callWork? payload.work
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
