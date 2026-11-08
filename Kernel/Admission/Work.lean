module

public import Kernel.IL.Types

/-! # Admission of Activities. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Work

def envelope (envelope : Envelope) : Option String :=
  if !envelope.inputs.isEmpty then some "activity.inputMappings"
  else if !envelope.outputs.isEmpty then some "activity.outputMappings"
  else if !envelope.boundaries.isEmpty then some "activity.boundary"
  else if envelope.multiInstance.isSome then some "activity.multiInstance"
  else if envelope.compensationHandler.isSome then some "activity.compensationHandler"
  else none

def activity (payload : ActivityPayload) : Option String :=
  let work : Option String :=
    match payload.work with
    | .none => none
    | .manual => none
    | .user _ => none
    | .receive _ => some "work.receive"
    | .service _ => some "work.service"
    | .send _ => some "work.send"
    | .script _ => some "work.script"
    | .rule _ => some "work.rule"
    | .call _ => some "work.call"
  work <|> envelope payload.envelope

end Kernel.Admission.Work
