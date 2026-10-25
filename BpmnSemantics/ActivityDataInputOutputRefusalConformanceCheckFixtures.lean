module

public import BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions and executable checks of [`ActivityDataInputOutputRefusalConformance`](ActivityDataInputOutputRefusalConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.ActivityDataInputOutputConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

def withExtraComposedDeclarations (count : Nat) : Program :=
  { claimProgram with
    operations := claimProgram.operations ++
      (List.replicate count (claimProgram.operations.filter fun
        | .awaitDataInputOutputUserTask .. => true
        | _ => false)).flatten }

def copiedScope : ActivityVariableScope :=
  { owner := .activityOccurrence claimActivityOwner
    bindings := [{ name := claimDirectInput.targetDataInputId, value := summary.value }] }

def withLocalScopes (scopes : List ActivityVariableScope) : RuntimeState :=
  { active with variables := { active.variables with activities := scopes } }

def foreignClaimInstanceId : SemanticId := ⟨"ClaimAssessmentInstance_foreign"⟩

def wrongClaimScopeOwner : ScopeOccurrenceId :=
  { processInstanceId := claimInstanceId
    definitionScopeId := ⟨"scope:wrong"⟩
    activation := 1 }

def wrongOutputActive : RuntimeState :=
  { active with
    waits := active.waits.map fun wait =>
      { wait with output := ⟨"place:Flow_ClaimReceived_Assess"⟩ } }

def wrongStaticScopeActive : RuntimeState :=
  { active with
    waits := active.waits.map fun wait => { wait with owner := wrongClaimScopeOwner }
    activityOccurrences := active.activityOccurrences.map fun record =>
      { record with owner := wrongClaimScopeOwner } }

def wrongWaitProcessActive : RuntimeState :=
  { active with
    waits := active.waits.map fun wait => { wait with processInstanceId := foreignClaimInstanceId }
    activityOccurrences := active.activityOccurrences.map fun record =>
      { record with
        body := .userTask
          { processInstanceId := foreignClaimInstanceId
            elementId := ⟨"UserTask_AssessClaim"⟩
            activation := 1 } } }

def wrongRecordProcessActive : RuntimeState :=
  { active with
    activityOccurrences := active.activityOccurrences.map fun record =>
      { record with processInstanceId := foreignClaimInstanceId }
    variables :=
      { active.variables with
        activities :=
          [{ copiedScope with
             owner := .activityOccurrence
               { claimActivityOwner with processInstanceId := foreignClaimInstanceId } }] } }

/-- The live wait must route to the output declared by its exact composed operation. -/
def wrongLiveWaitOutputRefusesBeforeMutation : Bool := decide <|
    completeDataInputOutputUserTask? claimProgram wrongOutputActive claimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none

/-- The wait and record owner cannot substitute a static scope outside the declaring operation. -/
def wrongLiveWaitStaticScopeRefusesBeforeMutation : Bool := decide <|
    completeDataInputOutputUserTask? claimProgram wrongStaticScopeActive claimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none

/-- A wait occurrence cannot claim a process distinct from its live scope owner. -/
def mismatchedLiveWaitProcessOwnerRefusesBeforeMutation : Bool := decide <|
    completeDataInputOutputUserTask? claimProgram wrongWaitProcessActive foreignClaimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none

/-- An Activity record cannot claim a process distinct from its live scope owner. -/
def mismatchedActivityRecordProcessOwnerRefusesBeforeMutation : Bool := decide <|
    completeDataInputOutputUserTask? claimProgram wrongRecordProcessActive claimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none

/-- Every executable check of this module, named for the driver's failure report. -/
def activityDataInputOutputRefusalConformanceChecks : List (String × Bool) := [
  ("wrongLiveWaitOutputRefusesBeforeMutation", wrongLiveWaitOutputRefusesBeforeMutation),
  ("wrongLiveWaitStaticScopeRefusesBeforeMutation", wrongLiveWaitStaticScopeRefusesBeforeMutation),
  ("mismatchedLiveWaitProcessOwnerRefusesBeforeMutation", mismatchedLiveWaitProcessOwnerRefusesBeforeMutation),
  ("mismatchedActivityRecordProcessOwnerRefusesBeforeMutation", mismatchedActivityRecordProcessOwnerRefusesBeforeMutation)
]

end BpmnSemantics.ActivityDataInputOutputConformance
