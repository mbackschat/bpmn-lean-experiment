import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceEffectProgramValidity

/-! # Flow-node occurrence wait Program validity

This module validates the exact correspondence between immutable Program definitions and live wait occurrences before lifecycle projection. It owns operation-owned wait families, private Boundary Timer host pairing, and effect-local scope exactness. Structural scope and Call Activity correspondence remains in `FlowNodeOccurrenceProgramValidityCore`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open FlowNodeOccurrenceProgramValidity.Internal

private def userTaskWaitValid (program : Program) (state : RuntimeState)
    (wait : UserTaskWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitUserTask _ _ _ output task =>
          output = wait.output && task = wait.task && wait.metadata = task.metadata
      | .awaitBoundedUserTask _ _ _ task _
      | .awaitMonitoredUserTask _ _ _ task _ =>
          task.id = wait.task.id && task.name = wait.task.name && task.output = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ normalOutput _ _ =>
          task.id = wait.task.id && task.name = wait.task.name && normalOutput = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId taskName _ normalOutput _ _ _ =>
          taskId = wait.task.id && taskName = wait.task.name && normalOutput = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | _ => false).length = 1

private def messageWaitId (wait : MessageWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

private def messageWaitValid (program : Program) (state : RuntimeState)
    (wait : MessageWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitMessage _ _ _ output message =>
          message.elementId = wait.elementId && message.channel = wait.channel && output = wait.output
      | .awaitEventRace _ origin _ message _ =>
          message.elementId = wait.elementId && message.channel = wait.channel &&
            message.output = wait.output && state.eventRaces.any fun race =>
              race.owner = wait.owner && race.id.elementId.value = origin.elementId.value &&
                race.messageSubscriptionId = messageWaitId wait
      | _ => false).length = 1

private def timerWaitId (wait : TimerWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

private def boundaryTimerOperationMatches (program : Program) (state : RuntimeState)
    (wait : TimerWait) (operation : SemanticOperation) : Bool :=
  if !operationOwnedBy program operation wait.owner then false
  else match operation with
  | .awaitBoundedUserTask _ _ _ task boundary
  | .awaitMonitoredUserTask _ _ _ task boundary =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.waits.filter fun host => decide
          (host.owner = wait.owner && host.task.id = task.id &&
            host.activation = wait.activation)).length = 1
  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ boundary _ =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.activityOccurrences.filter fun record =>
          record.owner = wait.owner && recordAttaches record (timerWaitId wait) &&
            match activityBodyTask? record with
            | some body => body.elementId.value = task.id.value
            | none => false).length = 1
  | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ boundary _ _ =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.activityOccurrences.filter fun record =>
          record.owner = wait.owner && recordAttaches record (timerWaitId wait) &&
            match activityBodyParallelTasks? record with
            | some children => children.all fun child => child.elementId.value = taskId.value
            | none => false).length = 1
  | .enterBoundedScope _ _ _ _ childScopeId boundary =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.scopeOccurrences.filter fun child => decide
          (child.id.definitionScopeId = childScopeId && child.id.activation = wait.activation &&
            child.parent = some wait.owner)).length = 1
  | _ => false

/-- Whether one already validated Timer wait is the private deadline of one exact live host. -/
def flowNodeOccurrenceBoundaryTimerBound (program : Program) (state : RuntimeState)
    (wait : TimerWait) : Bool :=
  (program.operations.filter (boundaryTimerOperationMatches program state wait)).length = 1

