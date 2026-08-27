import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeWellFormedness
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! # Parallel Multi-Instance transitions

The family-local declarative steps and executable evaluators for atomic batch entry, exact child
completion, and lifetime-Timer interruption. Entry creates the complete fixed slot list in one state.
Completion rewrites one pending slot in place, then gives all-filled aggregation priority over the
completion condition. Timer and early closure remove the complete live region and publish nothing.

Scope boundary: bounded family transitions. Shared runtime dispatch, JSON, Temporal hosting, source
admission, and public observation belong to their existing integration owners.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def parallelJsonArrayItemUtf8Bytes (item : String) : Nat :=
  canonicalJsonStringUtf8Bytes item

def parallelCanonicalCollectionUtf8Bytes (items : List String) : Nat :=
  canonicalJsonStringCollectionUtf8Bytes items

def withinParallelMultiInstanceLimits (arm : ParallelMultiInstanceArm)
    (items : List String) : Bool :=
  decide (items.length ≤ arm.limits.maximumItems) &&
    items.all (fun item => decide (item.utf8ByteSize ≤ arm.limits.maximumItemUtf8Bytes)) &&
    decide (parallelCanonicalCollectionUtf8Bytes items ≤
      arm.limits.maximumCanonicalCollectionUtf8Bytes)

def admittedParallelSnapshot? (arm : ParallelMultiInstanceArm)
    (state : ParallelMultiInstanceRuntimeState) : Option (List String) :=
  match state.processBindings.filter fun binding =>
      binding.name == arm.data.input.dataObjectReferenceId with
  | [binding] =>
      match binding.value with
      | .stringList items =>
          if withinParallelMultiInstanceLimits arm items then some items else none
      | _ => none
  | _ => none

def acceptedParallelResult? (arm : ParallelMultiInstanceArm)
    (submitted : List VariableBinding) : Option String :=
  match submitted with
  | [{ name, value := .string result }] =>
      if name = arm.data.output.taskDataOutputId then some result else none
  | _ => none

def publishParallelResults (arm : ParallelMultiInstanceArm)
    (bindings : List VariableBinding) (results : List String) : List VariableBinding :=
  mergeProcessVariableBindings bindings
    [{ name := arm.data.output.dataObjectReferenceId, value := .stringList results }]

def enteredParallelController (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (snapshot : List String) :
    ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := before.processInstanceId
        activityElementId := ⟨arm.taskId.value⟩
        activation := before.activityActivationHighWater + 1 }
    snapshot
    slots := pendingParallelSlots before.processInstanceId arm.taskId
      before.taskActivationHighWater snapshot }

