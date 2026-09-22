import BpmnSemantics.SemanticProcess.InternalEndPublication
import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies

/-! Complete End preparations survive disjoint input removal. The relative counter commutes
without reading its predecessor value; the input census still protects single-unit selection. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Complete End preparation reads only its input census, live owner, running identity and time.
The relative End atom deliberately does not read the accumulated counter. -/
theorem prepareInternalEnd_read_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (found : prepareInternalEnd? program before operation = some prepared)
    (control : after.control = before.control)
    (live : exactLiveOccurrence after prepared.selection.owner = exactLiveOccurrence before prepared.selection.owner)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (tokens : after.tokens.filter (fun token => decide (token.placeId = prepared.selection.input)) =
      before.tokens.filter (fun token => decide (token.placeId = prepared.selection.input))) :
    prepareInternalEnd? program after operation = some prepared := by
  obtain ⟨snapshots, selected, origin, instanceId, identity, delta, selection, originFound,
    running, ownerLive, nonempty, safeTime, identityFound, deltaFound, rfl⟩ :=
    prepareInternalEnd_facts program before operation prepared found
  dsimp only [makeInternalEndPreparation] at live tokens
  obtain ⟨_, id, operationOrigin, operationEq, filtered⟩ := selectInternalEnd_facts before operation selected selection
  have selectionAfter : selectInternalEnd? after operation = some selected := by
    rw [operationEq] at selection ⊢
    exact (congrArg (fun inputTokens : List ControlToken => match inputTokens with
      | [token] => some (InternalEndSelection.mk
          (.reachNoneEnd id operationOrigin selected.input) token.owner selected.input)
      | _ => none) tokens).trans selection
  have ownerAfter : exactLiveOccurrence after selected.owner = true := live.trans ownerLive
  have runAfter : runningInstance? after = some instanceId := by
    simp [runningInstance?, control, running]
  simp only [prepareInternalEnd?, snapshots, Option.isSome_none, Bool.false_eq_true, ↓reduceIte,
    selectionAfter, originFound, runAfter, Option.bind_eq_bind, Option.bind_some,
    ownerAfter, time, safeTime, nonempty, Bool.not_true, Bool.false_or, decide_false,
    identityFound, deltaFound]
  simp only [pure, Pure.pure, makeInternalEndPreparation, time]

theorem InternalEndSelection.commutes (state : RuntimeState) (left right : InternalEndSelection) :
    right.apply (left.apply state) = left.apply (right.apply state) := by
  simp only [InternalEndSelection.apply, InternalEndSelection.tokens,
    TokenPatch.apply, removeTokens, List.foldl_cons, List.foldl_nil, addTokens, List.foldr_nil]
  rw [removeToken_commutes]

theorem end_footprints_inputs_distinct (left right : InternalEndSelection)
    (leftInstance rightInstance : SemanticId)
    (independent : regionalStateFootprintsIndependent
      (internalEndStateFootprint left leftInstance) (internalEndStateFootprint right rightInstance) = true) :
    left.input ≠ right.input := by
  have separated := regional_independent_read_write _ _ independent
    (.ordinary (.tokenOwners left.input)) (.ordinary (.tokenOwners right.input))
    (by simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [internalEndStateFootprint, canonicalRegionalStateAtoms_mem])
  intro same
  simp [regionalStateAtomsConflict, same] at separated

theorem prepareInternalEnd_after_independent_end (program : Program) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalEnd)
    (leftFound : prepareInternalEnd? program state leftOperation = some left)
    (rightFound : prepareInternalEnd? program state rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true) :
    prepareInternalEnd? program (left.selection.apply state) rightOperation = some right := by
  have distinct : left.selection.input ≠ right.selection.input := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalEnd_facts program state leftOperation left leftFound
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalEnd_facts program state rightOperation right rightFound
    exact end_footprints_inputs_distinct _ _ _ _ independent
  apply prepareInternalEnd_read_frame program state (left.selection.apply state) rightOperation right rightFound rfl rfl rfl
  exact left.selection.tokens.filter_untouched state.tokens _
    (by simp [InternalEndSelection.tokens, distinct]) (by simp [InternalEndSelection.tokens])

theorem prepared_end_pair_commutes (program : Program) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalEnd)
    (leftFound : prepareInternalEnd? program state leftOperation = some left)
    (rightFound : prepareInternalEnd? program state rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true) :
    prepareInternalEnd? program (right.selection.apply state) leftOperation = some left ∧
      prepareInternalEnd? program (left.selection.apply state) rightOperation = some right ∧
      right.selection.apply (left.selection.apply state) = left.selection.apply (right.selection.apply state) :=
  ⟨prepareInternalEnd_after_independent_end program state rightOperation leftOperation right left
      rightFound leftFound (regionalStateFootprintsIndependent_symmetric _ _ independent),
    prepareInternalEnd_after_independent_end program state leftOperation rightOperation left right
      leftFound rightFound independent, left.selection.commutes state right.selection⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
