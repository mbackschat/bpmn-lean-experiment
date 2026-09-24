import BpmnSemantics.SemanticProcess.InternalRegionalRootTerminationValidity
import BpmnSemantics.SemanticProcess.InternalRegionalReturnPositionValidity

/-! # Completion continuation position

Scope quiescence protects the parents and token owners retained by normal completion. The
continuation's declared static place binding is separate from the raw completion selector,
which receives only a scope identifier and optional output identifier.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem quiescent_scope_has_no_child (state : RuntimeState) (owner : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ state.scopeOccurrences) :
    occurrence.parent ≠ some owner := by
  intro parent
  have present : (state.scopeOccurrences.any fun candidate => candidate.parent == some owner) = true :=
    List.any_eq_true.mpr ⟨occurrence, member, by simp [parent]⟩
  simp [scopeQuiescent, present] at quiescent

theorem quiescent_scope_has_no_token (state : RuntimeState) (owner : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true)
    (token : ControlToken) (member : token ∈ state.tokens) : token.owner ≠ owner := by
  intro same
  have present : (state.tokens.any fun candidate => candidate.owner == owner) = true :=
    List.any_eq_true.mpr ⟨token, member, by simp [same]⟩
  simp [scopeQuiescent, present] at quiescent

/-- With no immediate child, the actual parent traversal can reach only the selected scope. -/
theorem quiescent_scope_subtree_identity (state : RuntimeState) (owner candidate : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true)
    (inside : occurrenceInSubtree state.scopeOccurrences owner candidate = true) : candidate = owner := by
  apply occurrenceInSubtreeWithin_least state.scopeOccurrences owner candidate _ (fun id => id = owner) rfl _ inside
  intro parent child same edge
  obtain ⟨occurrence, member, parentEq, _⟩ := edge
  exact False.elim (quiescent_scope_has_no_child state owner quiescent occurrence member (by simpa [same] using parentEq))

/-- Every Call seed would have an exact caller at the quiescent root; the actual closure is empty. -/
theorem quiescent_scope_called_closure_empty (state : RuntimeState) (owner : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true) : calledInstanceClosure state owner = [] := by
  have seeds : (state.calledProcessOccurrences.filterMap fun record =>
      if occurrenceInSubtree state.scopeOccurrences owner record.caller then
        some record.calledRoot.processInstanceId else none) = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro record member
    by_cases inside : occurrenceInSubtree state.scopeOccurrences owner record.caller = true
    · have same := quiescent_scope_subtree_identity state owner record.caller quiescent inside
      have present : (state.calledProcessOccurrences.any fun candidate => candidate.caller == owner) = true :=
        List.any_eq_true.mpr ⟨record, member, by simp [same]⟩
      simp [scopeQuiescent, present] at quiescent
    · simp [inside]
  unfold calledInstanceClosure
  rw [seeds]
  have noEdges : (state.calledProcessOccurrences.filterMap (fun _ => (none : Option SemanticId))) = [] :=
    List.filterMap_eq_nil_iff.mpr (by intros; rfl)
  simp [processInstanceClosureWithin, noEdges]

