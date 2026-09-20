import BpmnSemantics.SemanticProcess.InternalRegionalCompletionSelection
import BpmnSemantics.SemanticProcess.InternalRegionalErrorPositionValidity

/-! # Regional predecessor selection

The Internal Commutation preparation retains exact Return, Complete, Error, and Terminate
occurrences before deriving removal masks. Selection performs no runtime transition.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalRegionalKind where
  | returning (record : CalledProcessOccurrence)
  | completing (withdrawal : InternalCompletionWithdrawal)
  | interrupting (parent : ScopeOccurrenceId)
  | terminating
  deriving Repr, DecidableEq

structure InternalRegionalSelection where
  operation : SemanticOperation
  root : RuntimeScopeOccurrence
  kind : InternalRegionalKind
  deriving Repr, DecidableEq

def selectInternalRegional? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option InternalRegionalSelection :=
  (runningInstance? state).bind fun _ => do
  match operation with
  | .returnProcess id origin process definition _ =>
      if calledProcessAssociationsValid state then
        match state.calledProcessOccurrences.filter (fun record =>
            decide (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) with
        | [record] =>
            if record.calledProcessId = process then
              if record.calledRoot.definitionScopeId = definition then
                match state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = record.calledRoot)) with
                | [root] =>
                    if root.parent.isNone then
                      if (state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = record.caller))).length = 1 then
                        if (state.scopeOccurrences.filter (fun occurrence => decide (
                            occurrence.id.processInstanceId = record.calledRoot.processInstanceId &&
                            occurrence.parent.isNone))).length = 1 then
                          if scopeQuiescent state root.id then
                            some { operation, root, kind := .returning record }
                          else none
                        else none
                      else none
                    else none
                | _ => none
              else none
            else none
        | _ => none
      else none
  | .completeScope _ _ definition output =>
      match state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = definition)) with
      | [root] =>
          if !scopeQuiescent state root.id then none
          else do
            let withdrawal ← selectInternalCompletionWithdrawal? program state definition
            match root.parent, output with
            | none, none =>
                if state.initiationPending then none
                else some { operation, root, kind := .completing withdrawal }
            | some parent, some _ =>
                if state.scopeOccurrences.any (fun candidate => candidate.id == parent) then
                  some { operation, root, kind := .completing withdrawal }
                else none
            | _, _ => none
      | _ => none
  | .throwError _ _ input error handler => do
      let owner ← onlyTokenOwner? state input
      if (state.tokens.filter (fun token => decide (token.placeId = input && token.owner = owner))).length ≠ 1 then none
      else
      if owner.definitionScopeId ≠ handler.attachedScopeId ||
          error.code ≠ handler.code || error.errorElementId ≠ handler.origin.errorElementId then none
      else
        match state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) with
        | [root] => do
            let parent ← root.parent
            if (state.scopeOccurrences.filter (fun candidate => decide (candidate.id = parent))).length = 1 then
              some { operation, root, kind := .interrupting parent }
            else none
        | _ => none
  | .terminateScope id origin input definition => do
      let owner ← selectedTerminateOwner? program state id origin input definition
      match state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) with
      | [root] => some { operation, root, kind := .terminating }
      | _ => none
  | _ => none

/-- Exact matching Error selection remains available for arbitrary occurrence identities. -/
theorem regionalSelection_error_of_facts (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler)
    (hosting : SemanticId) (owner parent : ScopeOccurrenceId) (root : RuntimeScopeOccurrence)
    (running : state.control = .running hosting)
    (offered : onlyTokenOwner? state input = some owner)
    (singleInput : (state.tokens.filter (fun token => decide (token.placeId = input && token.owner = owner))).length = 1)
    (attached : owner.definitionScopeId = handler.attachedScopeId)
    (code : error.code = handler.code)
    (element : error.errorElementId = handler.origin.errorElementId)
    (census : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) = [root])
    (parentEq : root.parent = some parent)
    (singleParent : (state.scopeOccurrences.filter (fun candidate => decide (candidate.id = parent))).length = 1) :
    selectInternalRegional? program state (.throwError id origin input error handler) =
      some { operation := .throwError id origin input error handler
             root := root, kind := .interrupting parent } := by
  simp only [selectInternalRegional?, runningInstance?, running, Option.bind_eq_bind, Option.bind_some, offered,
    singleInput, singleParent, attached, code, element, ne_eq, not_true_eq_false, decide_false, Bool.or_false,
    Bool.false_eq_true, ↓reduceIte, census, parentEq]

/-- A retained selection includes the original operation, including its continuation fields. -/
theorem regionalSelection_operation (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected) :
    selected.operation = operation := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals
    dsimp only at found
    repeat first
      | contradiction
      | (solve | cases found <;> rfl)
      | split at found
      | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found