private theorem boundaryTimerOperationMatches_insertOrdinaryUserTask (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (wait : UserTaskWait)
    (unique : userTaskWaitDeclarers program wait.task.id =
      [.awaitUserTask id origin input output wait.task])
    (timer : TimerWait) (operation : SemanticOperation)
    (member : operation ∈ program.operations) :
    boundaryTimerOperationMatches program
        { state with waits := insertUserTaskWait wait state.waits } timer operation =
      boundaryTimerOperationMatches program state timer operation := by
  have onlyOrdinary : operation ∈ userTaskWaitDeclarers program wait.task.id ↔
      operation = .awaitUserTask id origin input output wait.task := by rw [unique]; simp
  cases operation <;> try rfl
  all_goals simp [userTaskWaitDeclarers, member] at onlyOrdinary
  all_goals have reverse := Ne.symm onlyOrdinary
  all_goals simp_all [boundaryTimerOperationMatches, userTaskWaitDeclarers,
    ← List.countP_eq_length_filter, countP_insertUserTaskWait]

/-- An ordinary User Task cannot become the host of a private Boundary Timer. -/
theorem flowNodeOccurrenceBoundaryTimerBound_insertOrdinaryUserTask (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (wait : UserTaskWait)
    (unique : userTaskWaitDeclarers program wait.task.id =
      [.awaitUserTask id origin input output wait.task]) (timer : TimerWait) :
    flowNodeOccurrenceBoundaryTimerBound program
      { state with waits := insertUserTaskWait wait state.waits } timer =
        flowNodeOccurrenceBoundaryTimerBound program state timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro candidate candidateMem
  exact boundaryTimerOperationMatches_insertOrdinaryUserTask program state id origin input
    output wait unique timer candidate candidateMem

/-- A Timer with one exact ordinary declarer is not a private Boundary Timer. -/
theorem flowNodeOccurrenceBoundaryTimerBound_ordinaryTimer_false (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (timer : TimerDefinition) (wait : TimerWait)
    (sameElement : wait.elementId = timer.elementId)
    (unique : timerWaitDeclarers program timer.elementId =
      [.awaitTimer id origin input output timer]) :
    flowNodeOccurrenceBoundaryTimerBound program state wait = false := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  have empty : program.operations.filter (boundaryTimerOperationMatches program state wait) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro candidate candidateMem
    have onlyOrdinary : candidate ∈ timerWaitDeclarers program timer.elementId ↔
        candidate = .awaitTimer id origin input output timer := by rw [unique]; simp
    cases candidate <;> try rfl
    all_goals simp [timerWaitDeclarers, candidateMem] at onlyOrdinary
    all_goals simp_all [boundaryTimerOperationMatches]
  rw [empty]
  rfl

private def timerWaitValid (program : Program) (state : RuntimeState)
    (wait : TimerWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitTimer _ _ _ output timer =>
          timer.elementId = wait.elementId && output = wait.output
      | .awaitEventRace _ origin _ _ timer =>
          timer.elementId = wait.elementId && timer.output = wait.output &&
            state.eventRaces.any fun race =>
              race.owner = wait.owner && race.id.elementId.value = origin.elementId.value &&
                race.timerOccurrenceId = timerWaitId wait
      | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
      | .awaitSequentialMultiInstanceUserTask ..
      | .awaitParallelMultiInstanceUserTask .. | .enterBoundedScope .. =>
          boundaryTimerOperationMatches program state wait operation
      | _ => false).length = 1

/-- Exact immutable-Program correspondence for every wait family used by open projection. -/
def flowNodeOccurrenceWaitProgramValidity (program : Program) (state : RuntimeState) : Bool :=
  state.waits.all (userTaskWaitValid program state) &&
    state.messageWaits.all (messageWaitValid program state) &&
    state.timerWaits.all (timerWaitValid program state) &&
    flowNodeOccurrenceEffectProgramValidity program state

/-- Every projected wait stores the same process identity as its live owner. -/
theorem flowNodeOccurrenceWaitProgramValidity_wait_owner_ids (program : Program) (state : RuntimeState)
    (valid : flowNodeOccurrenceWaitProgramValidity program state = true) :
    (∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.messageWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.timerWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.effectWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ incident ∈ state.effectIncidents,
      incident.wait.processInstanceId = incident.wait.owner.processInstanceId) := by
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true, List.all_eq_true] at valid
  refine ⟨?_, ?_, ?_, ?_, ?_⟩
  · intro wait member
    have waitValid := valid.1.1.1 wait member
    simp [userTaskWaitValid, occurrenceOwnerValid] at waitValid
    exact waitValid.1.1.2

  · intro wait member
    have waitValid := valid.1.1.2 wait member
    simp [messageWaitValid, occurrenceOwnerValid] at waitValid
    exact waitValid.1.1.2
  · intro wait member
    have waitValid := valid.1.2 wait member
    simp [timerWaitValid, occurrenceOwnerValid] at waitValid
    exact waitValid.1.1.2
  · intro wait member
    exact (flowNodeOccurrenceEffectProgramValidity_wait_owner_ids program state valid.2).1
      wait member
  · intro incident member
    exact (flowNodeOccurrenceEffectProgramValidity_wait_owner_ids program state valid.2).2
      incident member

theorem flowNodeOccurrenceWaitProgramValidity_insertOrdinaryUserTask (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (wait : UserTaskWait)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (declarers : userTaskWaitDeclarers program wait.task.id =
      [.awaitUserTask id origin input wait.output wait.task])
    (declared : declaredByExactlyOneOwnedOperation program
      (userTaskWaitDeclarers program wait.task.id) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (ownerProcess : !wait.processInstanceId.value.isEmpty = true)
    (taskId : !wait.task.id.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (metadata : wait.metadata = wait.task.metadata) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with waits := insertUserTaskWait wait state.waits } = true := by
  let after : RuntimeState := { state with waits := insertUserTaskWait wait state.waits }
  change flowNodeOccurrenceWaitProgramValidity program after = true
  have owned := operationOwnedBy_of_exact_declaration program
    (.awaitUserTask id origin input wait.output wait.task) wait.owner _ declarers declared
  have timerFrame (timer : TimerWait) :
      timerWaitValid program after timer = timerWaitValid program state timer := by
    unfold timerWaitValid
    simp only [occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique, after]
    congr 4
    apply List.filter_congr
    intro operation member
    cases operation <;> try rfl
    all_goals rw [boundaryTimerOperationMatches_insertOrdinaryUserTask program state id
      origin input wait.output wait declarers timer _ member]
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨h2, effects⟩ := prior
  obtain ⟨h1, timers⟩ := h2
  obtain ⟨users, messages⟩ := h1
  have newValid : userTaskWaitValid program after wait = true := by
    simp_all [userTaskWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after]
    calc
      _ = (userTaskWaitDeclarers program wait.task.id).length := by
        apply congrArg List.length
        unfold userTaskWaitDeclarers
        apply List.filter_congr
        intro operation member
        have only : operation ∈ userTaskWaitDeclarers program wait.task.id ↔
            operation = .awaitUserTask id origin input wait.output wait.task := by
          rw [declarers]
          simp
        by_cases familyMember : operation ∈ userTaskWaitDeclarers program wait.task.id
        · have operationEq := only.mp familyMember
          subst operation
          simp [owned]
        · cases operation with
          | awaitUserTask candidateId candidateOrigin candidateInput candidateOutput candidateTask =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              have taskDifferent : candidateTask ≠ wait.task :=
                fun same => different (congrArg UserTaskDefinition.id same)
              simp [different, taskDifferent]
          | awaitBoundedUserTask candidateId candidateOrigin candidateInput candidateTask boundary =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              simp [different]
          | awaitMonitoredUserTask candidateId candidateOrigin candidateInput candidateTask boundary =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              simp [different]
          | awaitSequentialMultiInstanceUserTask candidateId candidateOrigin candidateInput
              candidateTask data normalOutput boundary limits =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              simp [different]
          | awaitParallelMultiInstanceUserTask candidateId candidateOrigin candidateInput
              candidateTaskId candidateTaskName data normalOutput boundary condition limits =>
              have different : candidateTaskId ≠ wait.task.id := by
                intro same
                apply familyMember
                unfold userTaskWaitDeclarers
                rw [List.mem_filter]
                exact ⟨member, by simp [same]⟩
              simp [different]
          | _ => simp
      _ = 1 := by
        simpa [userTaskWaitDeclarers] using congrArg List.length declarers
  have usersAfter : after.waits.all (userTaskWaitValid program after) = true := by
    rw [show after.waits = insertUserTaskWait wait state.waits by rfl,
      all_insertUserTaskWait]
    simp only [Bool.and_eq_true]
    refine ⟨newValid, ?_⟩
    simpa [userTaskWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using users
  have timersAfter : after.timerWaits.all (timerWaitValid program after) = true := by
    simp only [List.all_eq_true] at timers ⊢
    intro timer member
    rw [timerFrame]
    exact timers timer member
  exact ⟨⟨⟨usersAfter, by simpa [messageWaitValid, occurrenceOwnerValid,
      flowNodeOccurrenceOwnerLiveUnique, after] using messages⟩, timersAfter⟩,
    by
      rw [flowNodeOccurrenceEffectProgramValidity_frame program state after]
      · exact effects
      all_goals rfl⟩

theorem flowNodeOccurrenceWaitProgramValidity_insertOrdinaryMessage (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : MessageDefinition) (wait : MessageWait)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (declarers : messageWaitDeclarers program wait.elementId =
      [.awaitMessage id origin input wait.output message])
    (declared : declaredByExactlyOneOwnedOperation program
      (messageWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (element : message.elementId = wait.elementId) (channel : message.channel = wait.channel) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with messageWaits := insertMessageWait wait state.messageWaits } = true := by
  let after : RuntimeState :=
    { state with messageWaits := insertMessageWait wait state.messageWaits }
  change flowNodeOccurrenceWaitProgramValidity program after = true
  have owned := operationOwnedBy_of_exact_declaration program
    (.awaitMessage id origin input wait.output message) wait.owner _ declarers declared
  have operationCount :
      (program.operations.filter fun operation =>
        operationOwnedBy program operation wait.owner && match operation with
        | .awaitMessage _ _ _ output candidate =>
            candidate.elementId = wait.elementId && candidate.channel = wait.channel &&
              output = wait.output
        | .awaitEventRace _ candidateOrigin _ candidate _ =>
            candidate.elementId = wait.elementId && candidate.channel = wait.channel &&
              candidate.output = wait.output && state.eventRaces.any fun race =>
                race.owner = wait.owner &&
                  race.id.elementId.value = candidateOrigin.elementId.value &&
                  race.messageSubscriptionId = messageWaitId wait
        | _ => false).length = 1 := by
    calc
      _ = (messageWaitDeclarers program wait.elementId).length := by
        apply congrArg List.length
        unfold messageWaitDeclarers
        apply List.filter_congr
        intro operation member
        have only : operation ∈ messageWaitDeclarers program wait.elementId ↔
            operation = .awaitMessage id origin input wait.output message := by
          rw [declarers]
          simp
        by_cases familyMember : operation ∈ messageWaitDeclarers program wait.elementId
        · have operationEq := only.mp familyMember
          subst operation
          simp [owned, element, channel]
        · cases operation with
          | awaitMessage candidateId candidateOrigin candidateInput candidateOutput candidate =>
              have different : candidate.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [messageWaitDeclarers, member, same]
              simp [different]
          | awaitEventRace candidateId candidateOrigin candidateInput candidateMessage candidateTimer =>
              have different : candidateMessage.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [messageWaitDeclarers, member, same]
              simp [different]
          | _ => simp
      _ = 1 := by
        simpa [messageWaitDeclarers] using congrArg List.length declarers
  have newValid : messageWaitValid program after wait = true := by
    simp_all [messageWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique, after]
  have timerFrame (timer : TimerWait) :
      timerWaitValid program after timer = timerWaitValid program state timer := by
    unfold timerWaitValid
    simp only [occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique, after]
    congr 4
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨h2, effects⟩ := prior
  obtain ⟨h1, timers⟩ := h2
  obtain ⟨users, messages⟩ := h1
  have messagesAfter : after.messageWaits.all (messageWaitValid program after) = true := by
    rw [show after.messageWaits = insertMessageWait wait state.messageWaits by rfl,
      show insertMessageWait wait state.messageWaits =
        canonicalInsertBy messageWaitBefore wait state.messageWaits by rfl,
      all_canonicalInsertBy]
    simp only [Bool.and_eq_true]
    refine ⟨newValid, ?_⟩
    simpa [messageWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using messages
  have timersAfter : after.timerWaits.all (timerWaitValid program after) = true := by
    simp only [List.all_eq_true] at timers ⊢
    intro timer member
    rw [timerFrame]
    exact timers timer member
  exact ⟨⟨⟨by simpa [userTaskWaitValid, occurrenceOwnerValid,
      flowNodeOccurrenceOwnerLiveUnique, after] using users, messagesAfter⟩,
    timersAfter⟩, by
      rw [flowNodeOccurrenceEffectProgramValidity_frame program state after]
      · exact effects
      all_goals rfl⟩

theorem flowNodeOccurrenceWaitProgramValidity_insertOrdinaryTimer (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (timer : TimerDefinition) (wait : TimerWait)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (declarers : timerWaitDeclarers program wait.elementId =
      [.awaitTimer id origin input wait.output timer])
    (declared : declaredByExactlyOneOwnedOperation program
      (timerWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (element : timer.elementId = wait.elementId) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with timerWaits := insertTimerWait wait state.timerWaits } = true := by
  let after : RuntimeState := { state with timerWaits := insertTimerWait wait state.timerWaits }
  have owned := operationOwnedBy_of_exact_declaration program
    (.awaitTimer id origin input wait.output timer) wait.owner _ declarers declared
  have operationCount :
      (program.operations.filter fun operation =>
        operationOwnedBy program operation wait.owner && match operation with
        | .awaitTimer _ _ _ output candidate =>
            candidate.elementId = wait.elementId && output = wait.output
        | .awaitEventRace _ candidateOrigin _ _ candidate =>
            candidate.elementId = wait.elementId && candidate.output = wait.output &&
              state.eventRaces.any fun race =>
                race.owner = wait.owner &&
                  race.id.elementId.value = candidateOrigin.elementId.value &&
                  race.timerOccurrenceId = timerWaitId wait
        | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
        | .awaitSequentialMultiInstanceUserTask ..
        | .awaitParallelMultiInstanceUserTask .. | .enterBoundedScope .. =>
            boundaryTimerOperationMatches program state wait operation
        | _ => false).length = 1 := by
    calc
      _ = (timerWaitDeclarers program wait.elementId).length := by
        apply congrArg List.length
        unfold timerWaitDeclarers
        apply List.filter_congr
        intro operation member
        have only : operation ∈ timerWaitDeclarers program wait.elementId ↔
            operation = .awaitTimer id origin input wait.output timer := by
          rw [declarers]
          simp
        by_cases familyMember : operation ∈ timerWaitDeclarers program wait.elementId
        · have operationEq := only.mp familyMember
          subst operation
          simp [owned, element]
        · cases operation with
          | awaitTimer candidateId candidateOrigin candidateInput candidateOutput candidate =>
              have different : candidate.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [timerWaitDeclarers, member, same]
              simp [different]
          | awaitEventRace candidateId candidateOrigin candidateInput candidateMessage candidateTimer =>
              have different : candidateTimer.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [timerWaitDeclarers, member, same]
              simp [different]
          | awaitBoundedUserTask candidateId candidateOrigin candidateInput candidateTask boundary =>
              have different : boundary.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                unfold timerWaitDeclarers
                rw [List.mem_filter]
                exact ⟨member, by simp [same]⟩
              simp [boundaryTimerOperationMatches, different]
          | awaitMonitoredUserTask candidateId candidateOrigin candidateInput candidateTask boundary =>
              have different : boundary.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [timerWaitDeclarers, member, same]
              simp [boundaryTimerOperationMatches, different]
          | awaitSequentialMultiInstanceUserTask candidateId candidateOrigin candidateInput
              candidateTask data output boundary limits =>
              have different : boundary.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [timerWaitDeclarers, member, same]
              simp [boundaryTimerOperationMatches, different]
          | awaitParallelMultiInstanceUserTask candidateId candidateOrigin candidateInput
              candidateTaskId candidateTaskName data output boundary condition limits =>
              have different : boundary.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [timerWaitDeclarers, member, same]
              simp [boundaryTimerOperationMatches, different]
          | enterBoundedScope candidateId candidateOrigin candidateInput childEntry childScope boundary =>
              have different : boundary.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [timerWaitDeclarers, member, same]
              simp [boundaryTimerOperationMatches, different]
          | _ => simp
      _ = 1 := by simpa [timerWaitDeclarers] using congrArg List.length declarers
  have newValidBefore : timerWaitValid program state wait = true := by
    simp_all [timerWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique]
  have newValid : timerWaitValid program after wait = true := by
    have frame : timerWaitValid program after wait = timerWaitValid program state wait := by
      unfold timerWaitValid
      simp only [occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique, after]
      congr 4
    rw [frame]
    exact newValidBefore
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨h2, effects⟩ := prior
  obtain ⟨h1, timers⟩ := h2
  obtain ⟨users, messages⟩ := h1
  have timersAfter : after.timerWaits.all (timerWaitValid program after) = true := by
    rw [show after.timerWaits = insertTimerWait wait state.timerWaits by rfl,
      show insertTimerWait wait state.timerWaits =
        canonicalInsertBy timerWaitBefore wait state.timerWaits by rfl,
      all_canonicalInsertBy]
    simp only [Bool.and_eq_true]
    refine ⟨newValid, ?_⟩
    simpa [timerWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      boundaryTimerOperationMatches, after] using timers
  exact ⟨⟨⟨by simpa [userTaskWaitValid, occurrenceOwnerValid,
      flowNodeOccurrenceOwnerLiveUnique, after] using users,
    by simpa [messageWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using messages⟩, timersAfter⟩, by
      rw [flowNodeOccurrenceEffectProgramValidity_frame program state after]
      · exact effects
      all_goals rfl⟩

theorem flowNodeOccurrenceWaitProgramValidity_insertOrdinaryEffect (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (wait : EffectWait) (bindings : List VariableBinding)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (declarers : effectWaitDeclarers program wait.elementId =
      [.awaitEffect id origin input wait.output effect route])
    (declared : declaredByExactlyOneOwnedOperation program
      (effectWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (originElement : origin.elementId = wait.elementId)
    (effectElement : effect.elementId = wait.elementId)
    (descriptor : effect.descriptor = wait.descriptor)
    (arguments : evaluateInputMappings effect.inputMappings = some wait.arguments)
    (outputMappings : effect.outputMappings = wait.outputMappings)
    (routeEq : route = wait.bpmnErrorRoute) (bindingsEq : bindings = wait.arguments)
    (aligned : ∀ candidateId candidateOrigin candidateInput candidateOutput candidateEffect
        candidateRoute,
      .awaitEffect candidateId candidateOrigin candidateInput candidateOutput candidateEffect
          candidateRoute ∈ program.operations →
        candidateOrigin.elementId = candidateEffect.elementId)
    (freshWaits : ∀ old ∈ state.effectWaits,
      effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId old)
    (freshIncidents : ∀ incident ∈ state.effectIncidents,
      effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId incident.wait)
    (freshActivities : ∀ activity ∈ state.variables.activities,
      activityScopeMatches (effectWaitOccurrenceId wait) activity = false) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with
        effectWaits := insertEffectWait wait state.effectWaits
        variables := addActivityVariableScope state.variables
          (effectWaitOccurrenceId wait) bindings } = true := by
  let after : RuntimeState :=
    { state with
      effectWaits := insertEffectWait wait state.effectWaits
      variables := addActivityVariableScope state.variables
        (effectWaitOccurrenceId wait) bindings }
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨⟨⟨users, messages⟩, timers⟩, effects⟩ := prior
  refine ⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩
  · simpa [userTaskWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using users
  · simpa [messageWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using messages
  · simpa [timerWaitValid, boundaryTimerOperationMatches, occurrenceOwnerValid,
      flowNodeOccurrenceOwnerLiveUnique, after] using timers
  · exact flowNodeOccurrenceEffectProgramValidity_insertOrdinaryEffect program state id origin
      input effect route wait bindings effects declarers declared live processId elementId positive
      processOwner originElement effectElement descriptor arguments outputMappings routeEq bindingsEq
      aligned freshWaits freshIncidents freshActivities

end BpmnSemantics.SemanticProcess
