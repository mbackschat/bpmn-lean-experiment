import BpmnSemantics.SemanticProcess.InternalRegionalPairControlFrame

/-! Return and completion select quiescent scopes. Disjoint removal cannot introduce work into a protected owner, so the original quiescence check survives. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem quiescent_of_retained_work (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (quiet : scopeQuiescent before owner = true)
    (tokens : after.tokens.any (fun token => token.owner == owner) = false)
    (tasks : after.waits ⊆ before.waits) (messages : after.messageWaits ⊆ before.messageWaits)
    (timers : after.timerWaits ⊆ before.timerWaits) (effects : after.effectWaits ⊆ before.effectWaits)
    (incidents : after.effectIncidents ⊆ before.effectIncidents)
    (branches : after.selectedBranchSets ⊆ before.selectedBranchSets)
    (races : after.eventRaces ⊆ before.eventRaces)
    (calls : after.calledProcessOccurrences ⊆ before.calledProcessOccurrences)
    (triggers : after.compensationTriggers ⊆ before.compensationTriggers)
    (scopes : after.scopeOccurrences ⊆ before.scopeOccurrences) :
    scopeQuiescent after owner = true := by
  have absent {α : Type} (before after : List α) (test : α → Bool)
      (subset : after ⊆ before) (prior : before.any test = false) : after.any test = false := by
    apply List.any_eq_false.mpr
    intro value member
    exact List.any_eq_false.mp prior value (subset member)
  simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true', and_assoc] at quiet ⊢
  exact ⟨tokens, absent _ _ _ tasks quiet.2.1, absent _ _ _ messages quiet.2.2.1,
    absent _ _ _ timers quiet.2.2.2.1, absent _ _ _ effects quiet.2.2.2.2.1,
    absent _ _ _ incidents quiet.2.2.2.2.2.1, absent _ _ _ branches quiet.2.2.2.2.2.2.1,
    absent _ _ _ races quiet.2.2.2.2.2.2.2.1, absent _ _ _ calls quiet.2.2.2.2.2.2.2.2.1,
    absent _ _ _ triggers quiet.2.2.2.2.2.2.2.2.2.1, absent _ _ _ scopes quiet.2.2.2.2.2.2.2.2.2.2⟩

private theorem bounded_completion_quiescent (program : Program) (before after : RuntimeState)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (owner : ScopeOccurrenceId)
    (result : completeBoundedScope? program before definition output = some after)
    (quiet : scopeQuiescent before owner = true)
    (tokens : after.tokens.any (fun token => token.owner == owner) = false) :
    scopeQuiescent after owner = true := by
  unfold completeBoundedScope? at result
  cases completed : completeScopeState? before definition output with
  | none => simp [completed] at result
  | some ordinary =>
      simp only [completed] at result
      unfold completeScopeState? at completed
      split at completed
      · split at completed
        · simp at completed
        · unfold completeQuiescentScope? at completed
          repeat' split at completed
          all_goals first
            | (simp at completed; done)
            | (simp only [Option.some.injEq] at completed; subst ordinary
               repeat' split at result
               all_goals first
                 | (simp at result; done)
                 | (simp only [Option.some.injEq] at result; subst after
                    apply quiescent_of_retained_work before _ owner quiet tokens
                    all_goals first
                      | exact List.Subset.refl _
                      | exact fun _ member => (List.mem_filter.mp member).1
                      | exact List.erase_subset
                      | exact List.nil_subset _))
      · simp at completed

/-- Regional steps only remove live work except for their explicit continuation token.
Protecting the target's token query therefore preserves a previously quiescent scope. -/
theorem preparedRegional_quiescence_of_token_query (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional) (owner : ScopeOccurrenceId)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (quiet : scopeQuiescent before owner = true)
    (tokenQuery : after.tokens.filter (fun token => token.owner == owner) =
      before.tokens.filter (fun token => token.owner == owner)) :
    scopeQuiescent after owner = true := by
  have tokens : after.tokens.any (fun token => token.owner == owner) = false := by
    have prior : before.tokens.any (fun token => token.owner == owner) = false := by
      simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true', and_assoc] at quiet
      exact quiet.1
    apply List.any_eq_false.mpr
    intro token member
    intro owned
    have retained : token ∈ after.tokens.filter (fun token => token.owner == owner) :=
      List.mem_filter.mpr ⟨member, owned⟩
    rw [tokenQuery] at retained
    have oldMember := (List.mem_filter.mp retained).1
    have absent := List.any_eq_false.mp prior token oldMember
    simp [owned] at absent
  obtain ⟨snapshots, _, _, closed, _, _, _⟩ := prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection closed).1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before operation prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  cases operation with
  | returnProcess id origin process definition output =>
      have raw : returnProcessState? before id origin process definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      cases returnProcessState_sound before after id origin process definition output raw
      apply quiescent_of_retained_work before _ owner quiet tokens
      all_goals exact fun _ member => (List.mem_filter.mp member).1
  | completeScope id origin definition output =>
      exact bounded_completion_quiescent program before after definition output owner
        (by simp only [fire?, snapshots] at fired; exact fired) quiet tokens
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨parent, _, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler prepared.selection selected raw
      rw [update] at tokens ⊢
      apply quiescent_of_retained_work before _ owner quiet tokens
      all_goals exact fun _ member => (List.mem_filter.mp member).1
  | terminateScope id origin input definition =>
      have chosen := (regionalSelection_terminate_owner program before id origin input definition prepared.selection selected).1
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      apply quiescent_of_retained_work before _ owner quiet tokens
      all_goals exact fun _ member => (List.mem_filter.mp member).1
  | _ => simp [selectInternalRegional?] at selected

theorem regional_pair_preserves_quiescence (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (quiet : scopeQuiescent before right.selection.root.id = true) :
    scopeQuiescent after right.selection.root.id = true := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have leftFootprint := leftFacts.2.2.2.2.2.1
  have rightFootprint := rightFacts.2.2.2.2.2.1
  have rightDerived := rightFacts.2.2.2.2.1
  have rootMember := (deriveInternalOccurrenceRegion_spec before right.selection.root.id right.region rightDerived).2.1
  have rootInside : right.region.contains right.selection.root.id = true := List.contains_iff_mem.mpr rootMember
  have disjoint := regional_pair_regions_disjoint before left.selection right.selection left.region right.region
    left.footprint right.footprint leftFootprint rightFootprint independent
  have outside : left.region.contains right.selection.root.id = false := by
    apply Bool.eq_false_iff.mpr
    intro inside
    exact disjoint _ (List.contains_iff_mem.mp inside) rootMember
  have noControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  have frame := preparedRegional_control_filters program before after hosting leftOperation left
    valid running leftFound applied (fun _ => false)
    (fun token => token.owner == right.selection.root.id) (fun _ => false)
    (by simp)
    (by intro token _ named; simp only [beq_iff_eq] at named; simpa [named] using outside)
    (by simp)
    (by
      intro owner output written _
      have separated := regional_independent_read_write _ _ independent _ _ written
        (regionalStateFootprint_region_read before right.selection right.region right.footprint rightFootprint)
      apply Bool.eq_false_iff.mpr
      intro named
      have same : owner = right.selection.root.id := by simpa using named
      simp [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom, same, rootInside] at separated)
    noControl
  exact preparedRegional_quiescence_of_token_query program before after leftOperation left right.selection.root.id
    leftFound applied quiet frame.2.2.2.2.1

end BpmnSemantics.SemanticProcess.InternalCommutation
