import BpmnSemantics.SemanticProcess.InternalRegionalCompletionRetention
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionAdmission

/-! # Bounded completion withdrawal selection

Regional preparation retains the exact predecessor Activity and Timer before ordinary completion
removes their child. REG-OWN-CLOSE-01 adds no Activity-to-Program binding: the Lean runtime
representation deliberately carries no TypeScript operation-id field.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def boundedCompletionDeclarations (program : Program) (scopeId : DefinitionScopeId) :
    List BoundaryTimerArm :=
  program.operations.filterMap fun
    | .enterBoundedScope _ _ _ _ child timer =>
        if child = scopeId then some timer else none
    | _ => none

inductive InternalCompletionWithdrawal where
  | unbounded
  | bounded (record : ActivityOccurrence) (deadline : TimerWait)
  deriving Repr, DecidableEq

def selectInternalCompletionWithdrawal? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Option InternalCompletionWithdrawal :=
  match boundedCompletionDeclarations program scopeId with
  | [] => some .unbounded
  | [declaration] =>
      match state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) with
      | [child] => do
          let parent ← child.parent
          let record ← activityOccurrenceForScope? state.activityOccurrences child.id
          if record.owner ≠ parent then none
          else
            match record.attachedHandlers with
            | [.timer attached] =>
                if attached.elementId.value ≠ declaration.elementId.value then none
                else
                  match state.timerWaits.filter (timerIdNamesWait attached) with
                  | [deadline] => if deadline.owner = parent then some (.bounded record deadline) else none
                  | _ => none
            | _ => none
      | _ => none
  | _ => none