theorem regionalSelection_running (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected) :
    ∃ hosting, state.control = .running hosting := by
  unfold selectInternalRegional? at found
  obtain ⟨hosting, running, _⟩ := Option.bind_eq_some_iff.mp found
  cases control : state.control <;> simp [runningInstance?, control] at running
  exact ⟨_, rfl⟩

/-- The retained removal root is a predecessor occurrence, never a reconstructed scope. -/
theorem regionalSelection_root_member (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected) :
    selected.root ∈ state.scopeOccurrences := by
  have member (predicate : RuntimeScopeOccurrence → Bool) (root : RuntimeScopeOccurrence)
      (census : state.scopeOccurrences.filter predicate = [root]) : root ∈ state.scopeOccurrences := by
    have present : root ∈ state.scopeOccurrences.filter predicate := by rw [census]; simp
    exact (List.mem_filter.mp present).1
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals
    dsimp only at found
    repeat' first
      | (solve | simp at found)
      | (solve | cases found; exact member _ _ (by assumption))
      | split at found
      | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found

/-- Every running raw Return remains selectable, including arbitrary Call identity and activation. -/
theorem regionalSelection_return_complete (program : Program) (state after : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (running : state.control = .running hosting)
    (result : returnProcessState? state id origin process definition output = some after) :
    ∃ selected, selectInternalRegional? program state (.returnProcess id origin process definition output) = some selected := by
  have step := returnProcessState_sound state after id origin process definition output result
  cases step with
  | permitted record root associations uniqueReturn processMatches scopeMatches uniqueRoot
      parentless uniqueCaller uniqueProcessRoot quiescent =>
      refine ⟨{ operation := .returnProcess id origin process definition output
                root := root, kind := .returning record }, ?_⟩
      simp only [selectInternalRegional?, runningInstance?, running, Option.bind_some, associations,
        uniqueReturn, processMatches, scopeMatches, uniqueRoot, parentless, Option.isNone_none,
        uniqueCaller, uniqueProcessRoot, quiescent, ↓reduceIte]

/-- Ordinary completion plus exact bounded withdrawal is sufficient; preparation does not
silently narrow the root or child completion branch beyond that predecessor census. -/
theorem regionalSelection_completion_complete (program : Program) (state completed : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (withdrawal : InternalCompletionWithdrawal)
    (running : state.control = .running hosting)
    (withdrawn : selectInternalCompletionWithdrawal? program state definition = some withdrawal)
    (ordinary : completeScopeState? state definition output = some completed) :
    ∃ selected, selectInternalRegional? program state (.completeScope id origin definition output) = some selected := by
  unfold completeScopeState? at ordinary
  split at ordinary
  · rename_i root census
    split at ordinary
    · simp at ordinary
    · rename_i quiet
      refine ⟨{ operation := .completeScope id origin definition output
                root := root, kind := .completing withdrawal }, ?_⟩
      unfold completeQuiescentScope? at ordinary
      rw [running] at ordinary
      repeat' first | (solve | simp at ordinary) | split at ordinary
      all_goals
        simp_all only [selectInternalRegional?, runningInstance?, Option.bind_eq_bind,
          Option.bind_some, Bool.false_eq_true, ↓reduceIte]
  · simp at ordinary

theorem regionalSelection_termination_of_facts (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (definition : DefinitionScopeId) (owner : ScopeOccurrenceId)
    (root : RuntimeScopeOccurrence) (running : state.control = .running hosting)
    (chosen : selectedTerminateOwner? program state id origin input definition = some owner)
    (census : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) = [root]) :
    selectInternalRegional? program state (.terminateScope id origin input definition) =
      some { operation := .terminateScope id origin input definition
             root := root, kind := .terminating } := by
  simp [selectInternalRegional?, runningInstance?, running, chosen, census]

/-- A unique owner does not establish the single offered token required by Error preparation. -/
theorem regionalSelection_error_duplicate_input_refused (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler) (owner : ScopeOccurrenceId)
    (offered : onlyTokenOwner? state input = some owner)
    (duplicate : (state.tokens.filter (fun token =>
      decide (token.placeId = input && token.owner = owner))).length ≠ 1) :
    selectInternalRegional? program state (.throwError id origin input error handler) = none := by
  cases control : state.control <;>
    simp_all [selectInternalRegional?, runningInstance?]

/-- Parent existence cannot hide a second occurrence carrying the same complete identity. -/
theorem regionalSelection_error_ambiguous_parent_refused (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler)
    (owner parent : ScopeOccurrenceId) (root : RuntimeScopeOccurrence)
    (offered : onlyTokenOwner? state input = some owner)
    (census : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) = [root])
    (parentEq : root.parent = some parent)
    (ambiguous : (state.scopeOccurrences.filter (fun candidate => decide (candidate.id = parent))).length ≠ 1) :
    selectInternalRegional? program state (.throwError id origin input error handler) = none := by
  cases control : state.control <;>
    simp [selectInternalRegional?, runningInstance?, control, offered, census, parentEq, ambiguous]

private theorem uniqueScope_isLive (state : RuntimeState) (owner : ScopeOccurrenceId)
    (unique : (state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner))).length = 1) :
    state.scopeOccurrences.any (fun candidate => candidate.id == owner) = true := by
  obtain ⟨candidate, census⟩ := List.length_eq_one_iff.mp unique
  have present : candidate ∈ state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = owner)) := by
    rw [census]; simp
  obtain ⟨member, identity⟩ := List.mem_filter.mp present
  exact List.any_eq_true.mpr ⟨candidate, member, by simpa using identity⟩