/-- A quiescent hosting root leaves no other live scopes, tokens, or Call records. Coverage
comes from predecessor position and actual ancestry, rather than an empty-successor premise. -/
theorem quiescent_hosting_root_position_fields (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (member : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (hosting : root.id.processInstanceId = instanceId)
    (quiescent : scopeQuiescent state root.id = true) :
    state.scopeOccurrences = [root] ∧ state.tokens = [] ∧ state.calledProcessOccurrences = [] := by
  have closure := quiescent_scope_called_closure_empty state root.id quiescent
  have scopes (occurrence : RuntimeScopeOccurrence) (present : occurrence ∈ state.scopeOccurrences) :
      occurrence.id = root.id := by
    have coverage := hosting_cancellation_covers_live_scope program state expectedInstanceId instanceId
      valid running root member parentless hosting occurrence present
    simp only [closure, List.contains_nil, Bool.or_false] at coverage
    exact quiescent_scope_subtree_identity state root.id occurrence.id quiescent coverage
  have live := (runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
    state valid running root member).1
  have allScopes : state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = root.id)) =
      state.scopeOccurrences := List.filter_eq_self.mpr (by intro occurrence present; simp [scopes occurrence present])
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
  rw [allScopes] at singleton
  have rootEq : root = only := by simpa [singleton] using member
  refine ⟨by simpa [← rootEq] using singleton, ?_, ?_⟩
  · apply List.eq_nil_iff_forall_not_mem.mpr
    intro token present
    have ownerLive := runtimePositionValid_token_owner_live program expectedInstanceId instanceId state token valid running present
    obtain ⟨owner, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true ownerLive)
    have ownerIn : owner ∈ state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = token.owner)) := by
      rw [census]; simp
    obtain ⟨ownerMember, identity⟩ := List.mem_filter.mp ownerIn
    exact quiescent_scope_has_no_token state root.id quiescent token present
      ((of_decide_eq_true identity).symm.trans (scopes owner ownerMember))
  · apply List.eq_nil_iff_forall_not_mem.mpr
    intro record present
    have inside := calledInstanceClosure_hosting_covers_calls program state expectedInstanceId instanceId
      valid running root member parentless hosting record present
    simp [closure] at inside

/-- Removing a quiescent child leaves every retained parent and token owner live. -/
theorem quiescent_child_removal_preserves_position (program : Program) (before : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (member : root ∈ before.scopeOccurrences)
    (child : root.parent ≠ none) (quiescent : scopeQuiescent before root.id = true) :
    runtimePositionValid program expectedInstanceId
      { before with scopeOccurrences := before.scopeOccurrences.filter fun occurrence => decide (occurrence.id ≠ root.id) } = true := by
  let after := { before with scopeOccurrences := before.scopeOccurrences.filter fun occurrence => decide (occurrence.id ≠ root.id) }
  have rootLive := (runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId before valid running root member).1
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true rootLive)
  have rootIn : root ∈ before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = root.id)) :=
    List.mem_filter.mpr ⟨member, by simp⟩
  rw [singleton] at rootIn
  have rootEq := List.mem_singleton.mp rootIn
  have survives (owner : ScopeOccurrenceId) (live : exactLiveOccurrence before owner = true)
      (different : owner ≠ root.id) : exactLiveOccurrence after owner = true := by
    have census : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = owner)) =
        before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = owner)) := by
      change (before.scopeOccurrences.filter _).filter _ = _
      rw [List.filter_filter]
      apply List.filter_congr
      intro occurrence _
      by_cases same : occurrence.id = owner <;> simp [same, different]
    simpa only [exactLiveOccurrence, census] using live
  apply runtimePositionValid_scope_removal_frame program expectedInstanceId instanceId before after
    valid running rfl List.filter_sublist _ rfl _ (List.Sublist.refl _) _
  · change (before.scopeOccurrences.filter _).filter _ = _
    rw [List.filter_filter]
    apply List.filter_congr
    intro occurrence present
    by_cases same : occurrence.id = root.id
    · have selected : occurrence ∈ before.scopeOccurrences.filter (fun candidate => decide (candidate.id = root.id)) :=
        List.mem_filter.mpr ⟨present, decide_eq_true same⟩
      rw [singleton] at selected
      have equal : occurrence = root := (List.mem_singleton.mp selected).trans rootEq.symm
      cases shape : root.parent <;> simp_all
    · simp [same]
  · intro occurrence present parent parentEq
    have prior := (List.mem_filter.mp present).1
    obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
      program expectedInstanceId instanceId before valid running occurrence prior
    rcases binding with ⟨_, parentless⟩ | ⟨owner, ownerEq, _, _, live⟩
    · simp [parentless] at parentEq
    · have equal := Option.some.inj (ownerEq.symm.trans parentEq)
      apply survives parent (equal ▸ live)
      intro same
      exact quiescent_scope_has_no_child before root.id quiescent occurrence prior (by simpa [same] using parentEq)
  · intro token present
    exact survives token.owner
      (runtimePositionValid_token_owner_live program expectedInstanceId instanceId before token valid running present)
      (quiescent_scope_has_no_token before root.id quiescent token present)

