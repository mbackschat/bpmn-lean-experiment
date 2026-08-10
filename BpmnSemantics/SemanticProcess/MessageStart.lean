import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Message Start Event transition

This module owns the profile-independent Message Start initiation relation and executable state transformation. External trigger admission and profile cardinality remain separate owners.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Profile-independent structural contract for a canonical, nonempty Message initiation fan-out. -/
def messageInitiationOperationWellFormed (places : List ControlPlace)
    (id : OperationId) (origin : BpmnElementOrigin)
    (channel : MessageChannel) (outputs : List ControlPlaceId) : Bool :=
  nonempty id.value &&
    nonempty origin.elementId.value &&
    (match channel with
      | .operationMessage .. => channel.identifiersNonempty
      | .directMessage .. => false) &&
    !outputs.isEmpty &&
    strictlySortedStrings (outputs.map fun output => output.value) &&
    outputs.all fun output => places.any fun place => decide (place.id = output)

/-- Produce one root-owned token on every admitted outgoing place and consume the pending initiation marker. -/
def initiateMessageState? (state : RuntimeState)
    (outputs : List ControlPlaceId) : Option RuntimeState := do
  let owner ← rootScopeOccurrence? state
  if state.initiationPending then
    some
      { state with
        initiationPending := false
        tokens := addTokens state.tokens outputs owner }
  else none

/-- Declarative Message Start initiation, separated from the executable dispatcher. -/
inductive MessageInitiationStep :
    RuntimeState → List ControlPlaceId → RuntimeState → Prop where
  | apply (before after : RuntimeState) (outputs : List ControlPlaceId)
      (transition : initiateMessageState? before outputs = some after) :
      MessageInitiationStep before outputs after

/-- Every executable Message Start initiation belongs to the declarative relation. -/
theorem initiateMessageState_sound (before after : RuntimeState)
    (outputs : List ControlPlaceId)
    (result : initiateMessageState? before outputs = some after) :
    MessageInitiationStep before outputs after := by
  exact .apply before after outputs result

/-- From a fresh root control state, Message initiation produces exactly one root-owned token for each listed output. -/
theorem message_initiation_from_fresh_root_produces_each_output
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (outputs : List ControlPlaceId)
    (root : rootScopeOccurrence? state = some owner)
    (pending : state.initiationPending = true)
    (empty : state.tokens = []) :
    initiateMessageState? state outputs =
      some
        { state with
          initiationPending := false
          tokens := outputs.map fun output => { placeId := output, owner } } := by
  simp [initiateMessageState?, root, pending, empty, addTokens, addToken]

/-- One-output Message initiation is the exact singleton specialization of the generic fan-out. -/
theorem message_initiation_one_output_corollary
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (output : ControlPlaceId)
    (root : rootScopeOccurrence? state = some owner)
    (pending : state.initiationPending = true)
    (empty : state.tokens = []) :
    initiateMessageState? state [output] =
      some
        { state with
          initiationPending := false
          tokens := [{ placeId := output, owner }] } := by
  exact message_initiation_from_fresh_root_produces_each_output
    state owner [output] root pending empty

/-- Identity correspondence between two fresh one-output starts whose BPMN and Process identifiers may differ. -/
structure StartControlIdentityRenaming where
  leftInstanceId : SemanticId
  rightInstanceId : SemanticId
  leftRootScopeId : DefinitionScopeId
  rightRootScopeId : DefinitionScopeId
  leftOutput : ControlPlaceId
  rightOutput : ControlPlaceId

/-- Two post-initiation states have the same one-output control shape after applying an explicit identity correspondence. -/
def OneOutputPostInitiationControlRelated
    (correspondence : StartControlIdentityRenaming)
    (left right : RuntimeState) : Prop :=
  left.control = .running correspondence.leftInstanceId ∧
    right.control = .running correspondence.rightInstanceId ∧
    left.initiationPending = false ∧
    right.initiationPending = false ∧
    left.scopeOccurrences =
      [{ id :=
          { processInstanceId := correspondence.leftInstanceId
            definitionScopeId := correspondence.leftRootScopeId
            activation := 1 }
         parent := none }] ∧
    right.scopeOccurrences =
      [{ id :=
          { processInstanceId := correspondence.rightInstanceId
            definitionScopeId := correspondence.rightRootScopeId
            activation := 1 }
         parent := none }] ∧
    left.tokens =
      [{ placeId := correspondence.leftOutput
         owner :=
          { processInstanceId := correspondence.leftInstanceId
            definitionScopeId := correspondence.leftRootScopeId
            activation := 1 } }] ∧
    right.tokens =
      [{ placeId := correspondence.rightOutput
         owner :=
          { processInstanceId := correspondence.rightInstanceId
            definitionScopeId := correspondence.rightRootScopeId
            activation := 1 } }] ∧
    left.waits.isEmpty ∧ right.waits.isEmpty ∧
    left.messageWaits.isEmpty ∧ right.messageWaits.isEmpty ∧
    left.timerWaits.isEmpty ∧ right.timerWaits.isEmpty ∧
    left.effectWaits.isEmpty ∧ right.effectWaits.isEmpty

end BpmnSemantics.SemanticProcess
