import BpmnSemantics.SemanticProcess.InternalEndRegionalPreparationFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairExecutionFrame

/-! Actual End/regional executions commute by the existing fixed regional token action and
relative End increment. Both complete preparations and successor facts come from predecessor
validity and footprint independence, without an intermediate-invariant premise. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem end_regional_retained_fields (program : Program) (before after afterEnd : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (regional : PreparedInternalRegional)
    (ending : InternalEndSelection)
    (valid : runtimeStateWellFormed program hosting before = true)
    (endValid : runtimeStateWellFormed program hosting (ending.apply before) = true)
    (running : before.control = .running hosting)
    (afterRunning : after.control = .running hosting) (afterEndRunning : afterEnd.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some regional)
    (endFound : prepareInternalRegional? program (ending.apply before) operation = some regional)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (endApplied : applyPreparedInternalRegional? program (ending.apply before) regional = some afterEnd) :
    { afterEnd with tokens := [], endOccurrences := 0 } = { after with tokens := [], endOccurrences := 0 } := by
  have update := preparedRegional_execution_fields program before after hosting operation regional
    valid running afterRunning found applied
  have endUpdate := preparedRegional_execution_fields program (ending.apply before) afterEnd hosting operation regional
    endValid running afterEndRunning endFound endApplied
  cases operation with
  | returnProcess id origin process definition output =>
      cases kind : regional.selection.kind <;> simp only [kind] at update endUpdate <;> try contradiction
      rw [update, endUpdate]
      rfl
  | completeScope id origin definition output =>
      cases kind : regional.selection.kind <;> simp only [kind] at update endUpdate <;> try contradiction
      rename_i withdrawal
      cases parent : regional.selection.root.parent <;> cases output <;>
        simp only [parent] at update endUpdate <;> try contradiction
      cases withdrawal <;> simp only at update endUpdate <;> rw [update, endUpdate] <;> rfl
  | throwError id origin input error handler =>
      cases kind : regional.selection.kind <;> simp only [kind] at update endUpdate <;> try contradiction
      rw [update, endUpdate]
      rfl
  | terminateScope id origin input definition =>
      cases kind : regional.selection.kind <;> simp only [kind] at update endUpdate <;> try contradiction
      rw [update, endUpdate]
      rfl
  | _ => simp at update

/-- The existing regional action fixes its token filter, continuations and relative End increment.
Complete preparation preservation therefore suffices to compare the two actual executions. -/
theorem prepared_regional_end_pair_commutes (program : Program) (before : RuntimeState)
    (regionalOperation endOperation : SemanticOperation) (regional : PreparedInternalRegional)
    (ending : PreparedInternalEnd)
    (valid : runtimeStateWellFormed program ending.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (endFound : prepareInternalEnd? program before endOperation = some ending)
    (independent : regionalStateFootprintsIndependent regional.footprint ending.footprint = true) :
    prepareInternalRegional? program (ending.selection.apply before) regionalOperation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalEnd? program afterRegional endOperation = some ending ∧
        applyPreparedInternalRegional? program (ending.selection.apply before) regional =
          some (ending.selection.apply afterRegional) := by
  have regionalFrame := prepareInternalRegional_after_independent_end program before regionalOperation endOperation
    regional ending valid regionalFound endFound independent
  obtain ⟨after, _, applied⟩ := prepareInternalRegional_executes program before regionalOperation regional regionalFound
  obtain ⟨afterEnd, _, endApplied⟩ := prepareInternalRegional_executes program (ending.selection.apply before)
    regionalOperation regional regionalFrame
  have endFrame := prepareInternalEnd_after_independent_regional program before after regionalOperation endOperation
    regional ending valid regionalFound endFound independent applied
  refine ⟨regionalFrame, after, applied, endFrame, ?_⟩
  obtain ⟨_, selected, _, hosting, _, _, _, _, running, live, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program before endOperation ending endFound
  have endValid := selected.preserves_runtimeStateWellFormed program before hosting valid live
  have controlRead : .ordinary (.runtimeControl hosting) ∈ (internalEndStateFootprint selected hosting).reads := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have tokenRead : .ordinary (.controlToken selected.owner selected.input) ∈
      (internalEndStateFootprint selected hosting).reads := by
    simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem]
  have noControl := regional_pair_read_key_not_written _ _ independent _ controlRead
  have afterRunning := (preparedRegional_control_preserved_of_no_write program before after hosting regionalOperation
    regional valid running regionalFound applied noControl).trans running
  have afterEndRunning := (preparedRegional_control_preserved_of_no_write program (selected.apply before) afterEnd hosting
    regionalOperation regional endValid running regionalFrame endApplied noControl).trans running
  have fields := end_regional_retained_fields program before after afterEnd hosting regionalOperation regional selected
    valid endValid running afterRunning afterEndRunning regionalFound regionalFrame applied endApplied
  obtain ⟨keep, outputs, owner, _, writes, action⟩ := preparedRegional_token_action program before hosting
    regionalOperation regional valid running regionalFound
  have firstTokens := action before after valid running afterRunning regionalFound applied
  have secondTokens := action (selected.apply before) afterEnd endValid running afterEndRunning regionalFrame endApplied
  have distinct (output : ControlPlaceId) (member : output ∈ outputs) :
      ({ placeId := output, owner } : ControlToken) ≠ { placeId := selected.input, owner := selected.owner } := by
    have conflict := regional_independent_read_write _ _ independent _ _ (writes output member) tokenRead
    intro same
    obtain ⟨place, ownerEq⟩ := ControlToken.mk.inj same
    simp [regionalStateAtomsConflict, place, ownerEq] at conflict
  have filtered : (removeToken before.tokens selected.input selected.owner).filter keep =
      removeToken (before.tokens.filter keep) selected.input selected.owner := by
    simp only [removeToken_eq_erase, List.erase_filter]
  have ordered := canonicalCollectionOrder_tokens before
    (runtimeStateWellFormed_canonicalCollectionOrder program hosting before valid)
  have tokenEquality : afterEnd.tokens = (selected.apply after).tokens := by
    rw [secondTokens]
    change addTokens ((removeToken before.tokens selected.input selected.owner).filter keep) outputs owner =
      removeToken after.tokens selected.input selected.owner
    rw [filtered, firstTokens]
    exact (addTokens_removeToken_commute _ outputs selected.input owner selected.owner
      (orderedBy_token_filter before.tokens keep ordered) distinct).symm
  have firstCount := preparedRegional_end_count program before after hosting regionalOperation regional
    valid running afterRunning regionalFound applied
  have secondCount := preparedRegional_end_count program (selected.apply before) afterEnd hosting regionalOperation regional
    endValid running afterEndRunning regionalFrame endApplied
  have countEquality : afterEnd.endOccurrences = (selected.apply after).endOccurrences := by
    change afterEnd.endOccurrences = after.endOccurrences + 1
    change afterEnd.endOccurrences = before.endOccurrences + 1 + _ at secondCount
    omega
  have restored := congrArg (fun state : RuntimeState =>
    { state with tokens := afterEnd.tokens, endOccurrences := afterEnd.endOccurrences }) fields
  change afterEnd = { after with tokens := afterEnd.tokens, endOccurrences := afterEnd.endOccurrences } at restored
  rw [tokenEquality, countEquality] at restored
  have exactState : afterEnd = selected.apply after := restored
  change applyPreparedInternalRegional? program (selected.apply before) regional = some (selected.apply after)
  exact endApplied.trans (congrArg some exactState)

end BpmnSemantics.SemanticProcess.InternalCommutation