/-- Child completion composes the actual quiescent removal with one correctly bound parent token. -/
theorem completeScopeState_child_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (scopeId : DefinitionScopeId)
    (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) (output : ControlPlaceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (unique : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root])
    (parentEq : root.parent = some parent)
    (placeDeclared : ∃ declared, program.controlPlaces.filter (fun candidate => decide (candidate.id = output)) = [declared])
    (placeOwner : program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = output)) =
      [{ controlPlaceId := output, scopeId := parent.definitionScopeId }])
    (result : completeScopeState? before scopeId (some output) = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  have rootIn : root ∈ before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) := by
    rw [unique]; simp
  have member := (List.mem_filter.mp rootIn).1
  have selected := completeScopeState_selected_update before after scopeId (some output) root unique result
  obtain ⟨quiescent, update⟩ := selected
  have result := update
  simp only [parentEq, running] at result
  have finish : runtimePositionValid program expectedInstanceId after = true := by
    split at result
    · simp only [Option.some.injEq] at result
      subst after
      let removed := { before with scopeOccurrences := before.scopeOccurrences.filter fun candidate => decide (candidate.id ≠ root.id) }
      have removedValid := quiescent_child_removal_preserves_position program before expectedInstanceId instanceId
        valid running root member (by simp [parentEq]) quiescent
      have parentLive : exactLiveOccurrence removed parent = true := by
        obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
          program expectedInstanceId instanceId before valid running root member
        rcases binding with ⟨_, parentless⟩ | ⟨owner, ownerEq, _, _, live⟩
        · simp [parentless] at parentEq
        · have equal := Option.some.inj (ownerEq.symm.trans parentEq)
          have different : parent ≠ root.id := by
            intro same
            exact quiescent_scope_has_no_child before root.id quiescent root member (by simpa [same] using parentEq)
          have census : removed.scopeOccurrences.filter (fun candidate => decide (candidate.id = parent)) =
              before.scopeOccurrences.filter (fun candidate => decide (candidate.id = parent)) := by
            change (before.scopeOccurrences.filter _).filter _ = _
            rw [List.filter_filter]
            apply List.filter_congr
            intro candidate _
            by_cases same : candidate.id = parent <;> simp [same, different]
          simpa only [exactLiveOccurrence, census, equal] using live
      simpa only [removed, running] using runtimePositionValid_addToken program expectedInstanceId removed output parent
        removedValid parentLive placeDeclared placeOwner
    · simp at result
  exact finish

/-- Root completion reaches the terminal position using predecessor-derived empty tokens;
it does not assume that clearing the scope list makes an arbitrary state valid. -/
theorem completeScopeState_hosting_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (unique : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root])
    (parentless : root.parent = none) (hosting : root.id.processInstanceId = instanceId)
    (result : completeScopeState? before scopeId none = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  have rootIn : root ∈ before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) := by
    rw [unique]; simp
  have member := (List.mem_filter.mp rootIn).1
  obtain ⟨quiescent, update⟩ := completeScopeState_selected_update before after scopeId none root unique result
  have result := update
  simp only [parentless, running] at result
  have finish : runtimePositionValid program expectedInstanceId after = true := by
    split at result
    · simp at result
    · simp only [Option.some.injEq] at result
      subst after
      have empty := (quiescent_hosting_root_position_fields program before expectedInstanceId instanceId
        valid running root member parentless hosting quiescent).2.1
      have identity := runtimePositionValid_running_instance program expectedInstanceId instanceId before valid running
      simp only [runtimePositionValid, Bool.and_eq_true] at valid
      change ((_ && _) && (decide (instanceId = expectedInstanceId) && ([] : List RuntimeScopeOccurrence).isEmpty && before.tokens.isEmpty)) = true
      simp only [valid.1.1, valid.1.2, identity, empty, List.isEmpty_nil, decide_true, Bool.true_and]
  exact finish

