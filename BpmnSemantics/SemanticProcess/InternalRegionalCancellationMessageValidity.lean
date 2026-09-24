import BpmnSemantics.SemanticProcess.InternalRegionalActivityValidity
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! Message-boundary projection checks the same three-way census from each participant.
Cancellation preserves it when a matched Activity, Task, and Message share retention;
the generic census law preserves multiplicity rather than replacing counts by membership. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem nested_singleton_census_filter (left : List α) (right : List β)
    (keepLeft : α → Bool) (keepRight : β → Bool) (paired : α → β → Bool)
    (retained : ∀ a ∈ left, ∀ b ∈ right, paired a b = true →
      keepLeft a = true ∧ keepRight b = true) :
    ((left.filter keepLeft).filter fun a =>
      ((right.filter keepRight).filter (paired a)).length = 1) =
    (left.filter fun a => (right.filter (paired a)).length = 1) := by
  have inner (a : α) (member : a ∈ left) :
      (right.filter keepRight).filter (paired a) = right.filter (paired a) := by
    rw [List.filter_filter]
    apply List.filter_congr
    intro b present
    cases matched : paired a b with
    | false => simp
    | true => simp [(retained a member b present matched).2]
  rw [List.filter_filter]
  apply List.filter_congr
  intro a member
  rw [inner a member]
  by_cases singleton : (right.filter (paired a)).length = 1
  · obtain ⟨b, found⟩ := List.length_eq_one_iff.mp singleton
    have present : b ∈ right.filter (paired a) := by rw [found]; simp
    have kept := (retained a member b (List.mem_filter.mp present).1 (List.mem_filter.mp present).2).1
    simp [singleton, kept]
  · simp [singleton]

theorem triple_singleton_census_filter (tasks : List α) (messages : List β) (records : List γ)
    (keepTask : α → Bool) (keepMessage : β → Bool) (keepRecord : γ → Bool)
    (paired : γ → α → β → Bool)
    (prior : ((tasks.all fun task => (records.filter fun record =>
        (messages.filter (paired record task)).length = 1).length = 1) &&
      (messages.all fun message => (records.filter fun record =>
        (tasks.filter fun task => paired record task message).length = 1).length = 1) &&
      (records.all fun record => (tasks.filter fun task =>
        (messages.filter (paired record task)).length = 1).length = 1)) = true)
    (synchronized : ∀ record ∈ records, ∀ task ∈ tasks, ∀ message ∈ messages,
      paired record task message = true →
        keepRecord record = keepTask task ∧ keepMessage message = keepTask task) :
    (((tasks.filter keepTask).all fun task => ((records.filter keepRecord).filter fun record =>
        ((messages.filter keepMessage).filter (paired record task)).length = 1).length = 1) &&
      ((messages.filter keepMessage).all fun message => ((records.filter keepRecord).filter fun record =>
        ((tasks.filter keepTask).filter fun task => paired record task message).length = 1).length = 1) &&
      ((records.filter keepRecord).all fun record => ((tasks.filter keepTask).filter fun task =>
        ((messages.filter keepMessage).filter (paired record task)).length = 1).length = 1)) = true := by
  simp only [Bool.and_eq_true, List.all_eq_true] at prior ⊢
  refine ⟨⟨?_, ?_⟩, ?_⟩
  · intro task member
    obtain ⟨present, kept⟩ := List.mem_filter.mp member
    rw [nested_singleton_census_filter records messages keepRecord keepMessage (fun record message => paired record task message)
      (by
        intro record rm message mm matched
        obtain ⟨recordEq, messageEq⟩ := synchronized record rm task present message mm matched
        exact ⟨recordEq.trans kept, messageEq.trans kept⟩)]
    exact prior.1.1 task present
  · intro message member
    obtain ⟨present, kept⟩ := List.mem_filter.mp member
    rw [nested_singleton_census_filter records tasks keepRecord keepTask (fun record task => paired record task message)
      (by
        intro record rm task tm matched
        obtain ⟨recordEq, messageEq⟩ := synchronized record rm task tm message present matched
        exact ⟨recordEq.trans (messageEq.symm.trans kept), messageEq.symm.trans kept⟩)]
    exact prior.1.2 message present
  · intro record member
    obtain ⟨present, kept⟩ := List.mem_filter.mp member
    rw [nested_singleton_census_filter tasks messages keepTask keepMessage (paired record)
      (by
        intro task tm message mm matched
        obtain ⟨recordEq, messageEq⟩ := synchronized record present task tm message mm matched
        exact ⟨recordEq.symm.trans kept, messageEq.trans (recordEq.symm.trans kept)⟩)]
    exact prior.2 record present

