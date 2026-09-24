import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceEffectProgramValidity
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity

/-! # Flow-node occurrence wait Program validity

This module validates the exact correspondence between immutable Program definitions and live wait occurrences before lifecycle projection. It owns operation-owned wait families, private Boundary Timer host pairing, and effect-local scope exactness. Structural scope and Call Activity correspondence remains in `FlowNodeOccurrenceProgramValidityCore`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open FlowNodeOccurrenceProgramValidity.Internal

private def messageWaitId (wait : MessageWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

private def messageOperationMatchesWait (program : Program) (eventRaces : List EventRace)
    (wait : MessageWait) (operation : SemanticOperation) : Bool :=
  operationOwnedBy program operation wait.owner && match operation with
  | .awaitMessage _ _ _ output message
  | .awaitPayloadMessage _ _ _ output message _
  | .awaitCorrelatedPayloadMessage _ _ _ output message _ _ _ _ =>
      message.elementId = wait.elementId && message.channel = wait.channel &&
        output = wait.output
  | .awaitMessageBoundedUserTask _ _ _ _ boundaryMessage
  | .awaitMessageMonitoredUserTask _ _ _ _ boundaryMessage =>
      boundaryMessage.elementId = wait.elementId &&
        boundaryMessage.channel = wait.channel && boundaryMessage.output = wait.output
  | .awaitEventRace _ origin _ message _ =>
      message.elementId = wait.elementId && message.channel = wait.channel &&
        message.output = wait.output && eventRaces.any fun race =>
          race.owner = wait.owner && race.id.elementId.value = origin.elementId.value &&
            race.messageSubscriptionId = messageWaitId wait
  | _ => false

private def messageWaitValid (program : Program) (state : RuntimeState)
    (wait : MessageWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation &&
    (program.operations.filter
      (messageOperationMatchesWait program state.eventRaces wait)).length = 1

private def timerWaitId (wait : TimerWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

/-- Shared internal matcher for classification and wait-validity frame proofs under AOO-JOIN-03. -/
def FlowNodeOccurrenceProgramValidity.Internal.boundaryTimerOperationMatches (program : Program) (state : RuntimeState)
    (wait : TimerWait) (operation : SemanticOperation) : Bool :=
  if !operationOwnedBy program operation wait.owner then false
  else match operation with
  | .awaitBoundedUserTask _ _ _ task boundary
  | .awaitMonitoredUserTask _ _ _ task boundary =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.activityOccurrences.filter fun record =>
          record.owner = wait.owner && recordAttaches record (timerWaitId wait) &&
            (state.waits.filter fun host =>
              decide (host.owner = wait.owner && host.task.id = task.id) &&
                recordBodyNamesWait host record).length = 1).length = 1
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
  | .enterBoundedScope _ _ _ _ childScopeId boundary
  | .enterMonitoredScope _ _ _ _ childScopeId boundary =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.activityOccurrences.filter fun record =>
          record.owner = wait.owner && recordAttaches record (timerWaitId wait) &&
            (state.scopeOccurrences.filter fun child =>
              decide (child.id.definitionScopeId = childScopeId && child.parent = some wait.owner) &&
                activityBodyScope? record == some child.id).length = 1).length = 1
  | _ => false

/-- Whether one already validated Timer wait is the private deadline of one exact live host. -/
def flowNodeOccurrenceBoundaryTimerBound (program : Program) (state : RuntimeState)
    (wait : TimerWait) : Bool :=
  (program.operations.filter (boundaryTimerOperationMatches program state wait)).length = 1

/-- RHP-HANDLER-01: a published wait can end through its Activity's child body even when
its own scope survives. Exclude private Timers before matching the untagged public wait identity. -/
def scopeCancellationWithdrawsHandler (program : Program) (state : RuntimeState) (root : ScopeOccurrenceId)
    (id : OccurrenceId) (disposition : SelectedScopeDisposition := .remove) : Bool :=
  let withdrawn := withdrawnByRegion (fun owner =>
    occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences
      (retainedCancellationRoot root disposition)
  (state.messageWaits.any fun wait => messageIdNamesWait id wait &&
    activityRecordsAttachMessageWait withdrawn wait) ||
  (state.timerWaits.any fun wait => timerIdNamesWait id wait &&
    !flowNodeOccurrenceBoundaryTimerBound program state wait &&
    anyTimerIdNamesWait (attachedTimersOf withdrawn) wait)

private theorem boundaryTimerOperationMatches_insertUnboundedUserTask (program : Program)
    (state : RuntimeState) (selected : SemanticOperation) (wait : UserTaskWait)
    {anchor : UserTaskWait} (declaration : UnboundedUserTaskWaitDeclaration anchor selected)
    (unique : userTaskWaitDeclarers program wait.task.id = [selected])
    (timer : TimerWait) (operation : SemanticOperation)
    (member : operation ∈ program.operations) :
    boundaryTimerOperationMatches program
        { state with waits := insertUserTaskWait wait state.waits } timer operation =
      boundaryTimerOperationMatches program state timer operation := by
  have onlyUnbounded : operation ∈ userTaskWaitDeclarers program wait.task.id ↔
      operation = selected := by rw [unique]; simp
  cases declaration <;> cases operation <;> try rfl
  all_goals simp [userTaskWaitDeclarers, member] at onlyUnbounded
  all_goals have reverse := Ne.symm onlyUnbounded
  all_goals simp_all [boundaryTimerOperationMatches, userTaskWaitDeclarers,
    ← List.countP_eq_length_filter, countP_insertUserTaskWait]

/-- The complete declarer census excludes bounded Timer hosts for an unbounded User Task. -/
theorem flowNodeOccurrenceBoundaryTimerBound_insertUnboundedUserTask (program : Program)
    (state : RuntimeState) (selected : SemanticOperation) (wait : UserTaskWait)
    {anchor : UserTaskWait} (declaration : UnboundedUserTaskWaitDeclaration anchor selected)
    (unique : userTaskWaitDeclarers program wait.task.id = [selected]) (timer : TimerWait) :
    flowNodeOccurrenceBoundaryTimerBound program
      { state with waits := insertUserTaskWait wait state.waits } timer =
        flowNodeOccurrenceBoundaryTimerBound program state timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro candidate candidateMem
  exact boundaryTimerOperationMatches_insertUnboundedUserTask program state selected wait
    declaration unique timer candidate candidateMem

/-- An ordinary User Task cannot become the host of a private Boundary Timer. -/
theorem flowNodeOccurrenceBoundaryTimerBound_insertOrdinaryUserTask (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (wait : UserTaskWait)
    (unique : userTaskWaitDeclarers program wait.task.id =
      [.awaitUserTask id origin input output wait.task]) (timer : TimerWait) :
    flowNodeOccurrenceBoundaryTimerBound program
      { state with waits := insertUserTaskWait wait state.waits } timer =
        flowNodeOccurrenceBoundaryTimerBound program state timer := by
  exact flowNodeOccurrenceBoundaryTimerBound_insertUnboundedUserTask program state _ wait
    (anchor := { wait with output, metadata := wait.task.metadata })
    (.ordinary id origin input rfl) unique timer

private theorem filter_insertActivityOccurrence_of_rejected
    (predicate : ActivityOccurrence → Bool) (record : ActivityOccurrence)
    (rejected : predicate record = false) (records : List ActivityOccurrence) :
    (insertActivityOccurrence record records).filter predicate = records.filter predicate := by
  rw [insertActivityOccurrence_eq_canonicalInsertBy]
  exact filter_canonicalInsertBy_rejected activityOccurrenceBefore predicate record records rejected

private theorem boundaryTimerOperationMatches_insertUnattachedActivity (program : Program)
    (state : RuntimeState) (record : ActivityOccurrence) (empty : record.attachedHandlers = [])
    (timer : TimerWait) (operation : SemanticOperation) :
    boundaryTimerOperationMatches program
      { state with activityOccurrences := insertActivityOccurrence record state.activityOccurrences }
      timer operation = boundaryTimerOperationMatches program state timer operation := by
  have unattached : recordAttaches record (timerWaitId timer) = false := by
    simp [recordAttaches, ActivityOccurrence.timerHandlerOccurrences, empty]
  cases operation <;> try rfl
  all_goals simp only [boundaryTimerOperationMatches]
  all_goals rw [filter_insertActivityOccurrence_of_rejected _ record
    (by simp only [unattached, Bool.and_false, Bool.false_and])]

/-- AOO-JOIN-03 excludes an unattached Activity from every private Timer host census. -/
theorem flowNodeOccurrenceBoundaryTimerBound_insertUnattachedActivity (program : Program)
    (state : RuntimeState) (record : ActivityOccurrence) (empty : record.attachedHandlers = [])
    (timer : TimerWait) :
    flowNodeOccurrenceBoundaryTimerBound program
      { state with activityOccurrences := insertActivityOccurrence record state.activityOccurrences }
      timer = flowNodeOccurrenceBoundaryTimerBound program state timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro candidate _
  exact boundaryTimerOperationMatches_insertUnattachedActivity program state record empty
    timer candidate

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
      | .awaitParallelMultiInstanceUserTask .. | .enterBoundedScope .. | .enterMonitoredScope .. =>
          boundaryTimerOperationMatches program state wait operation
      | _ => false).length = 1

/-- Exact immutable-Program correspondence for every wait family used by open projection. -/
def flowNodeOccurrenceWaitProgramValidity (program : Program) (state : RuntimeState) : Bool :=
  flowNodeOccurrenceUserTaskProgramValidity program state &&
    state.messageWaits.all (messageWaitValid program state) &&
    state.timerWaits.all (timerWaitValid program state) &&
    flowNodeOccurrenceEffectProgramValidity program state

/-- Empty attachment lists preserve the complete wait validator, including its false states. -/
theorem flowNodeOccurrenceWaitProgramValidity_insertUnattachedActivity (program : Program)
    (state : RuntimeState) (record : ActivityOccurrence) (empty : record.attachedHandlers = []) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with activityOccurrences := insertActivityOccurrence record state.activityOccurrences } =
      flowNodeOccurrenceWaitProgramValidity program state := by
  let after : RuntimeState :=
    { state with activityOccurrences := insertActivityOccurrence record state.activityOccurrences }
  have timers : timerWaitValid program after = timerWaitValid program state := by
    funext timer
    unfold timerWaitValid
    simp only [occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique, after]
    congr 4
    apply List.filter_congr
    intro operation _
    cases operation <;> try rfl
    all_goals rw [boundaryTimerOperationMatches_insertUnattachedActivity program state record
      empty timer]
  change flowNodeOccurrenceWaitProgramValidity program after = _
  simp only [flowNodeOccurrenceWaitProgramValidity, timers,
    flowNodeOccurrenceUserTaskProgramValidity_frame program state after rfl rfl,
    flowNodeOccurrenceEffectProgramValidity_frame program state after rfl rfl rfl rfl]
  rfl

/-- The local-owner discriminator preserves every Effect exactness obligation during Activity arming. -/
theorem flowNodeOccurrenceWaitProgramValidity_addActivityOccurrenceVariableScope
    (program : Program) (state : RuntimeState) (owner : ActivityOccurrenceId)
    (bindings : List VariableBinding) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with variables := addActivityOccurrenceVariableScope state.variables owner bindings } =
      flowNodeOccurrenceWaitProgramValidity program state := by
  simp only [flowNodeOccurrenceWaitProgramValidity,
    flowNodeOccurrenceEffectProgramValidity_addActivityOccurrenceVariableScope]
  rfl