/-- Selection establishes actual evaluator availability without executing a speculative state.
Bounded Complete additionally retains its strict Activity and Timer census. -/
theorem regionalSelection_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (found : selectInternalRegional? program state operation = some selected) :
    ∃ after, fire? program operation state = some after := by
  obtain ⟨hosting, running⟩ := regionalSelection_running program state operation selected found
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  unfold fire?
  rw [snapshotAbsent]
  cases operation with
  | returnProcess id origin process definition output =>
      dsimp only at found
      change ∃ after, returnProcessState? state id origin process definition output = some after
      unfold returnProcessState?
      repeat' first | (solve | simp at found) | split at found
      all_goals
        first
          | (simp at found; done)
          | (simp only [*, ↓reduceIte]; exact ⟨_, rfl⟩)
  | completeScope id origin definition output =>
      dsimp only at found
      change ∃ after, completeBoundedScope? program state definition output = some after
      split at found
      · rename_i root census
        split at found
        · contradiction
        · rename_i quiet
          simp only [Option.bind_eq_bind] at found
          obtain ⟨withdrawal, withdrawn, found⟩ := Option.bind_eq_some_iff.mp found
          have ordinary : ∃ completed, completeScopeState? state definition output = some completed := by
            simp only [completeScopeState?, census, quiet, completeQuiescentScope?, running]
            repeat' first | (solve | simp at found) | split at found
            all_goals simp_all only [Option.bind_eq_bind, Option.bind_some, Bool.false_eq_true, ↓reduceIte]
            all_goals exact ⟨_, rfl⟩
          obtain ⟨completed, ordinary⟩ := ordinary
          obtain ⟨after, result, _⟩ := completionWithdrawal_refines program state completed definition output withdrawal withdrawn ordinary
          exact ⟨after, result⟩
      · contradiction
  | throwError id origin input error handler =>
      dsimp only at found
      change ∃ after, throwErrorState? state input error handler = some after
      obtain ⟨owner, offered, found⟩ := Option.bind_eq_some_iff.mp found
      simp only [throwErrorState?, offered, runningInstance?, running, Option.bind_eq_bind, Option.bind_some]
      repeat' first | (solve | simp at found) | split at found
      all_goals
        first
          | (simp at found; done)
          | (obtain ⟨parent, parentEq, found⟩ := Option.bind_eq_some_iff.mp found
             repeat' first | (solve | simp at found) | split at found
             all_goals have live := uniqueScope_isLive state parent (by assumption)
             all_goals simp_all only [Option.bind_eq_bind, Option.bind_some,
               Bool.false_eq_true, ↓reduceIte]
             all_goals exact ⟨_, rfl⟩)
  | terminateScope id origin input definition =>
      dsimp only at found
      change ∃ after, terminateScopeState? program state id origin input definition = some after
      obtain ⟨owner, chosen, _⟩ := Option.bind_eq_some_iff.mp found
      simp [terminateScopeState?, chosen]
  | _ => contradiction

/-- Checked predecessor position and structural occurrence validity suffice for every selected
declared regional operation; no intermediate position predicate is assumed. -/
theorem regionalSelection_preserves_position (program : Program) (state : RuntimeState)
    (expectedInstanceId : SemanticId) (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (declared : operation ∈ program.operations)
    (found : selectInternalRegional? program state operation = some selected) :
    ∃ after, fire? program operation state = some after ∧
      runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨hosting, running⟩ := regionalSelection_running program state operation selected found
  obtain ⟨after, result⟩ := regionalSelection_refines program state operation selected snapshotAbsent found
  refine ⟨after, result, ?_⟩
  unfold fire? at result
  rw [snapshotAbsent] at result
  cases operation with
  | returnProcess id origin process definition output =>
      exact declaredReturn_preserves_position program state after expectedInstanceId hosting id origin process definition output
        valid structural running declared result
  | completeScope id origin definition output =>
      exact declaredBoundedComplete_preserves_position program state after expectedInstanceId hosting id origin definition output
        valid structural running declared result
  | throwError id origin input error handler =>
      exact declaredError_preserves_position program state after expectedInstanceId hosting id origin input error handler
        valid running declared result
  | terminateScope id origin input definition =>
      exact terminateScopeState_preserves_position program state after expectedInstanceId id origin input definition
        valid result
  | _ => simp [selectInternalRegional?] at found

end BpmnSemantics.SemanticProcess.InternalCommutation
