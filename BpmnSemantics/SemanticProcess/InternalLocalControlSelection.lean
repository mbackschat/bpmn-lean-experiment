import BpmnSemantics.SemanticProcess.InternalSelectedBranchPatch
import BpmnSemantics.SemanticProcess.InternalLocalControlBranchSelection

/-! Predecessor selection for the five local-control families in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalLocalControlBranchResult where
  | exclusive (selected : InternalConditionalSelection)
  | inclusive (selected : InternalInclusiveSelection)
  | selectedJoin (record : SelectedBranchSet)
  deriving Repr, DecidableEq

structure InternalLocalControlSelection where
  operation : SemanticOperation
  tokens : TokenPatch
  selectedBranch : InternalSelectedBranchPatch := .preserve
  branchResult : Option InternalLocalControlBranchResult := none
  deriving Repr, DecidableEq

def InternalLocalControlSelection.owner (selected : InternalLocalControlSelection) :
    ScopeOccurrenceId := selected.tokens.owner

def InternalLocalControlSelection.variableReads (selected : InternalLocalControlSelection) :
    List String :=
  match selected.branchResult with
  | some (.exclusive branch) => branch.readVariables
  | some (.inclusive branch) => branch.readVariables
  | _ => []

def InternalLocalControlSelection.censusReads (selected : InternalLocalControlSelection) :
    List ControlPlaceId :=
  match selected.operation with
  | .duplicate _ _ input _ | .choose _ _ input _ _ _
  | .selectMany _ _ input _ _ _ => [input]
  | .synchronize _ _ inputs _ => inputs
  | _ => []

def InternalLocalControlSelection.apply (state : RuntimeState)
    (selected : InternalLocalControlSelection) : RuntimeState :=
  { state with
    tokens := selected.tokens.apply state.tokens
    selectedBranchSets := selected.selectedBranch.apply state.selectedBranchSets }

/-- The existing family selectors settle ownership and branch choice before any successor is built.
Multiplicity, static provenance, and complete footprint checks belong to preparation. -/
def selectInternalLocalControl? (state : RuntimeState) (operation : SemanticOperation) :
    Option InternalLocalControlSelection :=
  match operation with
  | .duplicate _ _ input outputs => do
      let owner ← onlyTokenOwner? state input
      pure { operation, tokens := { owner, consumed := [input], produced := outputs } }
  | .synchronize _ _ inputs output => do
      let owner ← commonTokenOwner? state inputs
      pure { operation, tokens := { owner, consumed := inputs, produced := [output] } }
  | .choose _ _ input candidates defaultOutput defaultOrigin => do
      let owner ← onlyTokenOwner? state input
      let selected ← prepareInternalConditional? candidates defaultOutput defaultOrigin
        state.variables.process.bindings
      pure
        { operation
          tokens := { owner, consumed := [input], produced := [selected.output] }
          branchResult := some (.exclusive selected) }
  | .selectMany _ _ input candidates defaultBranch selectionKey => do
      let owner ← onlyTokenOwner? state input
      if state.selectedBranchSets.any (fun record =>
          decide (record.owner = owner && record.selectionKey = selectionKey)) then none
      else
        let selected ← prepareInternalInclusive? candidates defaultBranch
          state.variables.process.bindings
        if selected.selected.isEmpty then none
        else
          pure
            { operation
              tokens := { owner, consumed := [input], produced := selected.selected.map (·.1) }
              selectedBranch := .insert
                { owner, selectionKey
                  expectedInputs := canonicalControlPlaceOrder (selected.selected.map (·.2)) }
              branchResult := some (.inclusive selected) }
  | .synchronizeSelected _ _ _ output selectionKey =>
      match state.selectedBranchSets.filter (selectedBranchJoinReady state selectionKey) with
      | [record] => some
          { operation
            tokens := { owner := record.owner, consumed := record.expectedInputs, produced := [output] }
            selectedBranch := .remove record
            branchResult := some (.selectedJoin record) }
      | _ => none
  | _ => none

