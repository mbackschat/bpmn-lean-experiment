import BpmnSemantics.SemanticProcess.InternalRegionalFootprint
import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionDelta
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.ControlPositionProjection

/-! Regional publication retains predecessor positions, open anchors, and instantaneous identities.
Command and transition numbering are assigned only when the retained template is instantiated.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def regionalCancelsOpenOccurrence (region : InternalOccurrenceRegion) (retainRoot : Bool)
    (entry : OpenSemanticFlowNodeOccurrence) : Bool :=
  match entry.anchor with
  | .scope id => !(retainRoot && id == region.root) &&
      (region.contains id || region.contains entry.owner)
  | .wait _ | .callActivity _ | .compensationTrigger _ | .compensationHandler _ =>
      region.contains entry.owner
  | .transition .. => false

def regionalCancellationEnds (region : InternalOccurrenceRegion) (retainRoot : Bool)
    (current : List OpenSemanticFlowNodeOccurrence) : List UnnumberedFlowNodeOccurrenceEnd :=
  (current.filter (regionalCancelsOpenOccurrence region retainRoot)).map fun entry =>
    { anchor := entry.anchor, terminal := .cancelled }

theorem regionalCancellation_retains_selected_root (region : InternalOccurrenceRegion)
    (entry : OpenSemanticFlowNodeOccurrence) (root : entry.anchor = .scope region.root) :
    regionalCancellationEnds region true [entry] = [] := by
  simp [regionalCancellationEnds, regionalCancelsOpenOccurrence, root]

theorem regionalCancellation_preserves_outside_wait (region : InternalOccurrenceRegion)
    (entry : OpenSemanticFlowNodeOccurrence) (id : OccurrenceId)
    (wait : entry.anchor = .wait id) (outside : region.contains entry.owner = false) :
    regionalCancellationEnds region false [entry] = [] := by
  simp [regionalCancellationEnds, regionalCancelsOpenOccurrence, wait, outside]

theorem regionalCancellation_removes_selected_root (region : InternalOccurrenceRegion)
    (entry : OpenSemanticFlowNodeOccurrence) (root : entry.anchor = .scope region.root)
    (inside : region.contains region.root = true) :
    regionalCancellationEnds region false [entry] = [{ anchor := entry.anchor, terminal := .cancelled }] := by
  simp [regionalCancellationEnds, regionalCancelsOpenOccurrence, root, inside]

theorem regionalCancellation_cancels_owned_wait (region : InternalOccurrenceRegion)
    (retainRoot : Bool) (entry : OpenSemanticFlowNodeOccurrence) (id : OccurrenceId)
    (wait : entry.anchor = .wait id) (inside : region.contains entry.owner = true) :
    regionalCancellationEnds region retainRoot [entry] = [{ anchor := entry.anchor, terminal := .cancelled }] := by
  simp [regionalCancellationEnds, regionalCancelsOpenOccurrence, wait, inside]

structure InternalRegionalPublicationTemplate where
  operation : SemanticOperation
  owner : ScopeOccurrenceId
  logicalTimeMs : Nat
  positionDelta : PublicControlPositionDelta
  instantaneous : List FlowNodeIdentity
  retainedEnds : List UnnumberedFlowNodeOccurrenceEnd
  deriving Repr, DecidableEq

def InternalRegionalPublicationTemplate.lifecycle (template : InternalRegionalPublicationTemplate)
    (commandId : SemanticId) (transitionIndex : Nat) : UnnumberedFlowNodeOccurrenceDelta :=
  instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex
    template.instantaneous template.retainedEnds

def regionalOutputPosition? (program : Program) (place : ControlPlaceId) (owner : ScopeOccurrenceId) :
    Option PublicControlTokenPosition := do
  let origin ← internalLocalControlPlaceOrigin? program place owner
  pure { sequenceFlowId := origin.elementId, owner, multiplicity := 1 }

