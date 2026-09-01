import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
import BpmnSemantics.SequentialUserTask

/-! # Flow-node occurrence lifecycle rejection conformance

This module owns the executable fail-closed witnesses for anchor multiplicity and unpublishable commands.
-/

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
theorem every_anchor_multiplicity_violation_is_rejected :
    applyFlowNodeOccurrenceDelta? [] duplicateStartDelta = none ∧
      applyFlowNodeOccurrenceDelta? [duplicateStart]
        { started := [duplicateStart], ended := [] } = none ∧
      applyFlowNodeOccurrenceDelta? [duplicateStart] duplicateEndDelta = none ∧
      applyFlowNodeOccurrenceDelta? []
        { started := [], ended := [{ anchor := duplicateStart.anchor, terminal := .completed }] } = none ∧
      applyFlowNodeOccurrenceDelta? [] crossingTransitionDelta = none := by
  decide +kernel

/-- Rejected and closure-bounded commands publish neither a trace nor a lifecycle. -/
theorem every_unpublishable_command_has_no_lifecycle :
    (applyStimulusTraced scenarioClosureLimit SequentialUserTask.program initialState
        (.startProcess ⟨"wrong"⟩ ⟨"Other"⟩ ⟨"Instance"⟩ [])).flowNodeOccurrenceLifecycles = [] ∧
      (applyStimulusTraced 1 SequentialUserTask.program initialState
        SequentialUserTask.startStimulus).flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
