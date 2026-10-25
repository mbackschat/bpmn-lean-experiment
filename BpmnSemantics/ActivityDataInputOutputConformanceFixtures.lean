module

public import BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
/-! # Composed Activity data-input/output conformance fixtures

Shared exact-source and runtime fixtures for admission and lifetime witnesses. Literal fixtures are
kernel-locked to their original constructions so consumers do not repeat the lifetime reductions.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
theorem claimProgram_is_lowered_claimCheckedProcess :
    lowerCheckedProcess claimCheckedProcess = claimProgram := by
  decide +kernel

theorem claimProgram_profile :
    claimProgram.identity.semanticProfile = activityDataInputOutputUserTaskProfileId := by
  decide +kernel

theorem claimProgram_capabilities : programProfileCapabilitiesValid claimProgram = true := by
  decide +kernel

theorem seededReady_is_seeded_start :
    (let ready := (runStart startWithoutSummary).state
     { ready with variables :=
         { ready.variables with process := { bindings := [summary, unrelated] } } }) =
      seededReady := by
  decide +kernel

theorem active_is_the_admitted_activation :
    activateDataInputOutputUserTask? (programPropertyPathValuePolicy claimProgram) seededReady
      ⟨"place:Flow_ClaimReceived_Assess"⟩ ⟨"place:Flow_AssessClaim_Recorded"⟩
      ⟨"UserTask_AssessClaim"⟩ (some "Assess claim") claimDirectInput = some active := by
  decide +kernel

theorem approved_is_completed_claim :
    applyStimulus scenarioClosureLimit claimProgram active
      (completeClaim "complete-claim" [decision (.string "approve")]) = approved := by
  decide +kernel

end BpmnSemantics.ActivityDataInputOutputConformance