theorem completeBoundedScope_position_fields (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (result : completeBoundedScope? program before scopeId parentOutput = some after) :
    ∃ ordinary, completeScopeState? before scopeId parentOutput = some ordinary ∧
      after.control = ordinary.control ∧ after.scopeOccurrences = ordinary.scopeOccurrences ∧
      after.calledProcessOccurrences = ordinary.calledProcessOccurrences ∧ after.tokens = ordinary.tokens := by
  unfold completeBoundedScope? at result
  split at result
  · simp at result
  · rename_i ordinary completed
    refine ⟨ordinary, completed, ?_⟩
    repeat' split at result
    all_goals
      first
        | (simp at result; done)
        | (simp only [Option.some.injEq] at result
           subst after
           exact ⟨rfl, rfl, rfl, rfl⟩)

theorem completeSelectedScope_ordinary_withdrawal (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (result : completeSelectedScope? program before scopeId parentOutput = some after) :
    ∃ ordinary, completeScopeState? before scopeId parentOutput = some ordinary ∧
      ∃ timers activities, after = { ordinary with timerWaits := timers, activityOccurrences := activities } := by
  unfold completeSelectedScope? at result
  split at result
  · unfold completeMonitoredScope? at result
    obtain ⟨pair, _, result⟩ := Option.bind_eq_some_iff.mp result
    split at result
    · obtain ⟨ordinary, completed, result⟩ := Option.bind_eq_some_iff.mp result
      cases result
      exact ⟨ordinary, completed, _, _, rfl⟩
    · contradiction
  · unfold completeBoundedScope? at result
    cases ordinary : completeScopeState? before scopeId parentOutput with
    | none => simp [ordinary] at result
    | some completed =>
        simp only [ordinary] at result
        repeat' split at result
        all_goals first
          | (simp at result; done)
          | (simp only [Option.some.injEq] at result; subst after; exact ⟨completed, rfl, _, _, rfl⟩)

theorem completeSelectedScope_position_fields (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (result : completeSelectedScope? program before scopeId parentOutput = some after) :
    ∃ ordinary, completeScopeState? before scopeId parentOutput = some ordinary ∧
      after.control = ordinary.control ∧ after.scopeOccurrences = ordinary.scopeOccurrences ∧
      after.calledProcessOccurrences = ordinary.calledProcessOccurrences ∧ after.tokens = ordinary.tokens := by
  obtain ⟨ordinary, completed, _, _, rfl⟩ :=
    completeSelectedScope_ordinary_withdrawal program before after scopeId parentOutput result
  exact ⟨ordinary, completed, rfl, rfl, rfl, rfl⟩

/-- Bounded completion's mandatory Activity/deadline withdrawal preserves the child continuation
position established by actual ordinary completion, including the unbounded passthrough case. -/
theorem completeBoundedScope_child_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (scopeId : DefinitionScopeId)
    (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) (output : ControlPlaceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (unique : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root])
    (parentEq : root.parent = some parent)
    (placeDeclared : ∃ declared, program.controlPlaces.filter (fun candidate => decide (candidate.id = output)) = [declared])
    (placeOwner : program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = output)) =
      [{ controlPlaceId := output, scopeId := parent.definitionScopeId }])
    (result : completeBoundedScope? program before scopeId (some output) = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨ordinary, completed, control, scopes, calls, tokens⟩ :=
    completeBoundedScope_position_fields program before after scopeId (some output) result
  apply runtimePositionValid_tokens_sublist_frame program expectedInstanceId ordinary after
    (completeScopeState_child_preserves_position program before ordinary expectedInstanceId instanceId scopeId
      root parent output valid running unique parentEq placeDeclared placeOwner completed) control scopes calls
  rw [tokens]
  exact List.Sublist.refl _

/-- The bounded wrapper also preserves hosting-root completion's terminal position whenever its
actual selection succeeds; the proof does not bypass missing-pair refusal. -/
theorem completeBoundedScope_hosting_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (unique : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root])
    (parentless : root.parent = none) (hosting : root.id.processInstanceId = instanceId)
    (result : completeBoundedScope? program before scopeId none = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨ordinary, completed, control, scopes, calls, tokens⟩ :=
    completeBoundedScope_position_fields program before after scopeId none result
  apply runtimePositionValid_tokens_sublist_frame program expectedInstanceId ordinary after
    (completeScopeState_hosting_preserves_position program before ordinary expectedInstanceId instanceId scopeId
      root valid running unique parentless hosting completed) control scopes calls
  rw [tokens]
  exact List.Sublist.refl _

end BpmnSemantics.SemanticProcess
