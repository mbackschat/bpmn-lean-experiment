import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies

/-! Selectors require exact singleton censuses, not membership alone. Footprint-protected scopes and Call records retain both the selected member and the absence of competitors. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regional_pair_retained_singleton {α : Type} (values : List α) (keep names : α → Bool)
    (value : α) (census : values.filter names = [value]) (kept : keep value = true) :
    (values.filter keep).filter names = [value] := by
  have commute : (values.filter keep).filter names = (values.filter names).filter keep := by
    simp only [List.filter_filter, Bool.and_comm]
  simp [commute, census, kept]

private theorem retained_census {α : Type} (values : List α) (keep names : α → Bool)
    (kept : ∀ value ∈ values, names value = true → keep value = true) :
    (values.filter keep).filter names = values.filter names := by
  apply allMatchingRetained_preserves_census
  apply List.all_eq_true.mpr
  intro value member
  cases named : names value <;> simp [named, kept value member]

/-- Regional deletion preserves a selector when its retained singleton witnesses and input
queries survive. Unlike insertion frames, this permits the scope and Call tables to shrink. -/
theorem regionalSelection_filter_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (keepScope : RuntimeScopeOccurrence → Bool) (keepCall : CalledProcessOccurrence → Bool)
    (found : selectInternalRegional? program before operation = some selected)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter keepScope)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences.filter keepCall)
    (associations : calledProcessAssociationsValid after = true)
    (pending : after.initiationPending = before.initiationPending)
    (rootKept : keepScope selected.root = true)
    (parentKept : ∀ parent, selected.root.parent = some parent →
      ∀ scope ∈ before.scopeOccurrences, scope.id = parent → keepScope scope = true)
    (callKept : match (generalizing := false) selected.kind with
      | .returning record => keepCall record = true ∧
          ∀ scope ∈ before.scopeOccurrences, scope.id = record.caller → keepScope scope = true
      | _ => True)
    (quiet : scopeQuiescent before selected.root.id = true → scopeQuiescent after selected.root.id = true)
    (withdrawal : match (generalizing := false) operation with
      | .completeScope _ _ definition output => ∀ choice,
          selectSubscribedCompletionWithdrawal? program before definition output = some choice →
          selectSubscribedCompletionWithdrawal? program after definition output = some choice
      | _ => True)
    (inputs : match (generalizing := false) operation with
      | .throwError _ _ input _ _ =>
          onlyTokenOwner? after input = onlyTokenOwner? before input ∧
          after.tokens.filter (fun token => decide (token.placeId = input && token.owner = selected.root.id)) =
            before.tokens.filter (fun token => decide (token.placeId = input && token.owner = selected.root.id))
      | .terminateScope id origin input definition =>
          selectedTerminateOwner? program after id origin input definition =
            selectedTerminateOwner? program before id origin input definition
      | _ => True) :
    selectInternalRegional? program after operation = some selected := by
  have running : runningInstance? after = runningInstance? before := by
    simp only [runningInstance?, control]
  unfold selectInternalRegional? at found ⊢
  obtain ⟨hosting, hosted, found⟩ := Option.bind_eq_some_iff.mp found
  rw [running, hosted]
  dsimp only [Option.bind_some]
  cases operation with
  | returnProcess id origin process definition output =>
      dsimp only at found ⊢
      repeat' first | (solve | simp at found) | split at found
      all_goals
        rename_i valid _ record returnCensus processEq definitionEq _ root rootCensus parentless callerCount processCount quiescent
        cases found
        have rootIdentity := scope_identity_of_census before record.calledRoot root rootCensus
        have rootPresent : root ∈ before.scopeOccurrences :=
          (List.mem_filter.mp (show root ∈ before.scopeOccurrences.filter
            (fun scope => decide (scope.id = record.calledRoot)) by simp [rootCensus])).1
        have rootAfter := regional_pair_retained_singleton _ keepScope _ root rootCensus rootKept
        have callAfter := regional_pair_retained_singleton _ keepCall _ record returnCensus callKept.1
        have callerAfter := retained_census before.scopeOccurrences keepScope
          (fun scope => decide (scope.id = record.caller)) (by
            intro scope member named
            exact callKept.2 scope member (of_decide_eq_true named))
        obtain ⟨processRoot, processCensus⟩ := List.length_eq_one_iff.mp processCount
        have sameRoot : root = processRoot := by
          have member : root ∈ before.scopeOccurrences.filter (fun scope => decide (
              scope.id.processInstanceId = record.calledRoot.processInstanceId && scope.parent.isNone)) :=
            List.mem_filter.mpr ⟨rootPresent, by simp [rootIdentity, parentless]⟩
          have singleton : root ∈ [processRoot] := by
            rw [← processCensus]
            exact member
          exact List.mem_singleton.mp singleton
        subst processRoot
        have processAfter := regional_pair_retained_singleton _ keepScope _ root processCensus rootKept
        simp_all only [↓reduceIte, List.length_singleton]
  | completeScope id origin definition output =>
      dsimp only at found ⊢
      split at found
      · rename_i root census
        split at found
        · contradiction
        · rename_i notBusy
          have priorQuiet : scopeQuiescent before root.id = true := by simpa using notBusy
          obtain ⟨choice, chosen, found⟩ := Option.bind_eq_some_iff.mp found
          have afterChoice := withdrawal choice chosen
          repeat' first | (solve | simp at found) | split at found
          all_goals
            cases found
            have afterQuiet := quiet priorQuiet
            have rootAfter := regional_pair_retained_singleton _ keepScope _ root census rootKept
            have parentAfter : ∀ parent, root.parent = some parent →
                after.scopeOccurrences.any (fun scope => scope.id == parent) =
                  before.scopeOccurrences.any (fun scope => scope.id == parent) := by
              intro parent parentEq
              rw [scopes]
              apply Bool.eq_iff_iff.mpr
              simp only [List.any_eq_true, List.mem_filter]
              constructor
              · rintro ⟨scope, ⟨member, _⟩, named⟩
                exact ⟨scope, member, named⟩
              · rintro ⟨scope, member, named⟩
                exact ⟨scope, ⟨member, parentKept parent parentEq scope member (by simpa using named)⟩, named⟩
            simp_all only [Bool.false_eq_true, ↓reduceIte, Option.bind_eq_bind, Option.bind_some]
      · contradiction
  | throwError id origin input error handler =>
      dsimp only at found ⊢
      rw [inputs.1]
      obtain ⟨owner, offered, found⟩ := Option.bind_eq_some_iff.mp found
      rw [offered]
      split at found
      · contradiction
      · split at found
        · contradiction
        · split at found
          · rename_i root census
            obtain ⟨parent, parentFound, found⟩ := Option.bind_eq_some_iff.mp found
            split at found
            · cases found
              have identity := scope_identity_of_census before owner root census
              rw [identity] at inputs
              have rootAfter := regional_pair_retained_singleton _ keepScope _ root census rootKept
              have parentAfter := retained_census before.scopeOccurrences keepScope
                (fun scope => decide (scope.id = parent)) (by
                  intro scope member named
                  exact parentKept parent parentFound scope member (of_decide_eq_true named))
              simp_all only [Option.bind_eq_bind, Option.bind_some, ↓reduceIte]
            · contradiction
          · contradiction
  | terminateScope id origin input definition =>
      dsimp only at found ⊢
      rw [inputs]
      obtain ⟨owner, chosen, found⟩ := Option.bind_eq_some_iff.mp found
      rw [chosen]
      split at found
      · rename_i root census
        cases found
        have rootAfter := regional_pair_retained_singleton _ keepScope _ root census rootKept
        simp only [Option.bind_eq_bind, Option.bind_some, scopes, rootAfter]
      · contradiction
  | _ => contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
