import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcessJson.Publication
import BpmnSemantics.CommittedExecutionPublicationConformance
import BpmnSemantics.RuntimeStateWellFormedConformance

/-! One-way JSON emitter for the exact parallel committed-execution publication parity witness. -/

namespace BpmnSemantics.CommittedExecutionPublicationJsonMain

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson.Publication

def instanceId : SemanticId := ⟨"Instance_1"⟩

def startStimulus : Stimulus :=
  .startProcess ⟨"start-process"⟩ ⟨parallelProgram.processId.value⟩ instanceId []

def rejectionCases : List (String × Program × SemanticId × RuntimeState) :=
  [ ("unassociatedParentlessRoot", sequentialProgram,
      CommittedExecutionPublicationConformance.instanceId,
      CommittedExecutionPublicationConformance.unassociatedParentlessRootState)
  , ("completedWithLivePositions", sequentialProgram,
      CommittedExecutionPublicationConformance.instanceId,
      CommittedExecutionPublicationConformance.completedWithLivePositionsState)
  , ("calledRootProcessDrift", CallActivityConformance.program,
      CallActivityConformance.callerInstanceId,
      CommittedExecutionPublicationConformance.calledRootProcessDriftState) ]

/-- The malformed states whose refusal both targets must agree on, by label.

They are the invariant's own negatives rather than the projection's, and they are shared with the
Lean fixtures that decide the same states in the kernel, so a disagreement between the two languages
and a disagreement between the two Lean lanes cannot both be satisfied by one wrong state. -/
def wellFormednessCases : List (String × Program × SemanticId × RuntimeState) :=
  [ ("strandedWaitOwner", RuntimeStateWellFormedConformance.program,
      RuntimeStateWellFormedConformance.instanceId,
      RuntimeStateWellFormedConformance.strandedTimerOwnerState)
  , ("duplicateWaitIdentity", RuntimeStateWellFormedConformance.program,
      RuntimeStateWellFormedConformance.instanceId,
      RuntimeStateWellFormedConformance.duplicateTimerKeyState)
  , ("undeclaredWaitIdentity", RuntimeStateWellFormedConformance.program,
      RuntimeStateWellFormedConformance.instanceId,
      RuntimeStateWellFormedConformance.undeclaredTimerElementState)
  , ("unorderedCollection", RuntimeStateWellFormedConformance.program,
      RuntimeStateWellFormedConformance.instanceId,
      RuntimeStateWellFormedConformance.unorderedActivationsState)
  , ("notStartedWithWork", RuntimeStateWellFormedConformance.program,
      RuntimeStateWellFormedConformance.instanceId,
      RuntimeStateWellFormedConformance.notStartedWithPendingInitiationState) ]

def emit : IO Unit :=
  match committedExecutionPublicationParityJson?
      scenarioClosureLimit parallelProgram instanceId initialState startStimulus rejectionCases
      wellFormednessCases with
  | none => throw (IO.userError "parallel committed publication is unavailable")
  | some publication => IO.println publication.compress

end BpmnSemantics.CommittedExecutionPublicationJsonMain

def main : IO Unit :=
  BpmnSemantics.CommittedExecutionPublicationJsonMain.emit
