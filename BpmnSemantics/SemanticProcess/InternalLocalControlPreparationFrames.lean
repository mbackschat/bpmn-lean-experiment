import BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlSelectionFrames

/-! Complete preparation frames use the exact predecessor dependencies retained by the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem internalLocalControlTokensAvailable_read_frame (before after : RuntimeState)
    (patch : TokenPatch)
    (buckets : ∀ place ∈ patch.consumed ++ patch.produced,
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = patch.owner)) =
        before.tokens.filter (fun token => decide (token.placeId = place && token.owner = patch.owner))) :
    internalLocalControlTokensAvailable after patch = internalLocalControlTokensAvailable before patch := by
  unfold internalLocalControlTokensAvailable
  apply Bool.eq_iff_iff.mpr
  simp only [List.all_eq_true]
  constructor <;> intro available place member
  · rw [← buckets place member]
    exact available place member
  · rw [buckets place member]
    exact available place member

private theorem selectedBranch_owner_key_filter (state : RuntimeState)
    (owner : ScopeOccurrenceId) (key : String) :
    state.selectedBranchSets.filter (fun record => decide (record.owner = owner && record.selectionKey = key)) =
      (state.selectedBranchSets.filter (fun record => decide (record.selectionKey = key))).filter
        (fun record => decide (record.owner = owner)) := by
  rw [List.filter_filter]
  apply List.filter_congr
  intro record _
  simp [Bool.and_comm]

theorem internalLocalControlRecordAvailable_read_frame (before after : RuntimeState)
    (patch : InternalSelectedBranchPatch)
    (population : ∀ key, patch.selectionKey = some key →
      after.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) =
        before.selectedBranchSets.filter (fun record => decide (record.selectionKey = key))) :
    internalLocalControlRecordAvailable after patch = internalLocalControlRecordAvailable before patch := by
  cases patch with
  | preserve => rfl
  | insert record =>
      simp only [internalLocalControlRecordAvailable]
      rw [selectedBranch_owner_key_read_frame before after record.owner record.selectionKey
        (population record.selectionKey rfl)]
  | remove record =>
      simp only [internalLocalControlRecordAvailable]
      rw [selectedBranch_owner_key_filter after, selectedBranch_owner_key_filter before,
        population record.selectionKey rfl]

theorem makeInternalLocalControlPreparation_read_frame (before after : RuntimeState)
    (selected : InternalLocalControlSelection) (instanceId : SemanticId)
    (identity : FlowNodeIdentity) (delta : PublicControlPositionDelta)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (population : ∀ key, selected.selectedBranch.selectionKey = some key →
      after.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) =
        before.selectedBranchSets.filter (fun record => decide (record.selectionKey = key))) :
    makeInternalLocalControlPreparation after selected instanceId identity delta =
      makeInternalLocalControlPreparation before selected instanceId identity delta := by
  have reads : internalLocalControlExtraReads after selected =
      internalLocalControlExtraReads before selected := by
    unfold internalLocalControlExtraReads
    cases branch : selected.selectedBranch with
    | preserve => rfl
    | insert record => rfl
    | remove record =>
        simp only [selectedJoinReadAtoms]
        rw [population record.selectionKey (by simp [branch, InternalSelectedBranchPatch.selectionKey])]
  simp only [makeInternalLocalControlPreparation, internalLocalControlStateFootprint, time, reads]

/-- Equal predecessor populations preserve the complete artifact, including its read footprint and
index-free publication. No successor readiness, preparation, or validity is assumed. -/
theorem prepareInternalLocalControl_read_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (found : prepareInternalLocalControl? program before operation = some prepared)
    (control : after.control = before.control)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (scope : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.owner)) =
      before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.owner)))
    (census : ∀ place ∈ prepared.selection.censusReads,
      tokenOwners after place = tokenOwners before place)
    (tokens : ∀ place ∈ prepared.selection.tokens.consumed ++ prepared.selection.tokens.produced,
      after.tokens.filter (fun token => decide (token.placeId = place && token.owner = prepared.selection.owner)) =
        before.tokens.filter (fun token => decide (token.placeId = place && token.owner = prepared.selection.owner)))
    (variables : ∀ name ∈ prepared.selection.variableReads,
      after.variables.process.bindings.filter (fun binding => decide (binding.name = name)) =
        before.variables.process.bindings.filter (fun binding => decide (binding.name = name)))
    (population : ∀ key, prepared.selection.selectedBranch.selectionKey = some key →
      after.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)) =
        before.selectedBranchSets.filter (fun record => decide (record.selectionKey = key)))
    (buckets : ∀ chosen, prepared.selection.branchResult = some (.selectedJoin chosen) →
      ∀ record ∈ before.selectedBranchSets, record.selectionKey = chosen.selectionKey →
        ∀ input ∈ record.expectedInputs,
          after.tokens.filter (fun token => decide (token.placeId = input && token.owner = record.owner)) =
            before.tokens.filter (fun token => decide (token.placeId = input && token.owner = record.owner))) :
    prepareInternalLocalControl? program after operation = some prepared := by
  obtain ⟨selected, origin, instanceId, identity, delta, selection, originFound, running, live,
    nonempty, safeTime, available, recordAvailable, identityFound, deltaFound, rfl⟩ :=
    prepareInternalLocalControl_facts program before operation prepared found
  dsimp only [makeInternalLocalControlPreparation] at scope census tokens variables population buckets
  have selectedAfter := selectInternalLocalControl_read_frame before after operation selected
    selection census variables population buckets
  have liveAfter : exactLiveOccurrence after selected.owner = true := by
    simp only [exactLiveOccurrence, decide_eq_true_eq] at live ⊢
    exact (congrArg List.length scope).trans live
  have availableAfter := internalLocalControlTokensAvailable_read_frame before after selected.tokens tokens
  have recordAfter := internalLocalControlRecordAvailable_read_frame before after selected.selectedBranch population
  have preparationFrame := makeInternalLocalControlPreparation_read_frame before after selected
    instanceId identity delta time population
  simp [prepareInternalLocalControl?, selectedAfter, originFound, control, running, liveAfter,
    nonempty, time, safeTime, availableAfter, available, recordAfter, recordAvailable,
    identityFound, deltaFound, preparationFrame]

end BpmnSemantics.SemanticProcess.InternalCommutation