def finishedParallelMultiInstanceState (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (results : List String) :
    ParallelMultiInstanceRuntimeState :=
  { before with
    controller := none
    liveChildren := []
    lifetimeTimer := none
    processBindings := publishParallelResults arm before.processBindings results
    enabledOutput := some arm.normalOutput }

def earlyClosedParallelMultiInstanceState (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) : ParallelMultiInstanceRuntimeState :=
  { before with
    controller := none
    liveChildren := []
    lifetimeTimer := none
    enabledOutput := some arm.normalOutput }

def progressedParallelMultiInstanceState (before : ParallelMultiInstanceRuntimeState)
    (controller : ParallelMultiInstanceController) (updatedSlots : List ParallelMultiInstanceSlot) :
    ParallelMultiInstanceRuntimeState :=
  { before with
    controller := some { controller with slots := updatedSlots }
    liveChildren := pendingParallelTaskIds updatedSlots }

def timerClosedParallelMultiInstanceState (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) : ParallelMultiInstanceRuntimeState :=
  { before with
    controller := none
    liveChildren := []
    lifetimeTimer := none
    enabledOutput := some arm.boundaryTimer.output }

def parallelEntryState (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (snapshot : List String) :
    ParallelMultiInstanceRuntimeState :=
  match snapshot with
  | [] =>
      { before with
        processBindings := publishParallelResults arm before.processBindings []
        enabledOutput := some arm.normalOutput }
  | _ :: _ =>
      let controller := enteredParallelController arm before snapshot
      { before with
        controller := some controller
        liveChildren := pendingParallelTaskIds controller.slots
        lifetimeTimer := some
          { processInstanceId := before.processInstanceId
            elementId := ⟨arm.boundaryTimer.elementId.value⟩
            activation := before.timerActivationHighWater + 1 }
        taskActivationHighWater := before.taskActivationHighWater + snapshot.length
        activityActivationHighWater := before.activityActivationHighWater + 1
        timerActivationHighWater := before.timerActivationHighWater + 1 }

def parallelEntryReady (arm : ParallelMultiInstanceArm)
    (state : ParallelMultiInstanceRuntimeState) : Bool :=
  parallelMultiInstanceRuntimeWellFormed arm state && state.controller.isNone &&
    state.liveChildren.isEmpty && state.lifetimeTimer.isNone && state.enabledOutput.isNone &&
    parallelOutputAbsent arm state

inductive ParallelMultiInstanceEntryStep (arm : ParallelMultiInstanceArm) :
    ParallelMultiInstanceRuntimeState → ParallelMultiInstanceRuntimeState → Prop where
  | enters (before : ParallelMultiInstanceRuntimeState) (snapshot : List String)
      (ready : parallelEntryReady arm before = true)
      (admitted : admittedParallelSnapshot? arm before = some snapshot)
      (postWellFormed : parallelMultiInstanceRuntimeWellFormed arm
        (parallelEntryState arm before snapshot) = true) :
      ParallelMultiInstanceEntryStep arm before (parallelEntryState arm before snapshot)

def enterParallelMultiInstance? (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) : Option ParallelMultiInstanceRuntimeState := do
  if !parallelEntryReady arm before then none
  let snapshot ← admittedParallelSnapshot? arm before
  let after := parallelEntryState arm before snapshot
  if parallelMultiInstanceRuntimeWellFormed arm after then some after else none

def parallelCompletionCandidate? (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) : Option ParallelMultiInstanceRuntimeState := do
  let controller ← before.controller
  let result ← acceptedParallelResult? arm submitted
  if pendingParallelSlotCount taskId controller.slots ≠ 1 then none
  let updatedSlots := replacePendingParallelSlot controller.slots taskId result
  let condition ← evaluateSimpleBooleanExpression arm.completionCondition before.processBindings
  match completedParallelResults? updatedSlots with
  | some results =>
      if !withinParallelMultiInstanceLimits arm results then none
      some (finishedParallelMultiInstanceState arm before results)
  | none =>
      if condition then
        some (earlyClosedParallelMultiInstanceState arm before)
      else
        some (progressedParallelMultiInstanceState before controller updatedSlots)

inductive ParallelMultiInstanceCompletionStep (arm : ParallelMultiInstanceArm)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding) :
    ParallelMultiInstanceRuntimeState → ParallelMultiInstanceRuntimeState → Prop where
  | completes (before after : ParallelMultiInstanceRuntimeState)
      (preWellFormed : parallelMultiInstanceRuntimeWellFormed arm before = true)
      (rewrite : parallelCompletionCandidate? arm before taskId submitted = some after)
      (postWellFormed : parallelMultiInstanceRuntimeWellFormed arm after = true) :
      ParallelMultiInstanceCompletionStep arm taskId submitted before after

def completeParallelMultiInstance? (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) : Option ParallelMultiInstanceRuntimeState := do
  if !parallelMultiInstanceRuntimeWellFormed arm before then none
  let after ← parallelCompletionCandidate? arm before taskId submitted
  if parallelMultiInstanceRuntimeWellFormed arm after then some after else none

def parallelTimerCandidate? (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (timer : TimerOccurrenceId) :
    Option ParallelMultiInstanceRuntimeState := do
  let live ← before.lifetimeTimer
  if live ≠ timer then none
  if before.controller.isNone then none
  some (timerClosedParallelMultiInstanceState arm before)

inductive ParallelMultiInstanceTimerStep (arm : ParallelMultiInstanceArm)
    (timer : TimerOccurrenceId) :
    ParallelMultiInstanceRuntimeState → ParallelMultiInstanceRuntimeState → Prop where
  | interrupts (before after : ParallelMultiInstanceRuntimeState)
      (preWellFormed : parallelMultiInstanceRuntimeWellFormed arm before = true)
      (rewrite : parallelTimerCandidate? arm before timer = some after)
      (postWellFormed : parallelMultiInstanceRuntimeWellFormed arm after = true) :
      ParallelMultiInstanceTimerStep arm timer before after

def interruptParallelMultiInstance? (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (timer : TimerOccurrenceId) :
    Option ParallelMultiInstanceRuntimeState := do
  if !parallelMultiInstanceRuntimeWellFormed arm before then none
  let after ← parallelTimerCandidate? arm before timer
  if parallelMultiInstanceRuntimeWellFormed arm after then some after else none

/-! ## Shared RuntimeState integration -/

def parallelControllerRecord? (state : RuntimeState)
    (controller : ParallelMultiInstanceController) : Option ActivityOccurrence :=
  match state.activityOccurrences.filter fun record =>
      parallelControllerNamesIdentity controller record.processInstanceId
        { value := record.activityElementId.value } record.activation with
  | [record] => some record
  | _ => none

def parallelControllerForTask? (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (taskId : UserTaskInstanceId) : Option ParallelMultiInstanceController :=
  match state.parallelMultiInstanceControllers.filter fun controller =>
      controller.id.activityElementId.value = arm.taskId.value &&
        pendingParallelSlotCount taskId controller.slots = 1 with
  | [controller] => some controller
  | _ => none

def parallelControllerForTimer? (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (timerId : TimerOccurrenceId) : Option ParallelMultiInstanceController :=
  match state.parallelMultiInstanceControllers.filter fun controller =>
      controller.id.activityElementId.value = arm.taskId.value &&
        match parallelControllerRecord? state controller with
        | some record => record.attachedTimers.contains timerId
        | none => false with
  | [controller] => some controller
  | _ => none

private def parallelChildWait (arm : ParallelMultiInstanceArm) (owner : ScopeOccurrenceId)
    (taskId : UserTaskInstanceId) : UserTaskWait :=
  { processInstanceId := taskId.processInstanceId
    owner
    task := { id := arm.taskId, name := arm.taskName }
    activation := taskId.activation
    output := arm.normalOutput
    metadata := none }

def insertParallelChildWaits (arm : ParallelMultiInstanceArm) (owner : ScopeOccurrenceId) :
    List ParallelMultiInstanceSlot → List UserTaskWait → List UserTaskWait
  | [], waits => waits
  | slot :: rest, waits =>
      insertParallelChildWaits arm owner rest
        (insertUserTaskWait (parallelChildWait arm owner slot.taskId) waits)

def parallelTaskIdsFromWaits (waits : List UserTaskWait) : List UserTaskInstanceId :=
  waits.map fun wait =>
    { processInstanceId := wait.processInstanceId
      elementId := ⟨wait.task.id.value⟩
      activation := wait.activation }

def removeParallelChildWaits (waits : List UserTaskWait)
    (taskIds : List UserTaskInstanceId) : List UserTaskWait :=
  waits.filter fun wait => !(taskIds.contains
    { processInstanceId := wait.processInstanceId
      elementId := ⟨wait.task.id.value⟩
      activation := wait.activation })

def parallelRegionValid (arm : ParallelMultiInstanceArm) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence) : Bool :=
  let pending := pendingParallelTaskIds controller.slots
  let regionWaits := state.waits.filter fun wait =>
    wait.owner == record.owner && wait.task.id == arm.taskId
  let regionTimers := state.timerWaits.filter fun wait =>
    wait.owner == record.owner && wait.elementId == arm.boundaryTimer.elementId
  let lifetimeTimer := match record.attachedTimers with
    | [timer] => some timer
    | _ => none
  parallelMultiInstanceRuntimeWellFormed arm
      { processInstanceId := controller.id.processInstanceId
        controller := some controller
        liveChildren := pending
        lifetimeTimer
        processBindings := state.variables.process.bindings
        taskActivationHighWater := activationCount state arm.taskId
        activityActivationHighWater := activityActivationCount state arm.taskId
        timerActivationHighWater := timerActivationCount state arm.boundaryTimer.elementId } &&
    record.owner.processInstanceId == controller.id.processInstanceId &&
    activityBodyParallelTasks? record == some pending &&
    regionWaits.length = pending.length &&
    decide (parallelTaskIdsFromWaits regionWaits = pending) &&
    decide ((parallelTaskIdsFromWaits regionWaits).Nodup) &&
    regionWaits.all fun wait =>
      wait.owner == record.owner && wait.task.id == arm.taskId &&
        wait.task.name == arm.taskName && wait.metadata == none &&
        wait.output == arm.normalOutput &&
    match record.attachedTimers, regionTimers with
    | [timer], [wait] =>
        timerIdNamesWait timer wait && wait.output == arm.boundaryTimer.output
    | _, _ => false

def replaceParallelRecordBody (records : List ActivityOccurrence)
    (record : ActivityOccurrence) (pending : List UserTaskInstanceId) : List ActivityOccurrence :=
  match pending with
  | [] => records
  | first :: rest =>
      records.map fun candidate =>
        if sameActivityOccurrence candidate record then
          { candidate with body := .parallelUserTasks first rest }
        else candidate

def removeParallelRecord (records : List ActivityOccurrence)
    (record : ActivityOccurrence) : List ActivityOccurrence :=
  records.filter fun candidate => !sameActivityOccurrence candidate record

private theorem replaceParallelRecordBody_identity_witness (records : List ActivityOccurrence)
    (record : ActivityOccurrence) (pending : List UserTaskInstanceId) :
    ∀ successor ∈ replaceParallelRecordBody records record pending,
      ∃ predecessor ∈ records, sameActivityOccurrence predecessor successor = true := by
  intro successor present
  cases pending with
  | nil =>
      exact ⟨successor, by simpa [replaceParallelRecordBody] using present,
        by simp [sameActivityOccurrence]⟩
  | cons first rest =>
      simp only [replaceParallelRecordBody, List.mem_map] at present
      obtain ⟨predecessor, predecessorPresent, rfl⟩ := present
      refine ⟨predecessor, predecessorPresent, ?_⟩
      by_cases same : sameActivityOccurrence predecessor record = true
      · rw [if_pos same]
        simp [sameActivityOccurrence]
      · rw [if_neg same]
        simp [sameActivityOccurrence]

private theorem replaceParallelRecordBody_activity_identity_discipline (state : RuntimeState)
    (record : ActivityOccurrence) (pending : List UserTaskInstanceId) :
    activityIdentityIssuingDiscipline state
      { state with
        activityOccurrences := replaceParallelRecordBody state.activityOccurrences record pending } =
      true := by
  apply activityIdentityIssuingDiscipline_of_identity_witness
  exact replaceParallelRecordBody_identity_witness state.activityOccurrences record pending

private theorem removeParallelRecord_subset (records : List ActivityOccurrence)
    (record : ActivityOccurrence) :
    ∀ successor ∈ removeParallelRecord records record, successor ∈ records := by
  intro successor present
  exact (List.mem_filter.mp present).1

def removeParallelController (controllers : List ParallelMultiInstanceController)
    (controller : ParallelMultiInstanceController) : List ParallelMultiInstanceController :=
  controllers.filter fun candidate => candidate.id != controller.id

def removeParallelTimer (waits : List TimerWait) (timerId : TimerOccurrenceId) :
    List TimerWait :=
  waits.filter fun wait => !timerIdNamesWait timerId wait

def publishSharedParallelResults (state : RuntimeState) (arm : ParallelMultiInstanceArm)
    (results : List String) : ScopedVariables :=
  { state.variables with
    process :=
      { bindings := mergeProcessVariableBindings state.variables.process.bindings
          [{ name := arm.data.output.dataObjectReferenceId, value := .stringList results }] } }

def admittedSharedParallelSnapshot? (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) : Option (List String) :=
  match state.variables.process.bindings.filter fun binding =>
      binding.name == arm.data.input.dataObjectReferenceId with
  | [{ value := .stringList items, .. }] =>
      if withinParallelMultiInstanceLimits arm items then some items else none
  | _ => none

def enterSharedParallelMultiInstance? (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) : Option RuntimeState := do
  let instanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  let owner ← onlyTokenOwner? state arm.input
  if state.parallelMultiInstanceControllers.any fun controller =>
      controller.id.activityElementId.value == arm.taskId.value then none
  if state.activityOccurrences.any fun record =>
      record.activityElementId.value == arm.taskId.value then none
  if state.waits.any fun wait => wait.task.id == arm.taskId then none
  if state.timerWaits.any fun wait => wait.elementId == arm.boundaryTimer.elementId then none
  let snapshot ← admittedSharedParallelSnapshot? arm state
  if !(parallelOutputAbsent arm
      { processInstanceId := instanceId
        processBindings := state.variables.process.bindings }) then none
  match snapshot with
  | [] =>
      pure
        { state with
          tokens := addToken (removeToken state.tokens arm.input owner) arm.normalOutput owner
          variables := publishSharedParallelResults state arm [] }
  | _ :: _ =>
      let taskHighWater := activationCount state arm.taskId
      let activityActivation := activityActivationCount state arm.taskId + 1
      let timerActivation := timerActivationCount state arm.boundaryTimer.elementId + 1
      let controller : ParallelMultiInstanceController :=
        { id :=
            { processInstanceId := instanceId
              activityElementId := ⟨arm.taskId.value⟩
              activation := activityActivation }
          snapshot
          slots := pendingParallelSlots instanceId arm.taskId taskHighWater snapshot }
      let pending := pendingParallelTaskIds controller.slots
      match pending with
      | [] => none
      | first :: rest =>
          let timerId : TimerOccurrenceId :=
            { processInstanceId := instanceId
              elementId := ⟨arm.boundaryTimer.elementId.value⟩
              activation := timerActivation }
          pure
            { state with
              tokens := removeToken state.tokens arm.input owner
              waits := insertParallelChildWaits arm owner controller.slots state.waits
              timerWaits := insertTimerWait
                { processInstanceId := instanceId
                  owner
                  elementId := arm.boundaryTimer.elementId
                  activation := timerActivation
                  deadlineMs := state.logicalTimeMs + arm.boundaryTimer.durationMs
                  output := arm.boundaryTimer.output } state.timerWaits
              activityOccurrences := insertActivityOccurrence
                { processInstanceId := instanceId
                  activityElementId := ⟨arm.taskId.value⟩
                  activation := activityActivation
                  owner
                  body := .parallelUserTasks first rest
                  attachedTimers := [timerId] } state.activityOccurrences
              parallelMultiInstanceControllers := insertParallelMultiInstanceController controller
                state.parallelMultiInstanceControllers
              activations := setActivationCount state.activations arm.taskId
                (taskHighWater + snapshot.length)
              timerActivations := setTimerActivationCount state.timerActivations
                arm.boundaryTimer.elementId timerActivation
              activityActivations := setActivationCount state.activityActivations arm.taskId
                activityActivation }

private theorem enterSharedParallelMultiInstance_issues_fresh_activity (state : RuntimeState)
    (arm : ParallelMultiInstanceArm) (owner : ScopeOccurrenceId)
    (first : UserTaskInstanceId) (rest : List UserTaskInstanceId) (timerId : TimerOccurrenceId) :
    activityIdentityIssuingDiscipline state
      { state with
        activityOccurrences := insertActivityOccurrence
          { processInstanceId := owner.processInstanceId
            activityElementId := ⟨arm.taskId.value⟩
            activation := activityActivationCount state arm.taskId + 1
            owner
            body := .parallelUserTasks first rest
            attachedTimers := [timerId] } state.activityOccurrences } = true := by
  apply activityIdentityIssuingDiscipline_insertActivityOccurrence
  exact Nat.lt_succ_self _

def closeSharedParallelRegion (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (output : ControlPlaceId) (variables : ScopedVariables) : RuntimeState :=
  { state with
    tokens := addToken state.tokens output record.owner
    waits := removeParallelChildWaits state.waits (pendingParallelTaskIds controller.slots)
    timerWaits := match record.attachedTimers with
      | [timer] => removeParallelTimer state.timerWaits timer
      | _ => state.timerWaits
    activityOccurrences := removeParallelRecord state.activityOccurrences record
    parallelMultiInstanceControllers := removeParallelController
      state.parallelMultiInstanceControllers controller
    variables }

private theorem closeSharedParallelRegion_activity_identity_discipline (state : RuntimeState)
    (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
    (output : ControlPlaceId) (variables : ScopedVariables) :
    activityIdentityIssuingDiscipline state
      (closeSharedParallelRegion state controller record output variables) = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro successor present
  exact removeParallelRecord_subset state.activityOccurrences record successor
    (by simpa [closeSharedParallelRegion] using present)

def completeSharedParallelMultiInstance? (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) : Option RuntimeState := do
  let instanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  if taskId.processInstanceId ≠ instanceId then none
  let controller ← parallelControllerForTask? arm state taskId
  let record ← parallelControllerRecord? state controller
  if !parallelRegionValid arm state controller record then none
  let result ← acceptedParallelResult? arm submitted
  let updatedSlots := replacePendingParallelSlot controller.slots taskId result
  let condition ← evaluateSimpleBooleanExpression arm.completionCondition
    state.variables.process.bindings
  match completedParallelResults? updatedSlots with
  | some results =>
      if !withinParallelMultiInstanceLimits arm results then none
      some (closeSharedParallelRegion state controller record arm.normalOutput
        (publishSharedParallelResults state arm results))
  | none =>
      if condition then
        some (closeSharedParallelRegion state controller record arm.normalOutput state.variables)
      else
        let pending := pendingParallelTaskIds updatedSlots
        match pending with
        | [] => none
        | _ :: _ =>
            some
              { state with
                waits := removeParallelChildWaits state.waits [taskId]
                activityOccurrences := replaceParallelRecordBody
                  state.activityOccurrences record pending
                parallelMultiInstanceControllers := insertParallelMultiInstanceController
                  { controller with slots := updatedSlots }
                  (removeParallelController state.parallelMultiInstanceControllers controller) }

def interruptSharedParallelMultiInstance? (arm : ParallelMultiInstanceArm)
    (state : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat) :
    Option RuntimeState := do
  let instanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  if timerId.processInstanceId ≠ instanceId then none
  let controller ← parallelControllerForTimer? arm state timerId
  let record ← parallelControllerRecord? state controller
  if !parallelRegionValid arm state controller record then none
  let deadline ← match state.timerWaits.filter (timerIdNamesWait timerId) with
    | [wait] => some wait
    | _ => none
  if logicalTimeMs ≠ deadline.deadlineMs then none
  pure
    { closeSharedParallelRegion state controller record arm.boundaryTimer.output state.variables with
      logicalTimeMs }

/-! ## Shared declarative steps

These relations expose the checked preconditions and exact rewrite of the shared evaluators without
using a post-state validator as a premise. They are intentionally separate from the family-local
relations above because their carrier is the complete production `RuntimeState`.
-/

inductive SharedParallelMultiInstanceEntryStep (arm : ParallelMultiInstanceArm) :
    RuntimeState → RuntimeState → Prop where
  | empty (before after : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
      (running : before.control = .running instanceId)
      (tokenOwner : onlyTokenOwner? before arm.input = some owner)
      (controllerAbsent : before.parallelMultiInstanceControllers.any (fun controller =>
        controller.id.activityElementId.value == arm.taskId.value) = false)
      (recordAbsent : before.activityOccurrences.any (fun record =>
        record.activityElementId.value == arm.taskId.value) = false)
      (taskWaitAbsent : before.waits.any (fun wait => wait.task.id == arm.taskId) = false)
      (timerWaitAbsent : before.timerWaits.any (fun wait =>
        wait.elementId == arm.boundaryTimer.elementId) = false)
      (snapshot : admittedSharedParallelSnapshot? arm before = some [])
      (outputAbsent : parallelOutputAbsent arm
        { processInstanceId := instanceId
          processBindings := before.variables.process.bindings } = true)
      (rewrite : after =
        { before with
          tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
          variables := publishSharedParallelResults before arm [] }) :
      SharedParallelMultiInstanceEntryStep arm before after
  | nonempty (before after : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
      (firstItem : String) (restItems : List String)
      (running : before.control = .running instanceId)
      (tokenOwner : onlyTokenOwner? before arm.input = some owner)
      (controllerAbsent : before.parallelMultiInstanceControllers.any (fun controller =>
        controller.id.activityElementId.value == arm.taskId.value) = false)
      (recordAbsent : before.activityOccurrences.any (fun record =>
        record.activityElementId.value == arm.taskId.value) = false)
      (taskWaitAbsent : before.waits.any (fun wait => wait.task.id == arm.taskId) = false)
      (timerWaitAbsent : before.timerWaits.any (fun wait =>
        wait.elementId == arm.boundaryTimer.elementId) = false)
      (snapshot : admittedSharedParallelSnapshot? arm before = some (firstItem :: restItems))
      (outputAbsent : parallelOutputAbsent arm
        { processInstanceId := instanceId
          processBindings := before.variables.process.bindings } = true)
      (firstTask : UserTaskInstanceId) (restTasks : List UserTaskInstanceId)
      (pending : pendingParallelTaskIds
        (pendingParallelSlots instanceId arm.taskId (activationCount before arm.taskId)
          (firstItem :: restItems)) = firstTask :: restTasks)
      (rewrite : after =
        let taskHighWater := activationCount before arm.taskId
        let activityActivation := activityActivationCount before arm.taskId + 1
        let timerActivation := timerActivationCount before arm.boundaryTimer.elementId + 1
        let controller : ParallelMultiInstanceController :=
          { id :=
              { processInstanceId := instanceId
                activityElementId := ⟨arm.taskId.value⟩
                activation := activityActivation }
            snapshot := firstItem :: restItems
            slots := pendingParallelSlots instanceId arm.taskId taskHighWater
              (firstItem :: restItems) }
        let timerId : TimerOccurrenceId :=
          { processInstanceId := instanceId
            elementId := ⟨arm.boundaryTimer.elementId.value⟩
            activation := timerActivation }
        { before with
          tokens := removeToken before.tokens arm.input owner
          waits := insertParallelChildWaits arm owner controller.slots before.waits
          timerWaits := insertTimerWait
            { processInstanceId := instanceId
              owner
              elementId := arm.boundaryTimer.elementId
              activation := timerActivation
              deadlineMs := before.logicalTimeMs + arm.boundaryTimer.durationMs
              output := arm.boundaryTimer.output } before.timerWaits
          activityOccurrences := insertActivityOccurrence
            { processInstanceId := instanceId
              activityElementId := ⟨arm.taskId.value⟩
              activation := activityActivation
              owner
              body := .parallelUserTasks firstTask restTasks
              attachedTimers := [timerId] } before.activityOccurrences
          parallelMultiInstanceControllers := insertParallelMultiInstanceController controller
            before.parallelMultiInstanceControllers
          activations := setActivationCount before.activations arm.taskId
            (taskHighWater + (firstItem :: restItems).length)
          timerActivations := setTimerActivationCount before.timerActivations
            arm.boundaryTimer.elementId timerActivation
          activityActivations := setActivationCount before.activityActivations arm.taskId
            activityActivation }) :
      SharedParallelMultiInstanceEntryStep arm before after

inductive SharedParallelMultiInstanceCompletionStep (arm : ParallelMultiInstanceArm)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding) :
    RuntimeState → RuntimeState → Prop where
  | final (before after : RuntimeState) (instanceId : SemanticId)
      (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
      (result : String) (conditionValue : Bool) (results : List String)
      (running : before.control = .running instanceId)
      (sameInstance : taskId.processInstanceId = instanceId)
      (selectedController : parallelControllerForTask? arm before taskId = some controller)
      (selectedRecord : parallelControllerRecord? before controller = some record)
      (regionValid : parallelRegionValid arm before controller record = true)
      (accepted : acceptedParallelResult? arm submitted = some result)
      (condition : evaluateSimpleBooleanExpression arm.completionCondition
        before.variables.process.bindings = some conditionValue)
      (completed : completedParallelResults?
        (replacePendingParallelSlot controller.slots taskId result) = some results)
      (withinLimits : withinParallelMultiInstanceLimits arm results = true)
      (rewrite : after = closeSharedParallelRegion before controller record arm.normalOutput
        (publishSharedParallelResults before arm results)) :
      SharedParallelMultiInstanceCompletionStep arm taskId submitted before after
  | early (before after : RuntimeState) (instanceId : SemanticId)
      (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
      (result : String)
      (running : before.control = .running instanceId)
      (sameInstance : taskId.processInstanceId = instanceId)
      (selectedController : parallelControllerForTask? arm before taskId = some controller)
      (selectedRecord : parallelControllerRecord? before controller = some record)
      (regionValid : parallelRegionValid arm before controller record = true)
      (accepted : acceptedParallelResult? arm submitted = some result)
      (condition : evaluateSimpleBooleanExpression arm.completionCondition
        before.variables.process.bindings = some true)
      (incomplete : completedParallelResults?
        (replacePendingParallelSlot controller.slots taskId result) = none)
      (rewrite : after = closeSharedParallelRegion before controller record arm.normalOutput
        before.variables) :
      SharedParallelMultiInstanceCompletionStep arm taskId submitted before after
  | progresses (before after : RuntimeState) (instanceId : SemanticId)
      (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
      (result : String) (firstPending : UserTaskInstanceId)
      (restPending : List UserTaskInstanceId)
      (running : before.control = .running instanceId)
      (sameInstance : taskId.processInstanceId = instanceId)
      (selectedController : parallelControllerForTask? arm before taskId = some controller)
      (selectedRecord : parallelControllerRecord? before controller = some record)
      (regionValid : parallelRegionValid arm before controller record = true)
      (accepted : acceptedParallelResult? arm submitted = some result)
      (condition : evaluateSimpleBooleanExpression arm.completionCondition
        before.variables.process.bindings = some false)
      (incomplete : completedParallelResults?
        (replacePendingParallelSlot controller.slots taskId result) = none)
      (pending : pendingParallelTaskIds
        (replacePendingParallelSlot controller.slots taskId result) = firstPending :: restPending)
      (rewrite : after =
        { before with
          waits := removeParallelChildWaits before.waits [taskId]
          activityOccurrences := replaceParallelRecordBody before.activityOccurrences record
            (firstPending :: restPending)
          parallelMultiInstanceControllers := insertParallelMultiInstanceController
            { controller with
              slots := replacePendingParallelSlot controller.slots taskId result }
            (removeParallelController before.parallelMultiInstanceControllers controller) }) :
      SharedParallelMultiInstanceCompletionStep arm taskId submitted before after

inductive SharedParallelMultiInstanceTimerStep (arm : ParallelMultiInstanceArm)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat) :
    RuntimeState → RuntimeState → Prop where
  | interrupts (before after : RuntimeState) (instanceId : SemanticId)
      (controller : ParallelMultiInstanceController) (record : ActivityOccurrence)
      (deadline : TimerWait)
      (running : before.control = .running instanceId)
      (sameInstance : timerId.processInstanceId = instanceId)
      (selectedController : parallelControllerForTimer? arm before timerId = some controller)
      (selectedRecord : parallelControllerRecord? before controller = some record)
      (regionValid : parallelRegionValid arm before controller record = true)
      (selectedDeadline : before.timerWaits.filter (timerIdNamesWait timerId) = [deadline])
      (due : logicalTimeMs = deadline.deadlineMs)
      (rewrite : after =
        { closeSharedParallelRegion before controller record arm.boundaryTimer.output
            before.variables with
          logicalTimeMs }) :
      SharedParallelMultiInstanceTimerStep arm timerId logicalTimeMs before after

end BpmnSemantics.SemanticProcess
