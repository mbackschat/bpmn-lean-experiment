module

public import BpmnSemantics.InternalScopeCreationFrameConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
public import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
public import BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
/-! # Independent scope-creation preparation witnesses

The [scope-creation account](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite)
requires structurally valid Programs and valid predecessors for independent creator pairs. These
constructed fork frontiers exercise actual preparations without claiming source admission,
source reachability of retained counters, or production batching. The existing Call profile supplies
only its acyclic graph policy here; its separate profile cardinalities exclude these constructed pairs.
-/

@[expose] public section

namespace BpmnSemantics.InternalScopeCreationFrameConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
theorem child_child_premises_hold_jointly :
    programWellFormed (program .child .child) = true ∧
    runtimeStateWellFormed (program .child .child) owner.processInstanceId before = true ∧
    pairPreconditions (program .child .child) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem child_call_premises_hold_jointly :
    programWellFormed (program .child .called) = true ∧
    runtimeStateWellFormed (program .child .called) owner.processInstanceId before = true ∧
    pairPreconditions (program .child .called) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem call_call_premises_hold_jointly :
    programWellFormed (program .called .called) = true ∧
    runtimeStateWellFormed (program .called .called) owner.processInstanceId before = true ∧
    pairPreconditions (program .called .called) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem child_child_complete_preparations_survive_both_orders :
    pairFrames (program .child .child) = true := by decide +kernel

theorem repeated_child_input_retains_one_token_and_publishes_one_consumption :
    runtimeStateWellFormed (program .child .child) owner.processInstanceId repeatedInput = true ∧
    positionPublicationMatches (program .child .child) repeatedInput ⟨"C_Left"⟩ = true ∧
    (match preparation (program .child .child) repeatedInput ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         ((prepared.selection.apply repeatedInput).tokens.filter fun token =>
           token.placeId == flowControlPlaceId ⟨"f02"⟩ && token.owner == owner).length == 1 &&
         prepared.publicationTemplate.positionDelta.consumedTokens ==
           [{ sequenceFlowId := ⟨"f02"⟩, owner, multiplicity := 1 }]) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem call_creation_still_refuses_repeated_input :
    preparation (program .called .called) repeatedInput ⟨"C_Left"⟩ = none := by
  decide +kernel

end BpmnSemantics.InternalScopeCreationFrameConformance