private theorem messageOperationCount_eq_one (program : Program) (eventRaces : List EventRace)
    (wait : MessageWait) (operation : SemanticOperation)
    (declarers : messageWaitDeclarers program wait.elementId = [operation])
    (declared : declaredByExactlyOneOwnedOperation program
      (messageWaitDeclarers program wait.elementId) wait.owner = true)
    (accepted : messageOperationMatchesWait program eventRaces wait operation = true) :
    (program.operations.filter
      (messageOperationMatchesWait program eventRaces wait)).length = 1 := by
  have owned := operationOwnedBy_of_exact_declaration program operation wait.owner _
    declarers declared
  calc
    _ = (messageWaitDeclarers program wait.elementId).length := by
      apply congrArg List.length
      unfold messageWaitDeclarers
      apply List.filter_congr
      intro candidate member
      by_cases candidateEq : candidate = operation
      · subst candidate
        have familyMember : operation ∈ messageWaitDeclarers program wait.elementId := by
          rw [declarers]
          simp
        cases operation <;>
          simp_all [messageOperationMatchesWait, messageWaitDeclarers]
      · have notDeclarer : candidate ∉ messageWaitDeclarers program wait.elementId := by
          rw [declarers]
          simp [candidateEq]
        cases candidate with
        | awaitMessage candidateId candidateOrigin candidateInput candidateOutput message =>
            have different : message.elementId ≠ wait.elementId := by
              intro same
              apply notDeclarer
              simp [messageWaitDeclarers, member, same]
            simp [messageOperationMatchesWait, different]
        | awaitPayloadMessage candidateId candidateOrigin candidateInput candidateOutput message
            directOutput =>
            have different : message.elementId ≠ wait.elementId := by
              intro same
              apply notDeclarer
              simp [messageWaitDeclarers, member, same]
            simp [messageOperationMatchesWait, different]
        | awaitCorrelatedPayloadMessage candidateId candidateOrigin candidateInput
            candidateOutput message correlationKeyId correlationPropertyId payloadSelector
            processPropertySelector =>
            have different : message.elementId ≠ wait.elementId := by
              intro same
              apply notDeclarer
              simp [messageWaitDeclarers, member, same]
            simp [messageOperationMatchesWait, different]
        | awaitEventRace candidateId candidateOrigin candidateInput message timer =>
            have different : message.elementId ≠ wait.elementId := by
              intro same
              apply notDeclarer
              simp [messageWaitDeclarers, member, same]
            simp [messageOperationMatchesWait, different]
        | awaitMessageBoundedUserTask candidateId candidateOrigin candidateInput task boundary
        | awaitMessageMonitoredUserTask candidateId candidateOrigin candidateInput task boundary =>
            have different : boundary.elementId ≠ wait.elementId := by
              intro same
              apply notDeclarer
              simp [messageWaitDeclarers, member, same]
            simp [messageOperationMatchesWait, different]
        | _ => simp [messageOperationMatchesWait]
    _ = 1 := by simpa using congrArg List.length declarers