/-- A first matching declaration cannot hide a second entry for the same child definition. -/
theorem completionWithdrawal_ambiguous_declarations_refused (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (first second : BoundaryTimerArm) (rest : List BoundaryTimerArm)
    (ambiguous : boundedCompletionDeclarations program scopeId = first :: second :: rest) :
    selectInternalCompletionWithdrawal? program state scopeId = none := by
  simp [selectInternalCompletionWithdrawal?, ambiguous]

private theorem boundedCompletionDeclarations_lookup (program : Program) (scopeId : DefinitionScopeId) :
    boundedScopeDefinitionForChild? program scopeId =
      (boundedCompletionDeclarations program scopeId).head?.map (fun declaration => (scopeId, declaration)) := by
  unfold boundedScopeDefinitionForChild? boundedScopeOperations boundedCompletionDeclarations
  generalize program.operations = operations
  induction operations with
  | nil => rfl
  | cons operation rest ih =>
      cases operation <;> simp_all only [List.filterMap_cons, List.find?_cons]
      rename_i child timer
      by_cases equal : child = scopeId <;> simp_all

/-- Every exact bounded predecessor is accepted, including arbitrary Process and activation
identities; the ambiguity and ownership guards cannot be replaced by blanket refusal. -/
theorem completionWithdrawal_bounded_of_facts (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (declaration : BoundaryTimerArm)
    (child : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) (record : ActivityOccurrence)
    (attached : OccurrenceId) (deadline : TimerWait)
    (declarations : boundedCompletionDeclarations program scopeId = [declaration])
    (children : state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [child])
    (parentEq : child.parent = some parent)
    (found : activityOccurrenceForScope? state.activityOccurrences child.id = some record)
    (ownerEq : record.owner = parent)
    (handlers : record.attachedHandlers = [.timer attached])
    (timerElement : attached.elementId.value = declaration.elementId.value)
    (waits : state.timerWaits.filter (timerIdNamesWait attached) = [deadline])
    (deadlineOwner : deadline.owner = parent) :
    selectInternalCompletionWithdrawal? program state scopeId = some (.bounded record deadline) := by
  simp [selectInternalCompletionWithdrawal?, declarations, children, parentEq, found, ownerEq,
    handlers, timerElement, waits, deadlineOwner]

/-- Absence of a bounded declaration gives exactly the ordinary completion branch. -/
theorem completionWithdrawal_unbounded (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (absent : boundedCompletionDeclarations program scopeId = []) :
    selectInternalCompletionWithdrawal? program state scopeId = some .unbounded ∧
      boundedScopeDefinitionForChild? program scopeId = none := by
  simp [selectInternalCompletionWithdrawal?, boundedCompletionDeclarations_lookup, absent]

theorem completionWithdrawal_bounded_facts (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (record : ActivityOccurrence) (deadline : TimerWait)
    (selected : selectInternalCompletionWithdrawal? program state scopeId = some (.bounded record deadline)) :
    ∃ declaration child parent attached,
      boundedCompletionDeclarations program scopeId = [declaration] ∧
      state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [child] ∧
      child.parent = some parent ∧
      activityOccurrenceForScope? state.activityOccurrences child.id = some record ∧
      record.owner = parent ∧
      record.attachedHandlers = [.timer attached] ∧ attached.elementId.value = declaration.elementId.value ∧
      state.timerWaits.filter (timerIdNamesWait attached) = [deadline] ∧ deadline.owner = parent := by
  unfold selectInternalCompletionWithdrawal? at selected
  split at selected
  · simp at selected
  · rename_i declaration declarations
    split at selected
    · rename_i child children
      obtain ⟨parent, parentEq, selected⟩ := Option.bind_eq_some_iff.mp selected
      obtain ⟨actual, actualFound, selected⟩ := Option.bind_eq_some_iff.mp selected
      split at selected
      · contradiction
      · rename_i identity
        split at selected
        · rename_i attached handlers
          split at selected
          · contradiction
          · rename_i element
            split at selected
            · split at selected
              · cases selected
                refine ⟨declaration, child, parent, attached, declarations, children, parentEq, actualFound,
                  ?_, handlers, ?_, by assumption, by assumption⟩ <;> simp_all
              · contradiction
            · contradiction
        · contradiction
    · contradiction
  · contradiction

/-- The selected Activity must name this exact child; a same-element record is insufficient. -/
theorem completionWithdrawal_body (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (record : ActivityOccurrence) (deadline : TimerWait)
    (selected : selectInternalCompletionWithdrawal? program state scopeId = some (.bounded record deadline)) :
    ∃ child parent, record.body = .childScope child ∧
      boundedScopeChildOccurrence? state scopeId = some (child, parent) := by
  obtain ⟨declaration, child, parent, attached, _, children, parentEq, found, _⟩ :=
    completionWithdrawal_bounded_facts program state scopeId record deadline selected
  have body : record.body = .childScope child.id := by
    unfold activityOccurrenceForScope? at found
    split at found
    · rename_i actual census
      cases found
      have present : record ∈ state.activityOccurrences.filter (fun candidate => activityBodyScope? candidate == some child.id) := by
        rw [census]; simp
      have bodyEq := (List.mem_filter.mp present).2
      cases shape : record.body <;> simp_all [activityBodyScope?, beq_iff_eq]
    · contradiction
  refine ⟨child.id, parent, body, ?_⟩
  simp [boundedScopeChildOccurrence?, ← List.head?_filter, children, parentEq]

/-- The exact single Timer census discharges the raw helper's first-match lookups. -/
theorem completionWithdrawal_raw_selection (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (record : ActivityOccurrence) (deadline : TimerWait)
    (selected : selectInternalCompletionWithdrawal? program state scopeId = some (.bounded record deadline)) :
    ∃ declaration child parent,
      boundedScopeDefinitionForChild? program scopeId = some (scopeId, declaration) ∧
      boundedScopeChildOccurrence? state scopeId = some (child, parent) ∧
      parentOwnedDeadline? state child parent declaration = some deadline ∧ record.body = .childScope child := by
  obtain ⟨declaration, child, parent, attached, declarations, children, parentEq, recordFound,
    ownerEq, handlers, timerElement, waits, deadlineOwner⟩ :=
      completionWithdrawal_bounded_facts program state scopeId record deadline selected
  have childFound : boundedScopeChildOccurrence? state scopeId = some (child.id, parent) := by
    simp [boundedScopeChildOccurrence?, ← List.head?_filter, children, parentEq]
  obtain ⟨bodyChild, bodyParent, body, bodyFound⟩ := completionWithdrawal_body program state scopeId record deadline selected
  rw [childFound] at bodyFound
  cases bodyFound
  refine ⟨declaration, child.id, parent, ?_, childFound, ?_, body⟩
  · simp [boundedCompletionDeclarations_lookup, declarations]
  · have namesElement (wait : TimerWait) (names : timerIdNamesWait attached wait = true) :
        wait.elementId = declaration.elementId := by
      simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
      have values := names.1.2.symm.trans timerElement
      exact congrArg NodeId.mk values
    unfold parentOwnedDeadline?
    rw [recordFound]
    simp only [ActivityOccurrence.timerHandlerOccurrences, handlers, List.filterMap_cons, List.filterMap_nil,
      List.find?_cons, timerElement, decide_true]
    rw [← List.head?_filter]
    have sameFilter : state.timerWaits.filter (fun wait => timerIdNamesWait attached wait &&
        decide (wait.elementId = declaration.elementId) && decide (wait.owner = parent)) =
        state.timerWaits.filter (fun wait => timerIdNamesWait attached wait && decide (wait.owner = parent)) := by
      apply List.filter_congr
      intro wait _
      by_cases names : timerIdNamesWait attached wait = true
      · simp [names, namesElement wait names]
      · simp [Bool.eq_false_iff.mpr names]
    have separated : state.timerWaits.filter (fun wait => timerIdNamesWait attached wait && decide (wait.owner = parent)) =
        (state.timerWaits.filter (timerIdNamesWait attached)).filter (fun wait => decide (wait.owner = parent)) := by
      simp only [List.filter_filter, Bool.and_comm]
    rw [sameFilter, separated, waits]
    simp [deadlineOwner]

/-- Timer identity is counted before owner filtering, so a wrong-owner alias cannot be hidden. -/
theorem completionWithdrawal_duplicate_timer_refused (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (declaration : BoundaryTimerArm)
    (child : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) (record : ActivityOccurrence)
    (attached : OccurrenceId) (first second : TimerWait) (rest : List TimerWait)
    (declarations : boundedCompletionDeclarations program scopeId = [declaration])
    (children : state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [child])
    (parentEq : child.parent = some parent)
    (found : activityOccurrenceForScope? state.activityOccurrences child.id = some record)
    (handlers : record.attachedHandlers = [.timer attached])
    (duplicate : state.timerWaits.filter (timerIdNamesWait attached) = first :: second :: rest) :
    selectInternalCompletionWithdrawal? program state scopeId = none := by
  simp [selectInternalCompletionWithdrawal?, declarations, children, parentEq, found, handlers, duplicate]

theorem completionWithdrawal_unbounded_facts (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId)
    (selected : selectInternalCompletionWithdrawal? program state scopeId = some .unbounded) :
    boundedCompletionDeclarations program scopeId = [] := by
  unfold selectInternalCompletionWithdrawal? at selected
  split at selected
  · assumption
  · split at selected
    · obtain ⟨parent, _, selected⟩ := Option.bind_eq_some_iff.mp selected
      obtain ⟨record, _, selected⟩ := Option.bind_eq_some_iff.mp selected
      repeat first | split at selected | (solve | simp at selected)
    · contradiction
  · contradiction

/-- Selection and actual ordinary completion compose into the unchanged bounded evaluator.
This derives the update, rather than comparing two assumed successful successor states. -/
theorem completionWithdrawal_refines (program : Program) (before completed : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId) (withdrawal : InternalCompletionWithdrawal)
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (ordinary : completeScopeState? before scopeId output = some completed) :
    ∃ after, completeBoundedScope? program before scopeId output = some after ∧
      (match (generalizing := false) withdrawal with
      | .unbounded => after = completed
      | .bounded record deadline => after =
          { completed with
            timerWaits := completed.timerWaits.erase deadline
            activityOccurrences := completed.activityOccurrences.filter (fun candidate => !decide (candidate.body = record.body)) }) := by
  cases withdrawal with
  | unbounded =>
      have absent := (completionWithdrawal_unbounded program before scopeId
        (completionWithdrawal_unbounded_facts program before scopeId selected)).2
      exact ⟨completed, by simp [completeBoundedScope?, ordinary, absent], rfl⟩
  | bounded record deadline =>
      obtain ⟨declaration, child, parent, definitionFound, childFound, deadlineFound, body⟩ :=
        completionWithdrawal_raw_selection program before scopeId record deadline selected
      refine ⟨_, ?_, rfl⟩
      simp [completeBoundedScope?, ordinary, definitionFound, childFound, deadlineFound, body]

/-- The admitted completion law now applies to the predecessor-selected bounded withdrawal. -/
theorem completionWithdrawal_preserves_position (program : Program) (before completed : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId) (withdrawal : InternalCompletionWithdrawal)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running instanceId)
    (operation : .completeScope id origin scopeId output ∈ program.operations)
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (ordinary : completeScopeState? before scopeId output = some completed) :
    ∃ after, completeBoundedScope? program before scopeId output = some after ∧
      runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨after, result, _⟩ := completionWithdrawal_refines program before completed scopeId output withdrawal selected ordinary
  exact ⟨after, result, declaredBoundedComplete_preserves_position program before after expectedInstanceId instanceId
    id origin scopeId output valid structural running operation result⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
