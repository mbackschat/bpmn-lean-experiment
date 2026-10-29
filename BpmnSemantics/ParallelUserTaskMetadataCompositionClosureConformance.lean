module

public import BpmnSemantics.ParallelUserTaskMetadataCompositionFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.ParallelUserTaskMetadataCompositionFixtures
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.SemanticProcess.ActivityDataInput
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
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
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
import all BpmnSemantics.SemanticProcess.InternalLocalControlSelection
import all BpmnSemantics.SemanticProcess.InternalOperationOccurrence
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
import all BpmnSemantics.SemanticProcess.InternalTransitionPublication
import all BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageBoundedTask
import all BpmnSemantics.SemanticProcess.MessageMonitoredTask
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.MonitoredTask
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionRecord
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitCompletion

/-! # Parallel User Task metadata composition closure conformance

Proved metadata-erased control equivalence, existing relation-family reuse, bounded closure, and the exact disjoint-versus-overlapping data-order boundary.
-/

public section

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def eraseWaitMetadata (wait : UserTaskWait) : UserTaskWait :=
  { wait with
    task := { wait.task with metadata := none }
    metadata := none }

def eraseRuntimeMetadata (state : RuntimeState) : RuntimeState :=
  { state with waits := state.waits.map eraseWaitMetadata }

def eraseResultMetadata (result : StimulusResult) : StimulusResult :=
  { result with state := eraseRuntimeMetadata result.state }

def committedOperationKinds (result : TracedStimulusResult) :
    List SemanticOperationKind :=
  result.committedTransitions.filterMap fun
    | .externalStimulus _ => none
    | .internalOperation record => some record.operationKind

def emptyContentFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-content-empty" contentTaskId [])

def emptyRiskFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

def emptyContentThenRisk (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterContent := emptyContentFirst program started
  applyStimulus scenarioClosureLimit program afterContent.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

def emptyRiskThenContent (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterRisk := emptyRiskFirst program started
  applyStimulus scenarioClosureLimit program afterRisk.state
    (completionStimulus "complete-content-empty" contentTaskId [])

def submittedKeysDisjoint
    (left right : List VariableBinding) : Bool :=
  left.all fun leftBinding =>
    right.all fun rightBinding => decide (leftBinding.name ≠ rightBinding.name)

def overlappingContentPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean true }]

def overlappingRiskPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean false }]

def overlappingContentFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

def overlappingRiskFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

def overlappingContentThenRisk : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingContentFirst.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

def overlappingRiskThenContent : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingRiskFirst.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

/-- Erasing metadata commutes with start, either first completion, and both synchronization-to-closure orders. -/
def metadata_erasure_preserves_parallel_control_through_closure : Bool := decide <|
    eraseResultMetadata compositionStarted = erasedStarted ∧
      eraseResultMetadata
          (emptyContentFirst compositionProgram compositionStarted) =
        emptyContentFirst erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyRiskFirst compositionProgram compositionStarted) =
        emptyRiskFirst erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyContentThenRisk compositionProgram compositionStarted) =
        emptyContentThenRisk erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyRiskThenContent compositionProgram compositionStarted) =
        emptyRiskThenContent erasedProgram erasedStarted

/-- The composed start and terminal closure use only the existing initiate, duplicate, await, synchronize, None End, and complete-scope relations. -/
def committed_relation_families_are_the_existing_parallel_account : Bool := decide <|
    committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          initialState startStimulus) =
      [ .initiate, .duplicate, .awaitUserTask, .awaitUserTask ] ∧
      committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          contentFirst.state
          (completionStimulus "complete-risk-traced" riskTaskId riskPatch)) =
      [ .synchronize, .reachNoneEnd, .completeScope ]

/-- Both completion orders reach the same terminal control state independently of their disjoint data proof. -/
def both_completion_orders_reach_same_terminal_control : Bool := decide <|
    contentThenRisk.state.control = .completed instanceId ∧
      riskThenContent.state.control = .completed instanceId ∧
      contentThenRisk.state.control = riskThenContent.state.control ∧
      contentThenRisk.internalStepBoundExceeded = false ∧
      riskThenContent.internalStepBoundExceeded = false

/-- Final Process data agrees for the exact catalog patches only under their explicit disjoint-key premise. -/
theorem disjoint_catalog_patches_reach_equal_final_process_data
    (_disjoint : submittedKeysDisjoint contentPatch riskPatch = true) :
    contentThenRisk.state.variables.process =
      riskThenContent.state.variables.process := by
  decide +kernel

/-- Overlapping submitted keys retain accepted command order, so no arbitrary commutativity claim is available. -/
def overlapping_patches_have_ordered_unequal_final_data : Bool := decide <|
    submittedKeysDisjoint overlappingContentPatch overlappingRiskPatch = false ∧
      overlappingContentThenRisk.state.variables.process ≠
        overlappingRiskThenContent.state.variables.process

/-- The start and post-completion closure thresholds are exactly those of the erased parallel account. -/
def closure_bounds_are_unchanged_by_metadata : Bool := decide <|
    (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 3 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 4 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded = true ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded = false ∧
      (applyStimulus 2 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = true ∧
      (applyStimulus 3 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = false

/-- Every executable check of this module, named for the driver's failure report. -/
def parallelUserTaskMetadataCompositionClosureConformanceChecks : List (String × Bool) := [
  ("metadata_erasure_preserves_parallel_control_through_closure", metadata_erasure_preserves_parallel_control_through_closure),
  ("committed_relation_families_are_the_existing_parallel_account", committed_relation_families_are_the_existing_parallel_account),
  ("both_completion_orders_reach_same_terminal_control", both_completion_orders_reach_same_terminal_control),
  ("overlapping_patches_have_ordered_unequal_final_data", overlapping_patches_have_ordered_unequal_final_data),
  ("closure_bounds_are_unchanged_by_metadata", closure_bounds_are_unchanged_by_metadata)
]

end BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
