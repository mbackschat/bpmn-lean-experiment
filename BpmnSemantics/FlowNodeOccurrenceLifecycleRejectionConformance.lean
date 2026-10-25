module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
public import BpmnSemantics.SequentialUserTaskFixtures
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.CallActivity

/-! # Flow-node occurrence lifecycle rejection conformance

This module owns the executable fail-closed witnesses for anchor multiplicity and unpublishable commands.
-/

@[expose] public section

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

def duplicateOwner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance:duplicates"⟩
    definitionScopeId := ⟨"scope:duplicates"⟩
    activation := 1 }

def duplicateStart : UnnumberedFlowNodeOccurrenceStart :=
  { anchor := .wait
      { processInstanceId := duplicateOwner.processInstanceId
        elementId := ⟨"Task_Duplicate"⟩
        activation := 1 }
    processId := ⟨"Process_Duplicates"⟩
    elementId := ⟨"Task_Duplicate"⟩
    owner := duplicateOwner }

def duplicateStartDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [duplicateStart, duplicateStart], ended := [] }

def duplicateEndDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := []
    ended :=
      [ { anchor := duplicateStart.anchor, terminal := .completed }
      , { anchor := duplicateStart.anchor, terminal := .cancelled } ] }

def crossingTransitionDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [{ duplicateStart with anchor := .transition ⟨"command:cross"⟩ 0 0 }]
    ended := [] }

/-- Freshness, reuse, duplicate terminal, unknown terminal, and cross-delta transition anchors all fail closed. -/
def every_anchor_multiplicity_violation_is_rejected : Bool := decide <|
    applyFlowNodeOccurrenceDelta? [] duplicateStartDelta = none ∧
      applyFlowNodeOccurrenceDelta? [duplicateStart]
        { started := [duplicateStart], ended := [] } = none ∧
      applyFlowNodeOccurrenceDelta? [duplicateStart] duplicateEndDelta = none ∧
      applyFlowNodeOccurrenceDelta? []
        { started := [], ended := [{ anchor := duplicateStart.anchor, terminal := .completed }] } = none ∧
      applyFlowNodeOccurrenceDelta? [] crossingTransitionDelta = none

/-- Rejected and closure-bounded commands publish neither a trace nor a lifecycle. -/
def every_unpublishable_command_has_no_lifecycle : Bool := decide <|
    (applyStimulusTraced scenarioClosureLimit SequentialUserTask.program initialState
        (.startProcess ⟨"wrong"⟩ ⟨"Other"⟩ ⟨"Instance"⟩ [])).flowNodeOccurrenceLifecycles = [] ∧
      (applyStimulusTraced 1 SequentialUserTask.program initialState
        SequentialUserTask.startStimulus).flowNodeOccurrenceLifecycles = []

/-- Every executable check of this module, named for the driver's failure report. -/
def flowNodeOccurrenceLifecycleRejectionConformanceChecks : List (String × Bool) := [
  ("every_anchor_multiplicity_violation_is_rejected", every_anchor_multiplicity_violation_is_rejected),
  ("every_unpublishable_command_has_no_lifecycle", every_unpublishable_command_has_no_lifecycle)
]

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
