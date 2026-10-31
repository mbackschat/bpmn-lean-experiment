module

public import BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
public import BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
import all BpmnSemantics.SemanticProcess.ActivityDataEndpointRuntime
import all BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import all BpmnSemantics.SemanticProcess.ActivityDataOutput
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BoundedTask
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceEffectProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalCommutationRegion
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalRegionalCompletionSelection
import all BpmnSemantics.SemanticProcess.InternalRegionalFootprint
import all BpmnSemantics.SemanticProcess.InternalRegionalLocalDataRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnerRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
import all BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import all BpmnSemantics.SemanticProcess.InternalRegionalPublication
import all BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalSelection
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageBoundedTask
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.MessageMonitoredTask
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.ProcessInterfaceRuntime
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.ActivityDataContract
/-! # Composed Activity data-input/output conformance fixtures

Shared exact-source and runtime fixtures for admission and lifetime witnesses. Literal fixtures are
kernel-locked to their original constructions so consumers do not repeat the lifetime reductions.
-/

public section

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
