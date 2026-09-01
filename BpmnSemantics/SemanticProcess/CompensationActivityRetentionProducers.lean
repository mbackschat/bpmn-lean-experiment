import BpmnSemantics.SemanticProcess.CompensationActivityRetention
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition

/-! # Compensation Activity retention producers

This module is the single integration layer between the approved hidden compensation-retention
classifier and the existing Activity completion transitions. It stages retention before any terminal
rewrite and delegates every absent-declaration or non-target case to the legacy transition unchanged.
It defines no handler execution, source admission, public observation, or hosting behavior.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def compensationTargetDeclaredForFamily (program : Program) (activityElementId : NodeId)
    (family : CompensationActivityOperationFamily) : Bool :=
  match program.compensationActivityRetention with
  | none => false
  | some declaration =>
      declaration.targets.any (fun target => target.activityElementId == activityElementId) &&
        compensationActivityTargetFamily? program declaration activityElementId = some family

def stageDeclaredCompensationCompletion? (program : Program)
    (family : CompensationActivityOperationFamily) (owner : ScopeOccurrenceId)
    (facts : CompensationCompletionFacts) (state : RuntimeState) : Option RuntimeState :=
  if !compensationTargetDeclaredForFamily program
      ⟨facts.activity.activityElementId.value⟩ family then
    some state
  else
    match retainCompletedCompensableActivity program owner facts state with
    | .retained successor _ => some successor
    | .notRetained successor => some successor
    | .refused _ _ => none

def matchingOrdinaryUserTaskWait? (state : RuntimeState) (taskId : UserTaskInstanceId) :
    Option UserTaskWait :=
  state.waits.find? fun wait =>
    decide (wait.processInstanceId = taskId.processInstanceId &&
      wait.task.id = ⟨taskId.elementId.value⟩ && wait.activation = taskId.activation)

/-- Exact ordinary `awaitUserTask` completion with retention staged before wait consumption. -/
def completeOrdinaryUserTaskWithCompensation?
    (completeLegacy : RuntimeState → SemanticId → TaskDefinitionId → Nat →
      Option RuntimeState)
    (program : Program) (state : RuntimeState) (taskId : UserTaskInstanceId) :
    Option RuntimeState := do
  if compensationTargetDeclaredForFamily program ⟨taskId.elementId.value⟩
      .ordinaryUserTask then
    let wait ← matchingOrdinaryUserTaskWait? state taskId
    let activity : ActivityOccurrenceId :=
      { processInstanceId := wait.processInstanceId
        activityElementId := ⟨wait.task.id.value⟩
        activation := wait.activation }
    let identityStaged :=
      { state with
        activityActivations := setActivationCount state.activityActivations wait.task.id
          (Nat.max (activityActivationCount state wait.task.id) wait.activation) }
    let staged ← stageDeclaredCompensationCompletion? program .ordinaryUserTask wait.owner
      (.ordinaryUserTask activity) identityStaged
    completeLegacy staged taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation
  else
    completeLegacy state taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation

def activityOccurrenceId (record : ActivityOccurrence) : ActivityOccurrenceId :=
  { processInstanceId := record.processInstanceId
    activityElementId := ⟨record.activityElementId.value⟩
    activation := record.activation }

/-- Sequential child completion retains only the terminal all-success outer occurrence. -/
def completeSequentialMultiInstanceWithCompensation? (program : Program)
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) (body : OccurrenceId)
    (submitted : List VariableBinding) : Option RuntimeState := do
  let legacy ← completeSequentialMultiInstanceInnerTask? arm state body submitted
  let record ← activityOccurrenceForTask? state.activityOccurrences body
  let controller ← sequentialMultiInstanceControllerFor?
    state.sequentialMultiInstanceControllers record
  let completed := completedInstanceCount controller + 1
  if completed < controller.snapshot.length then
    some legacy
  else
    let staged ← stageDeclaredCompensationCompletion? program .multiInstanceUserTask
      record.owner
      (.multiInstanceUserTask (activityOccurrenceId record) controller.snapshot.length completed
        .allSuccessfulCompletion)
      state
    completeSequentialMultiInstanceInnerTask? arm staged body submitted

