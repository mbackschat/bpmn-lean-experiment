import BpmnSemantics.SemanticProcess.InternalRegionalPairRegionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairWithdrawalFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairQuiescence
import BpmnSemantics.SemanticProcess.InternalRegionalArmingRetention

/-! The complete regional selector combines protected censuses, quiescence, and bounded-handler withdrawal. These frames preserve its exact selected artifact before rebuilding preparation. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem returning_record_member (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (record : CalledProcessOccurrence)
    (found : selectInternalRegional? program state operation = some selected)
    (kind : selected.kind = .returning record) : record ∈ state.calledProcessOccurrences := by
  cases operation with
  | returnProcess id origin process definition output =>
      obtain ⟨actual, actualKind, _, census⟩ :=
        regionalSelection_return_record program state id origin process definition output selected found
      have same : actual = record := by simpa only [kind, InternalRegionalKind.returning.injEq] using actualKind.symm
      subst actual
      have member : record ∈ state.calledProcessOccurrences.filter (fun candidate =>
          decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) := by
        rw [census]; simp
      exact (List.mem_filter.mp member).1
  | _ =>
      unfold selectInternalRegional? at found
      obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat' first
        | (solve | simp at found)
        | (solve | cases found; simp_all)
        | split at found
        | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found

/-- The second selector survives an actual independent regional step. Every filter,
withdrawal and token-owner query is derived from the two complete predecessor preparations. -/
theorem regionalSelection_after_independent_regional (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    selectInternalRegional? program after rightOperation = some right.selection := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have leftFootprint := leftFacts.2.2.2.2.2.1
  have rightFootprint := rightFacts.2.2.2.2.2.1
  have selected := (ownershipClosedSelection_facts program before rightOperation right.selection rightFacts.2.2.2.1).1
  have operationEq := regionalSelection_operation program before rightOperation right.selection selected
  have roots := regionalStateFootprint_root_read before right.selection right.region right.footprint rightFootprint
  have outside := regional_pair_read_owner_outside before left.selection left.region left.footprint right.footprint
    leftFootprint independent right.selection.root.id roots.1
  have noControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  obtain ⟨keepScope, keepCall, scopes, calls, scopeSurvives, callSurvives⟩ :=
    preparedRegional_graph_filters program before after hosting leftOperation left valid running leftFound applied noControl
  have fields := regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied
  have rootKept := scopeSurvives right.selection.root
    (regionalSelection_root_member program before rightOperation right.selection selected) outside
  obtain ⟨actual, actualApplied, afterValid⟩ :=
    preparedRegional_preserves_runtimeStateWellFormed program before hosting leftOperation left valid leftFound
  have same : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  have position : runtimePositionValid program hosting after = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  have parentKept (parent : ScopeOccurrenceId) (parentEq : right.selection.root.parent = some parent)
      (scope : RuntimeScopeOccurrence) (member : scope ∈ before.scopeOccurrences) (identity : scope.id = parent) :
      keepScope scope = true := by
    apply scopeSurvives scope member
    rw [identity]
    have separated := regional_independent_read_write _ _ independent _ _
      (regionalStateFootprint_region_write before left.selection left.region left.footprint leftFootprint) roots.2
    apply Bool.eq_false_iff.mpr
    intro inside
    simp [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom, parentEq, inside] at separated
  apply regionalSelection_filter_frame program before after rightOperation right.selection keepScope keepCall
    selected fields.1 scopes calls
    (runtimePositionValid_called_associations program hosting hosting after position (fields.1.trans running))
    (preparedRegional_pending_frame program before after leftOperation left leftFound applied) rootKept
  · exact parentKept
  · cases kind : right.selection.kind with
    | returning record =>
        have callerOutside := regional_pair_read_owner_outside before left.selection left.region left.footprint right.footprint
          leftFootprint independent record.caller
          (regionalStateFootprint_return_caller_read before right.selection right.region right.footprint record kind rightFootprint)
        have rootId := (regionalSelection_return_root program before rightOperation right.selection record selected kind).1
        exact ⟨callSurvives record (returning_record_member program before rightOperation right.selection record selected kind)
          callerOutside (by simpa only [rootId] using outside),
          fun scope member identity => scopeSurvives scope member (by simpa only [identity] using callerOutside)⟩
    | _ => trivial
  · exact regional_pair_preserves_quiescence program before after hosting leftOperation rightOperation left right
      valid running leftFound rightFound independent applied
  · cases rightOperation with
    | completeScope id origin definition output =>
        intro choice chosen
        obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition output
          right.selection selected
        have actualWithdrawal := regionalSelection_completion_withdrawal program before id origin definition output
          right.selection withdrawal selected kind
        have choiceEq : choice = withdrawal := Option.some.inj (chosen.symm.trans actualWithdrawal)
        subst withdrawal
        have children := regional_pair_retained_singleton before.scopeOccurrences keepScope
          (fun scope => decide (scope.id.definitionScopeId = definition)) right.selection.root census rootKept
        apply regional_pair_subscribed_completion_withdrawal program before after hosting leftOperation left right definition output choice
          valid leftFound rightFootprint kind independent applied fields.1 (by rw [scopes, children, census]) ?_ chosen
        intro child parent childCensus parentEq
        have sameChild : child = right.selection.root := by simpa using childCensus.symm.trans census
        subst child
        rw [scopes]
        apply allMatchingRetained_preserves_census
        apply List.all_eq_true.mpr
        intro scope member
        cases named : decide (scope.id = parent) with
        | false => simp [named]
        | true =>
            have retained := parentKept parent parentEq scope member (of_decide_eq_true named)
            simp [named, retained]
    | _ => trivial
  · have inputRead := regionalStateFootprint_selector_read before right.selection right.region right.footprint rightFootprint
    rw [operationEq] at inputRead
    have owners (input : ControlPlaceId) (read : .ordinary (.tokenOwners input) ∈ right.footprint.reads) :
        tokenOwners after input = tokenOwners before input := by
      unfold tokenOwners
      rw [fields.2.2.2.2 input read]
    cases rightOperation with
    | throwError id origin input error handler =>
        refine ⟨onlyTokenOwner_read_frame before after input (owners input inputRead), ?_⟩
        have filtered := congrArg (List.filter (fun token : ControlToken => decide (token.owner = right.selection.root.id)))
          (fields.2.2.2.2 input inputRead)
        simpa only [List.filter_filter, Bool.and_comm, Bool.decide_and, Bool.decide_eq_true] using filtered
    | terminateScope id origin input definition =>
        change selectedTerminateOwner? program after id origin input definition =
          selectedTerminateOwner? program before id origin input definition
        have chosen := (regionalSelection_terminate_owner program before id origin input definition right.selection selected).1
        rw [chosen]
        have rootQuery := fields.2.2.2.1 right.selection.root.id roots.1
        unfold selectedTerminateOwner? at chosen ⊢
        rw [fields.1, owners input inputRead]
        repeat' first | (solve | simp at chosen) | split at chosen
        all_goals cases chosen <;> simp_all only [↓reduceIte]
        all_goals simp
    | _ => trivial

end BpmnSemantics.SemanticProcess.InternalCommutation