def regionalPositionDelta? (program : Program) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (positions : PublicControlPosition) : Option PublicControlPositionDelta :=
  let removedTokens := positions.controlTokens.filter fun token => region.contains token.owner
  let removedScopes := positions.scopes.filter fun scope => region.contains scope.id
  match selected.operation, selected.kind with
  | .returnProcess _ _ _ _ output, .returning record => do
      let produced ← regionalOutputPosition? program output record.caller
      pure { consumedTokens := removedTokens, producedTokens := [produced]
             enteredScopes := [], exitedScopes := removedScopes }
  | .completeScope _ _ _ output, .completing _ =>
      match selected.root.parent, output with
      | none, none => some
          { consumedTokens := [], producedTokens := [], enteredScopes := [], exitedScopes := positions.scopes }
      | some parent, some output => do
          let produced ← regionalOutputPosition? program output parent
          pure { consumedTokens := [], producedTokens := [produced], enteredScopes := []
                 exitedScopes := positions.scopes.filter fun scope => scope.id == selected.root.id }
      | _, _ => none
  | .throwError _ _ _ _ handler, .interrupting parent => do
      let produced ← regionalOutputPosition? program handler.output parent
      pure { consumedTokens := removedTokens, producedTokens := [produced]
             enteredScopes := [], exitedScopes := removedScopes }
  | .terminateScope .., .terminating => some
      { consumedTokens := removedTokens, producedTokens := [], enteredScopes := []
        exitedScopes := removedScopes.filter fun scope => scope.id != selected.root.id }
  | _, _ => none

def regionalLifecycleTemplate? (program : Program) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) (current : List OpenSemanticFlowNodeOccurrence) :
    Option (List FlowNodeIdentity × List UnnumberedFlowNodeOccurrenceEnd) :=
  let owner := selected.root.id
  match selected.operation, selected.kind with
  | .returnProcess .., .returning record =>
      if (current.filter fun entry => entry.anchor == .callActivity record.id).length = 1 then
        some ([], [{ anchor := .callActivity record.id, terminal := .completed }])
      else none
  | .completeScope .., .completing _ =>
      match selected.root.parent with
      | none => some ([], [])
      | some _ =>
          if (current.filter fun entry => entry.anchor == .scope owner).length = 1 then
            some ([], [{ anchor := .scope owner, terminal := .completed }])
          else none
  | .throwError _ origin _ _ handler, .interrupting parent => do
      let errorIdentity ← candidateOperationFlowNodeIdentity? program selected.operation owner owner origin.elementId
      let boundaryIdentity ← candidateOperationFlowNodeIdentity? program selected.operation owner parent
        handler.origin.boundaryEventId
      pure ([errorIdentity, boundaryIdentity], regionalCancellationEnds region false current)
  | .terminateScope _ origin _ _, .terminating => do
      let ending ← candidateOperationFlowNodeIdentity? program selected.operation owner owner origin.elementId
      pure ([ending], regionalCancellationEnds region true current)
  | _, _ => none

/-- Every dependency and publication component is selected before executing the operation. -/
def regionalPublicationTemplate? (program : Program) (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion) :
    Option InternalRegionalPublicationTemplate := do
  let hosting ← runningInstance? state
  let positions ← projectControlPosition? program hosting state
  let current ← projectOpenFlowNodeOccurrences? program state
  let delta ← regionalPositionDelta? program selected region positions
  let lifecycle ← regionalLifecycleTemplate? program selected region current
  pure { operation := selected.operation, owner := selected.root.id, logicalTimeMs := state.logicalTimeMs
         positionDelta := delta, instantaneous := lifecycle.1, retainedEnds := lifecycle.2 }

theorem regionalPublicationTemplate_facts (program : Program) (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (template : InternalRegionalPublicationTemplate)
    (found : regionalPublicationTemplate? program state selected region = some template) :
    ∃ hosting positions current delta identities ends,
      runningInstance? state = some hosting ∧
      projectControlPosition? program hosting state = some positions ∧
      projectOpenFlowNodeOccurrences? program state = some current ∧
      regionalPositionDelta? program selected region positions = some delta ∧
      regionalLifecycleTemplate? program selected region current = some (identities, ends) ∧
      template =
        { operation := selected.operation, owner := selected.root.id
          logicalTimeMs := state.logicalTimeMs, positionDelta := delta
          instantaneous := identities, retainedEnds := ends } := by
  unfold regionalPublicationTemplate? at found
  obtain ⟨hosting, running, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨positions, projected, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨current, opened, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨delta, positioned, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨⟨identities, ends⟩, lifecycle, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  exact ⟨hosting, positions, current, delta, identities, ends, running, projected,
    opened, positioned, lifecycle, rfl⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