theorem cancelScopeSubtree_message_projection_validity (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (unique : attachedMessagesUnambiguous state = true)
    (prior : messageBoundedProjectionValid program state = true) :
    messageBoundedProjectionValid program (cancelScopeSubtree state root disposition) = true := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  let keepTask := fun wait : UserTaskWait => !cancelled wait.owner
  let keepRecord := fun record : ActivityOccurrence => !recordInRegion cancelled record (retainedCancellationRoot root disposition)
  let keepMessage := fun wait : MessageWait => !cancelled wait.owner &&
    !activityRecordsAttachMessageWait (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)) wait
  have tasksFrame : (cancelScopeSubtree state root disposition).waits = state.waits.filter keepTask := rfl
  have messagesFrame : (cancelScopeSubtree state root disposition).messageWaits = state.messageWaits.filter keepMessage := rfl
  have recordsFrame : (cancelScopeSubtree state root disposition).activityOccurrences = state.activityOccurrences.filter keepRecord := rfl
  simp only [messageBoundedProjectionValid, List.all_eq_true] at prior ⊢
  intro operation member
  have previous := prior operation member
  let original := operation
  cases operation <;> try exact previous
  all_goals
    rename_i id origin input task boundary
    let operation := original
    let tasks := state.waits.filter fun wait =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program operation wait.owner && decide (wait.task.id = task.id)
    let messages := state.messageWaits.filter fun wait =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program operation wait.owner && decide (wait.elementId = boundary.elementId)
    let records := state.activityOccurrences.filter fun record =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program operation record.owner && decide (record.activityElementId.value = task.id.value)
    have revised := triple_singleton_census_filter tasks messages records keepTask keepMessage keepRecord _ previous (by
      intro record rm taskWait tm messageWait mm matched
      change (_ && decide _) = true at matched
      simp only [Bool.and_eq_true, decide_eq_true_eq, and_assoc] at matched
      obtain ⟨_, _, _, _, taskOwner, _, _, _, _, _, body, _, messageOwner, _, _, _, handlers⟩ := matched
      have recordMask : keepRecord record = keepTask taskWait := by
        simp only [keepRecord, keepTask, recordInRegion, body, Bool.or_false, taskOwner]
      refine ⟨recordMask, ?_⟩
      cases inside : cancelled record.owner with
      | true => simp [keepMessage, keepTask, messageOwner, taskOwner, inside]
      | false =>
          have outside : recordInRegion cancelled record (retainedCancellationRoot root disposition) = false := by simp [recordInRegion, body, inside]
          have names : anyMessageIdNamesWait record.messageHandlerOccurrences messageWait = true := by
            simp [ActivityOccurrence.messageHandlerOccurrences, handlers, anyMessageIdNamesWait, messageIdNamesWait]
          have retained := retained_message_live state root disposition record messageWait unique
            (List.mem_filter.mp rm).1 outside (List.mem_filter.mp mm).1 messageOwner names
          have kept : keepMessage messageWait = true := (List.mem_filter.mp retained).2
          simp only [keepTask, taskOwner, inside, Bool.not_false, kept])
    have filters_comm {α : Type} (values : List α) (keep select : α → Bool) :
        (values.filter keep).filter select = (values.filter select).filter keep := by
      simp only [List.filter_filter]
      apply List.filter_congr
      intro value _
      exact Bool.and_comm _ _
    simpa only [messageBoundedOperationProjectionValid, tasksFrame, messagesFrame, recordsFrame,
      tasks, messages, records, operation, filters_comm state.waits keepTask,
      filters_comm state.messageWaits keepMessage, filters_comm state.activityOccurrences keepRecord] using revised

end BpmnSemantics.SemanticProcess.InternalCommutation