theorem localControlSelection_duplicate_enabled (state : RuntimeState)
    (operationId : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (outputs : List ControlPlaceId) (owner : ScopeOccurrenceId)
    (owned : onlyTokenOwner? state input = some owner) :
    (selectInternalLocalControl? state (.duplicate operationId origin input outputs)).isSome = true := by
  simp [selectInternalLocalControl?, owned]

/-- Every retained selection denotes the original operation, including branch provenance. -/
theorem selectInternalLocalControl_operation (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (found : selectInternalLocalControl? state operation = some selected) :
    selected.operation = operation := by
  cases operation with
  | duplicate id origin input outputs =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      rfl
  | synchronize id origin inputs output =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      rfl
  | choose id origin input candidates defaultOutput defaultOrigin =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨branch, _, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      rfl
  | selectMany id origin input candidates defaultBranch key =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · obtain ⟨branch, _, found⟩ := Option.bind_eq_some_iff.mp found
        split at found
        · contradiction
        · cases found; rfl
  | synchronizeSelected id origin inputs output key =>
      simp only [selectInternalLocalControl?] at found
      split at found
      · cases found; rfl
      · contradiction
  | _ => simp [selectInternalLocalControl?] at found

/-- Retained patches realize the existing five evaluators under the approved snapshot-declaration
exclusion; this does not certify a footprint. -/
theorem selectInternalLocalControl_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalLocalControlSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (found : selectInternalLocalControl? state operation = some selected) :
    fire? program operation state = some (selected.apply state) := by
  unfold fire?
  rw [snapshotAbsent]
  cases operation with
  | duplicate id origin input outputs =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      change duplicateState? state input outputs = _
      simp [duplicateState?, owned, duplicateToken,
        InternalLocalControlSelection.apply, TokenPatch.apply, removeTokens,
        InternalSelectedBranchPatch.apply]
  | synchronize id origin inputs output =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      change synchronizeState? state inputs output = _
      simp [synchronizeState?, owned, synchronizeTokens,
        InternalLocalControlSelection.apply, TokenPatch.apply, addTokens,
        InternalSelectedBranchPatch.apply]
  | choose id origin input candidates defaultOutput defaultOrigin =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨branch, branchFound, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      have outputFound : selectConditionalOutput candidates defaultOutput
          state.variables.process.bindings = some branch.output := by
        rw [← prepare_internal_conditional_output candidates defaultOutput defaultOrigin,
          branchFound]
        rfl
      change chooseState? state input candidates defaultOutput = _
      simp [chooseState?, owned, outputFound, chooseToken,
        InternalLocalControlSelection.apply, TokenPatch.apply, removeTokens, addTokens,
        InternalSelectedBranchPatch.apply]
  | selectMany id origin input candidates defaultBranch key =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · next fresh =>
          obtain ⟨branch, branchFound, found⟩ := Option.bind_eq_some_iff.mp found
          split at found
          · contradiction
          · next nonempty =>
              cases found
              have evaluated : evaluateInclusiveBranches candidates defaultBranch
                  state.variables.process.bindings = some branch.selected := by
                rw [← prepare_internal_inclusive_selected candidates defaultBranch, branchFound]
                rfl
              change selectManyState? state input candidates defaultBranch key = _
              simp only [selectManyState?, owned]
              change (if state.selectedBranchSets.any (fun record =>
                decide (record.owner = owner && record.selectionKey = key)) then none else _) = _
              simp [evaluated, nonempty, InternalLocalControlSelection.apply,
                TokenPatch.apply, removeTokens, InternalSelectedBranchPatch.apply]
              simpa [List.any_eq_true] using fresh
  | synchronizeSelected id origin inputs output key =>
      simp only [selectInternalLocalControl?] at found
      split at found
      · next record ready =>
          cases found
          change synchronizeSelectedState? state output key = _
          simp [synchronizeSelectedState?, ready,
            InternalLocalControlSelection.apply, TokenPatch.apply, addTokens,
            InternalSelectedBranchPatch.apply]
      · contradiction
  | _ => simp [selectInternalLocalControl?] at found

end BpmnSemantics.SemanticProcess.InternalCommutation
