import BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention

/-! Both local-control and arming patches preserve scope and Call records. Their regional
selector proofs share this read interface, with each caller deriving the changed-work queries. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regionalSelection_read_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program before operation = some selected)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (pending : after.initiationPending = before.initiationPending)
    (quiet : scopeQuiescent after selected.root.id = scopeQuiescent before selected.root.id)
    (withdrawal : ∀ definition output choice, selectSubscribedCompletionWithdrawal? program before definition output = some choice →
      selectSubscribedCompletionWithdrawal? program after definition output = some choice)
    (inputs : match operation with
      | .throwError _ _ input _ _ =>
          onlyTokenOwner? after input = onlyTokenOwner? before input ∧
          after.tokens.filter (fun token => decide (token.placeId = input && token.owner = selected.root.id)) =
            before.tokens.filter (fun token => decide (token.placeId = input && token.owner = selected.root.id))
      | .terminateScope id origin input definition =>
          selectedTerminateOwner? program after id origin input definition =
            selectedTerminateOwner? program before id origin input definition
      | _ => True) :
    selectInternalRegional? program after operation = some selected := by
  have running : runningInstance? after = runningInstance? before := by simp only [runningInstance?, control]
  have associations := calledProcessAssociationsValid_frame before after control scopes calls
  unfold selectInternalRegional? at found ⊢
  obtain ⟨hosting, hosted, found⟩ := Option.bind_eq_some_iff.mp found
  rw [running, hosted]
  dsimp only [Option.bind_some]
  cases operation with
  | returnProcess id origin process definition output =>
    dsimp only at found ⊢
    rw [associations, calls, scopes]
    repeat' first | (solve | simp at found) | split at found
    all_goals cases found <;> simp_all only [↓reduceIte]
  | completeScope id origin definition output =>
    dsimp only at found ⊢
    rw [scopes]
    split at found
    · split at found
      · contradiction
      · obtain ⟨choice, chosen, found⟩ := Option.bind_eq_some_iff.mp found
        have afterChoice := withdrawal definition output choice chosen
        repeat' first | (solve | simp at found) | split at found
        all_goals cases found <;> simp_all only [Bool.false_eq_true, ↓reduceIte, Option.bind_eq_bind, Option.bind_some]
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
            simp_all only [Option.bind_eq_bind, Option.bind_some, ↓reduceIte]
          · contradiction
        · contradiction
  | terminateScope id origin input definition =>
    dsimp only at found ⊢
    simpa only [inputs, scopes] using found
  | _ => contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
