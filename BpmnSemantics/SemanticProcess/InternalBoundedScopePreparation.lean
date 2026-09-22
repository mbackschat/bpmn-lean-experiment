import BpmnSemantics.SemanticProcess.InternalBoundedScopeSelection
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalRegionalDependencies

/-! Complete bounded Sub-Process preparations combine the existing child-entry footprint with
the joined Activity and parent-owned Timer under the [complete-family account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#complete-operation-family-census).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure PreparedInternalBoundedScope where
  selection : InternalBoundedScopeSelection
  runtimeInstanceId : SemanticId
  footprint : InternalRegionalStateFootprint
  publicationTemplate : InternalScopeCreationPublicationTemplate
  deriving Repr, DecidableEq

def boundedScopeStateFootprint (selected : InternalBoundedScopeSelection)
    (instanceId : SemanticId) (ownerRecord : RuntimeScopeOccurrence) : InternalRegionalStateFootprint :=
  let child := liftRegionalStateFootprint selected.creation.owner
    (internalScopeCreationStateFootprint selected.creation instanceId ownerRecord)
  let joint : List InternalRegionalStateAtom :=
    [.ordinary (.activation .timer selected.timer.elementId),
     .ordinary (.activation .activity selected.record.activityElementId),
     .owned (.wait .timer (timerWaitOccurrence selected.timer)) selected.creation.owner,
     .owned (.openWaitAnchor (timerWaitOccurrence selected.timer)) selected.creation.owner,
     .activityAssociation selected.record]
  { reads := canonicalRegionalStateAtoms (child.reads ++ joint)
    writes := canonicalRegionalStateAtoms (child.writes ++ joint) }

def makeInternalBoundedScopePreparation (state : RuntimeState)
    (selected : InternalBoundedScopeSelection) (instanceId : SemanticId)
    (ownerRecord : RuntimeScopeOccurrence) (start : UnnumberedFlowNodeOccurrenceStart)
    (delta : PublicControlPositionDelta) : PreparedInternalBoundedScope :=
  { selection := selected, runtimeInstanceId := instanceId
    footprint := boundedScopeStateFootprint selected instanceId ownerRecord
    publicationTemplate :=
      { operation := selected.creation.operation, logicalTimeMs := state.logicalTimeMs
        positionDelta := delta, lifecycle := { started := [start], ended := [] } } }

def boundedScopeJointResourcesAvailable (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (selected : InternalBoundedScopeSelection) : Bool :=
  exactProgramSelection program contract.operation selected.creation.owner &&
    (userTaskWaitDeclarers program ⟨contract.origin.elementId.value⟩).isEmpty &&
    uniqueFamilyDeclarer? program contract.operation .timer contract.timer.elementId &&
    openWaitAnchorAbsent state (timerWaitOccurrence selected.timer) &&
    !(state.activityOccurrences.any (regionalActivityAssociationsConflict · selected.record))

/-- The Timer declaration must belong to the selected parent, matching the semantic core's
complete preparation check rather than trusting operation identity alone. -/
theorem boundedScopeJointResourcesAvailable_selected (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (selected : InternalBoundedScopeSelection)
    (available : boundedScopeJointResourcesAvailable program state contract selected = true) :
    exactProgramSelection program contract.operation selected.creation.owner = true := by
  simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at available
  exact available.1.1.1.1

/-- The owner-approved ambiguity check of 2026-09-22 excludes User Task declarations from this
Activity element; immutable Program facts introduce no additional RuntimeState footprint. -/
theorem boundedScopeJointResourcesAvailable_no_task_declarer (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (selected : InternalBoundedScopeSelection)
    (available : boundedScopeJointResourcesAvailable program state contract selected = true) :
    userTaskWaitDeclarers program ⟨contract.origin.elementId.value⟩ = [] := by
  simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at available
  exact List.isEmpty_iff.mp available.1.1.1.2

def prepareInternalBoundedScope? (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) : Option PreparedInternalBoundedScope := do
  let selected ← selectInternalBoundedScope? state contract
  let instanceId ← runningInstance? state
  if program.compensationEventSubProcessSnapshots ≠ none then none
  else if program.operations.filter (fun candidate => decide (candidate.id = contract.operationId)) ≠
      [contract.operation] then none
  else
    let ownerRecord ← match state.scopeOccurrences.filter fun candidate =>
        decide (candidate.id = selected.creation.owner) with
      | [record] => some record
      | _ => none
    let definition ← definitionScope? program selected.creation.created.id.definitionScopeId
    if !internalScopeCreationPredecessorChecks program state contract.entryOperation
        selected.creation contract.origin definition ||
        !boundedScopeJointResourcesAvailable program state contract selected then none
    else
      let start ← candidateScopeStart? program contract.operation selected.creation.owner selected.creation.created
      let delta ← internalScopeCreationPositionDelta? program selected.creation
      some (makeInternalBoundedScopePreparation state selected instanceId ownerRecord start delta)

def applyPreparedInternalBoundedScope? (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope) : Option RuntimeState :=
  if prepareInternalBoundedScope? program state contract = some prepared then
    some (prepared.selection.apply state)
  else none

theorem prepareInternalBoundedScope_facts (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    ∃ selected instanceId ownerRecord definition start delta,
      selectInternalBoundedScope? state contract = some selected ∧
      runningInstance? state = some instanceId ∧
      program.compensationEventSubProcessSnapshots = none ∧
      program.operations.filter (fun candidate => decide (candidate.id = contract.operationId)) =
        [contract.operation] ∧
      state.scopeOccurrences.filter (fun candidate => decide (candidate.id = selected.creation.owner)) =
        [ownerRecord] ∧
      definitionScope? program selected.creation.created.id.definitionScopeId = some definition ∧
      internalScopeCreationPredecessorChecks program state contract.entryOperation
        selected.creation contract.origin definition = true ∧
      boundedScopeJointResourcesAvailable program state contract selected = true ∧
      candidateScopeStart? program contract.operation selected.creation.owner selected.creation.created = some start ∧
      internalScopeCreationPositionDelta? program selected.creation = some delta ∧
      prepared = makeInternalBoundedScopePreparation state selected instanceId ownerRecord start delta := by
  unfold prepareInternalBoundedScope? at found
  obtain ⟨selected, selection, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨instanceId, running, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · split at found
    · contradiction
    · split at found
      · next ownerRecord ownerExact =>
          dsimp only [bind, Option.bind] at found
          obtain ⟨definition, definitionFound, found⟩ := Option.bind_eq_some_iff.mp found
          split at found
          · contradiction
          · obtain ⟨start, startFound, found⟩ := Option.bind_eq_some_iff.mp found
            obtain ⟨delta, deltaFound, found⟩ := Option.bind_eq_some_iff.mp found
            cases found
            refine ⟨selected, instanceId, ownerRecord, definition, start, delta,
              selection, running, ?_, ?_, ownerExact, definitionFound, ?_, ?_, startFound, deltaFound, rfl⟩ <;>
              simp_all
      · contradiction

/-- Successful complete preparation refines the actual bounded-entry evaluator, not a synthetic
Program containing an ordinary entry. The shared selector is only its internal decomposition. -/
theorem prepareInternalBoundedScope_refines (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    fire? program contract.operation state = some (prepared.selection.apply state) := by
  obtain ⟨selected, instanceId, ownerRecord, definition, start, delta,
    selection, _, snapshots, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalBoundedScope_facts program state contract prepared found
  exact selectInternalBoundedScope_refines program state contract selected snapshots selection

theorem prepareInternalBoundedScope_issuesFreshActivity (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    activityIdentityIssuingDiscipline state (prepared.selection.apply state) = true := by
  obtain ⟨selected, instanceId, ownerRecord, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, _, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  apply activityIdentityIssuingDiscipline_insertActivityOccurrence
  simp [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection]

/-- Association exclusion prevents a second Activity from claiming the newly retained child. -/
theorem prepareInternalBoundedScope_preserves_bodyClaims (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (unique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique (prepared.selection.apply state).activityOccurrences = true := by
  obtain ⟨selected, instanceId, ownerRecord, definition, start, delta,
    selection, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
      prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, _, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have disjoint : state.activityOccurrences.any (regionalActivityAssociationsConflict ·
      (makeInternalBoundedScopeSelection state contract entry).record) = false := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa using joint.2
  apply activityBodyClaimsUnique_insertActivityOccurrence _ _ _ unique
  apply List.all_eq_true.mpr
  intro old member
  apply activityBodyClaimsDisjoint_childScope_of_not_mem
    (makeInternalBoundedScopeSelection state contract entry).record old entry.created.id
  intro claimed
  have absent := List.any_eq_false.mp disjoint old member
  cases body : old.body <;> simp [activityBodyScopeClaims, body] at claimed
  subst_vars
  simp [regionalActivityAssociationsConflict, makeInternalBoundedScopeSelection, body] at absent

end BpmnSemantics.SemanticProcess.InternalCommutation