/-- A Boundary Message wait uses the same exact declaration census for either interruption
value; its Activity association is checked separately by Message-host projection. -/
theorem boundaryMessageWait_valid (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (task : BoundedTaskArm) (message : BoundaryMessageArm)
    (wait : MessageWait)
    (selected : operation = .awaitMessageBoundedUserTask id origin input task message ∨
      operation = .awaitMessageMonitoredUserTask id origin input task message)
    (declarers : messageWaitDeclarers program wait.elementId = [operation])
    (declared : declaredByExactlyOneOwnedOperation program
      (messageWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (element : message.elementId = wait.elementId) (channel : message.channel = wait.channel)
    (output : message.output = wait.output) : messageWaitValid program state wait = true := by
  have owned := operationOwnedBy_of_exact_declaration program operation wait.owner _ declarers declared
  have count := messageOperationCount_eq_one program state.eventRaces wait operation declarers declared (by
    rcases selected with rfl | rfl <;> simp [messageOperationMatchesWait, owned, element, channel, output])
  simp only [messageWaitValid, occurrenceOwnerValid, count, Bool.and_eq_true, decide_eq_true_eq]
  exact ⟨⟨⟨⟨⟨by simpa using processId, by simpa using elementId⟩, positive⟩, processOwner⟩, live⟩, trivial⟩

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
  · exact flowNodeOccurrenceUserTaskProgramValidity_wait_owner_ids program state valid.1.1.1

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

theorem flowNodeOccurrenceWaitProgramValidity_insertUnboundedUserTask (program : Program)
    (state : RuntimeState) (selected : SemanticOperation) (wait : UserTaskWait)
    (declaration : UnboundedUserTaskWaitDeclaration wait selected)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (declarers : userTaskWaitDeclarers program wait.task.id = [selected])
    (declared : declaredByExactlyOneOwnedOperation program
      (userTaskWaitDeclarers program wait.task.id) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (ownerProcess : !wait.processInstanceId.value.isEmpty = true)
    (taskId : !wait.task.id.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with waits := insertUserTaskWait wait state.waits } = true := by
  let after : RuntimeState := { state with waits := insertUserTaskWait wait state.waits }
  change flowNodeOccurrenceWaitProgramValidity program after = true
  have timerFrame (timer : TimerWait) :
      timerWaitValid program after timer = timerWaitValid program state timer := by
    unfold timerWaitValid
    simp only [occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique, after]
    congr 4
    apply List.filter_congr
    intro operation member
    cases operation <;> try rfl
    all_goals rw [boundaryTimerOperationMatches_insertUnboundedUserTask program state selected
      wait declaration declarers timer _ member]
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨h2, effects⟩ := prior
  obtain ⟨h1, timers⟩ := h2
  obtain ⟨users, messages⟩ := h1
  have usersAfter := flowNodeOccurrenceUserTaskProgramValidity_insertUnboundedUserTask
    program state selected wait declaration users declarers declared live ownerProcess taskId
    positive processOwner
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
  exact flowNodeOccurrenceWaitProgramValidity_insertUnboundedUserTask program state _ wait
    (.ordinary id origin input metadata) prior declarers declared live ownerProcess taskId positive
    processOwner

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
      (program.operations.filter
        (messageOperationMatchesWait program state.eventRaces wait)).length = 1 := by
    apply messageOperationCount_eq_one program state.eventRaces wait
      (.awaitMessage id origin input wait.output message) declarers declared
    simp [messageOperationMatchesWait, owned, element, channel]
  have newValid : messageWaitValid program after wait = true := by
    simp_all [messageWaitValid, occurrenceOwnerValid,
      flowNodeOccurrenceOwnerLiveUnique, after]
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
  exact ⟨⟨⟨by
      rw [flowNodeOccurrenceUserTaskProgramValidity_frame program state after rfl rfl]
      exact users, messagesAfter⟩,
    timersAfter⟩, by
      rw [flowNodeOccurrenceEffectProgramValidity_frame program state after]
      · exact effects
      all_goals rfl⟩

theorem flowNodeOccurrenceWaitProgramValidity_insertPayloadMessage (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : MessageDefinition)
    (directOutput : DirectCatchEventPayloadOutput) (wait : MessageWait)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (declarers : messageWaitDeclarers program wait.elementId =
      [.awaitPayloadMessage id origin input wait.output message directOutput])
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
    (.awaitPayloadMessage id origin input wait.output message directOutput) wait.owner _
      declarers declared
  have operationCount :
      (program.operations.filter
        (messageOperationMatchesWait program state.eventRaces wait)).length = 1 := by
    apply messageOperationCount_eq_one program state.eventRaces wait
      (.awaitPayloadMessage id origin input wait.output message directOutput) declarers declared
    simp [messageOperationMatchesWait, owned, element, channel]
  have newValid : messageWaitValid program after wait = true := by
    simp_all [messageWaitValid, occurrenceOwnerValid,
      flowNodeOccurrenceOwnerLiveUnique, after]
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
  exact ⟨⟨⟨by
      rw [flowNodeOccurrenceUserTaskProgramValidity_frame program state after rfl rfl]
      exact users, messagesAfter⟩,
    timersAfter⟩, by
      rw [flowNodeOccurrenceEffectProgramValidity_frame program state after]
      · exact effects
      all_goals rfl⟩

theorem flowNodeOccurrenceWaitProgramValidity_insertCorrelatedPayloadMessage
    (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId) (message : MessageDefinition)
    (correlationKeyId correlationPropertyId : String)
    (payloadSelector : CorrelationMessagePath)
    (processPropertySelector : CorrelationProcessPropertyPath) (wait : MessageWait)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (declarers : messageWaitDeclarers program wait.elementId =
      [.awaitCorrelatedPayloadMessage id origin input wait.output message correlationKeyId
        correlationPropertyId payloadSelector processPropertySelector])
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
  let operation : SemanticOperation :=
    .awaitCorrelatedPayloadMessage id origin input wait.output message
    correlationKeyId correlationPropertyId payloadSelector processPropertySelector
  have owned := operationOwnedBy_of_exact_declaration program operation wait.owner _
    declarers declared
  have operationCount :
      (program.operations.filter
        (messageOperationMatchesWait program state.eventRaces wait)).length = 1 := by
    apply messageOperationCount_eq_one program state.eventRaces wait operation declarers declared
    simp [operation, messageOperationMatchesWait, owned, element, channel]
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
  exact ⟨⟨⟨by
      rw [flowNodeOccurrenceUserTaskProgramValidity_frame program state after rfl rfl]
      exact users, messagesAfter⟩,
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
        | .awaitParallelMultiInstanceUserTask .. | .enterBoundedScope .. | .enterMonitoredScope .. =>
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
          | enterBoundedScope candidateId candidateOrigin candidateInput childEntry childScope boundary
          | enterMonitoredScope candidateId candidateOrigin candidateInput childEntry childScope boundary =>
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
  exact ⟨⟨⟨by
      rw [flowNodeOccurrenceUserTaskProgramValidity_frame program state after rfl rfl]
      exact users,
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
  · rw [flowNodeOccurrenceUserTaskProgramValidity_frame program state after rfl rfl]
    exact users
  · simpa [messageWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using messages
  · simpa [timerWaitValid, boundaryTimerOperationMatches, occurrenceOwnerValid,
      flowNodeOccurrenceOwnerLiveUnique, after] using timers
  · exact flowNodeOccurrenceEffectProgramValidity_insertOrdinaryEffect program state id origin
      input effect route wait bindings effects declarers declared live processId elementId positive
      processOwner originElement effectElement descriptor arguments outputMappings routeEq bindingsEq
      aligned freshWaits freshIncidents freshActivities

end BpmnSemantics.SemanticProcess
