import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcessJson.Publication

/-! One-way JSON emitter for the exact parallel committed-execution publication parity witness. -/

namespace BpmnSemantics.CommittedExecutionPublicationJsonMain

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson.Publication

def instanceId : SemanticId := ⟨"Instance_1"⟩

def startStimulus : Stimulus :=
  .startProcess ⟨"start-process"⟩ ⟨parallelProgram.processId.value⟩ instanceId []

def emit : IO Unit :=
  match committedExecutionPublicationJson?
      scenarioClosureLimit parallelProgram instanceId initialState startStimulus with
  | none => throw (IO.userError "parallel committed publication is unavailable")
  | some publication => IO.println publication.compress

end BpmnSemantics.CommittedExecutionPublicationJsonMain

def main : IO Unit :=
  BpmnSemantics.CommittedExecutionPublicationJsonMain.emit
