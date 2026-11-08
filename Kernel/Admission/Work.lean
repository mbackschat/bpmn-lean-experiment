module

public import Kernel.IL.Types

/-! # Admission of Activities. A refusal carries a stable code.

Boundaries are admitted by `Kernel.Admission.Subscriptions` through the admission registry. Input and output
mappings are admitted only on the work kinds whose item carries the evaluated inputs (a User Task's published inputs,
an effect's arguments) and whose completion submits the values the outputs read (a User Task's submission, an
effect's result patch); elsewhere `Kernel.Feature.Work` would evaluate a mapping and drop its binding.
-/

public section

namespace Kernel.Admission.Work

def mapsData : Work → Bool
  | .user _ => true
  | .service _ => true
  | .none => false
  | .manual => false
  | .receive _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

/-- The work one instance of a Multi-Instance Activity may do: a User Task (`Kernel.Feature.Work.bodyWait`). The
Multi-Instance shape itself is admitted by `Kernel.Admission.MultiInstance`. -/
def instanceBody : Work → Bool
  | .user _ => true
  | .none => false
  | .manual => false
  | .receive _ => false
  | .service _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

def envelope (work : Work) (envelope : Envelope) : Option String :=
  if !envelope.inputs.isEmpty && !mapsData work then some "activity.inputMappings"
  else if !envelope.outputs.isEmpty && !mapsData work then some "activity.outputMappings"
  else if envelope.multiInstance.isSome && !instanceBody work then some "activity.multiInstanceBody"
  -- A compensation subject must report its completion (`Signal.completed`), which `Kernel.Feature.Work` does for a
  -- single User Task or Service Task only.
  else if envelope.compensationHandler.isSome && (!mapsData work || envelope.multiInstance.isSome) then
    some "activity.compensationHandler"
  else none

def receive (work : ReceiveWork) : Option String :=
  if !work.message.correlation.isEmpty then some "work.receive.correlation"
  else
    match work.message.name with
    | none => none
    | some (.literal _) => none
    | some (.expression _) => some "work.receive.messageExpression"

/-- A Call names its called process literally, binds the latest version, carries no business key and maps its
data explicitly; its mappings live in `CallWork`, never in the envelope. -/
def call (work : CallWork) : Option String :=
  let element : Option String :=
    match work.calledElement with
    | .literal _ => none
    | .expression _ => some "work.call.calledElementExpression"
  let binding : Option String :=
    match work.binding with
    | .latest => none
    | .deployment => some "work.call.binding"
    | .version _ => some "work.call.binding"
    | .versionTag _ => some "work.call.binding"
  element <|> binding <|>
    (if work.businessKey.isSome then some "work.call.businessKey"
     else if work.propagateAllInputs || work.propagateAllOutputs then some "work.call.propagateAll"
     else none)

def activity (payload : ActivityPayload) : Option String :=
  let work : Option String :=
    match payload.work with
    | .none => none
    | .manual => none
    | .user task =>
      if task.candidateGroups.any (fun
        | .literal _ => false
        | .expression _ => true) then some "work.user.candidateGroupExpression" else none
    | .receive work => receive work
    | .service _ => none
    | .send _ => some "work.send"
    | .script _ => some "work.script"
    | .rule _ => some "work.rule"
    | .call work => call work
  work <|> envelope payload.work payload.envelope

end Kernel.Admission.Work