/-- Parallel child completion gives an all-filled slot set priority over `first`; a real early winner
is classified explicitly but creates no retained record. -/
def completeParallelMultiInstanceWithCompensation? (program : Program)
    (arm : ParallelMultiInstanceArm) (state : RuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) : Option RuntimeState := do
  let legacy ← completeSharedParallelMultiInstance? arm state taskId submitted
  let controller ← parallelControllerForTask? arm state taskId
  let record ← parallelControllerRecord? state controller
  let result ← acceptedParallelResult? arm submitted
  let updatedSlots := replacePendingParallelSlot controller.slots taskId result
  let completed := parallelCompletedInstanceCount controller + 1
  match completedParallelResults? updatedSlots with
  | some _ =>
      let staged ← stageDeclaredCompensationCompletion? program .multiInstanceUserTask
        record.owner
        (.multiInstanceUserTask (activityOccurrenceId record) controller.snapshot.length completed
          .allSuccessfulCompletion)
        state
      completeSharedParallelMultiInstance? arm staged taskId submitted
  | none =>
      let condition ← evaluateSimpleBooleanExpression arm.completionCondition
        state.variables.process.bindings
      if condition then
        let staged ← stageDeclaredCompensationCompletion? program .multiInstanceUserTask
          record.owner
          (.multiInstanceUserTask (activityOccurrenceId record) controller.snapshot.length completed
            .earlyCompletion)
          state
        completeSharedParallelMultiInstance? arm staged taskId submitted
      else
        some legacy

/-- Sequential lifetime interruption classifies the exact outer occurrence before cancellation. -/
def interruptSequentialMultiInstanceWithCompensation? (program : Program)
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat) : Option RuntimeState := do
  let _ ← interruptSequentialMultiInstance? arm state timerId logicalTimeMs
  let record ← activityOccurrenceForTimer? state.activityOccurrences timerId
  let controller ← sequentialMultiInstanceControllerFor?
    state.sequentialMultiInstanceControllers record
  let staged ← stageDeclaredCompensationCompletion? program .multiInstanceUserTask record.owner
    (.multiInstanceUserTask (activityOccurrenceId record) controller.snapshot.length
      (completedInstanceCount controller) .interrupted)
    state
  interruptSequentialMultiInstance? arm staged timerId logicalTimeMs

/-- Parallel lifetime interruption classifies the exact outer occurrence before cancellation. -/
def interruptParallelMultiInstanceWithCompensation? (program : Program)
    (arm : ParallelMultiInstanceArm) (state : RuntimeState) (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat) : Option RuntimeState := do
  let _ ← interruptSharedParallelMultiInstance? arm state timerId logicalTimeMs
  let controller ← parallelControllerForTimer? arm state timerId
  let record ← parallelControllerRecord? state controller
  let staged ← stageDeclaredCompensationCompletion? program .multiInstanceUserTask record.owner
    (.multiInstanceUserTask (activityOccurrenceId record) controller.snapshot.length
      (parallelCompletedInstanceCount controller) .interrupted)
    state
  interruptSharedParallelMultiInstance? arm staged timerId logicalTimeMs

/-- Sequential entry retains a fresh outer identity only for the atomic zero-item completion arm. -/
def enterSequentialMultiInstanceWithCompensation? (program : Program)
    (arm : SequentialMultiInstanceArm) (state : RuntimeState) : Option RuntimeState := do
  let legacy ← enterSequentialMultiInstance? arm state
  let snapshot ← admittedSnapshot? arm state
  match snapshot with
  | _ :: _ => some legacy
  | [] =>
      if !compensationTargetDeclaredForFamily program ⟨arm.taskId.value⟩
          .multiInstanceUserTask then
        some legacy
      else
        let instanceId ← match state.control with
          | .running instanceId => some instanceId
          | _ => none
        let owner ← onlyTokenOwner? state arm.input
        let issued := issueZeroItemOuterActivity state instanceId arm.taskId
        let staged ← stageDeclaredCompensationCompletion? program .multiInstanceUserTask owner
          (.multiInstanceUserTask issued.activity 0 0 .allSuccessfulCompletion)
          issued.successor
        enterSequentialMultiInstance? arm staged

/-- Parallel entry retains a fresh outer identity only for the atomic zero-item completion arm. -/
def enterParallelMultiInstanceWithCompensation? (program : Program)
    (arm : ParallelMultiInstanceArm) (state : RuntimeState) : Option RuntimeState := do
  let legacy ← enterSharedParallelMultiInstance? arm state
  let snapshot ← admittedSharedParallelSnapshot? arm state
  match snapshot with
  | _ :: _ => some legacy
  | [] =>
      if !compensationTargetDeclaredForFamily program ⟨arm.taskId.value⟩
          .multiInstanceUserTask then
        some legacy
      else
        let instanceId ← match state.control with
          | .running instanceId => some instanceId
          | _ => none
        let owner ← onlyTokenOwner? state arm.input
        let issued := issueZeroItemOuterActivity state instanceId arm.taskId
        let staged ← stageDeclaredCompensationCompletion? program .multiInstanceUserTask owner
          (.multiInstanceUserTask issued.activity 0 0 .allSuccessfulCompletion)
          issued.successor
        enterSharedParallelMultiInstance? arm staged

end BpmnSemantics.SemanticProcess
