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

def envelope (work : Work) (envelope : Envelope) : Option String :=
  if !envelope.inputs.isEmpty && !mapsData work then some "activity.inputMappings"
  else if !envelope.outputs.isEmpty && !mapsData work then some "activity.outputMappings"
  else if envelope.multiInstance.isSome then some "activity.multiInstance"
  else if envelope.compensationHandler.isSome then some "activity.compensationHandler"
  else none

def receive (work : ReceiveWork) : Option String :=
  if !work.message.correlation.isEmpty then some "work.receive.correlation"
  else
    match work.message.name with
    | none => none
    | some (.literal _) => none
    | some (.expression _) => some "work.receive.messageExpression"

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
    | .call _ => some "work.call"
  work <|> envelope payload.work payload.envelope

end Kernel.Admission.Work
