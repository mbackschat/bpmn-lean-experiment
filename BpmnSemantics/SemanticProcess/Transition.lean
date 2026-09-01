import BpmnSemantics.SemanticProcess.WaitActivation
import BpmnSemantics.SemanticProcess.BoundedScopeArming
import BpmnSemantics.SemanticProcess.BoundedScope
import BpmnSemantics.SemanticProcess.BoundedTask
import BpmnSemantics.SemanticProcess.EventBasedGateway
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.TimerStart
import BpmnSemantics.SemanticProcess.TerminateEnd
import BpmnSemantics.SemanticProcess.MonitoredTask
import BpmnSemantics.SemanticProcess.ActivityDataInput
import BpmnSemantics.SemanticProcess.ActivityDataOutput
import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.CyclicControlFlow
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import BpmnSemantics.SemanticProcess.MessageBoundedTask
import BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot

/-! # Semantic Process internal transitions

This module owns the declarative internal-operation relation, the executable evaluator, and their soundness bridge. Runtime representation and pure state transformations remain in `RuntimeState`.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def runningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

def awaitUserTaskState? (state : RuntimeState) (input output : ControlPlaceId)
    (task : UserTaskDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (activateUserTask state owner.processInstanceId owner input output task)

def awaitTimerState? (state : RuntimeState) (input output : ControlPlaceId)
    (timer : TimerDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (activateTimer state owner.processInstanceId owner input output timer)

def awaitMessageState? (state : RuntimeState) (input output : ControlPlaceId)
    (message : MessageDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (activateMessage state owner.processInstanceId owner input output message)

def awaitPayloadMessageState? (state : RuntimeState) (input output : ControlPlaceId)
    (message : MessageDefinition) : Option RuntimeState :=
  awaitMessageState? state input output message

def awaitCorrelatedPayloadMessageState? (state : RuntimeState)
    (input output : ControlPlaceId) (message : MessageDefinition) : Option RuntimeState :=
  awaitMessageState? state input output message

def awaitEventRaceState? (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : EventRaceMessageArm)
    (timer : EventRaceTimerArm) : Option RuntimeState :=
  armEventRaceState? state origin input message timer

def awaitEffectState? (state : RuntimeState) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (activateEffect state owner.processInstanceId owner input output effect route)

def duplicateState? (state : RuntimeState) (input : ControlPlaceId)
    (outputs : List ControlPlaceId) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  pure (duplicateToken state owner input outputs)

def synchronizeState? (state : RuntimeState) (inputs : List ControlPlaceId)
    (output : ControlPlaceId) : Option RuntimeState := do
  let owner ← commonTokenOwner? state inputs
  pure (synchronizeTokens state owner inputs output)

def chooseState? (state : RuntimeState) (input : ControlPlaceId)
    (candidates : List ConditionalCandidate) (defaultOutput : ControlPlaceId) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let output ← selectConditionalOutput candidates defaultOutput
    state.variables.process.bindings
  pure (chooseToken state owner input output)

def reachNoneEndState? (state : RuntimeState) (input : ControlPlaceId) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (reachNoneEndToken state owner input)

def throwErrorState? (state : RuntimeState) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  if owner.definitionScopeId ≠ handler.attachedScopeId ||
      error.code ≠ handler.code ||
      error.errorElementId ≠ handler.origin.errorElementId then none
  else
    let occurrence ← match state.scopeOccurrences.filter fun candidate =>
        decide (candidate.id = owner) with
      | [candidate] => some candidate
      | _ => none
    let parent ← occurrence.parent
    if state.scopeOccurrences.any fun candidate => candidate.id == parent then
      some (interruptScope state owner parent handler.output)
    else none

/-- Declarative transition relation for one explicitly selected Semantic Process operation.

The arms are not uniform in what they claim, and the difference decides what may be cited as
evidence. The test is a criterion rather than a count, because a census drifts from the tree in both
directions: **an arm is the graph of the evaluator whenever passage cannot fail apart from it**, and
that happens in two ways. Twelve arms state `f before ... = some after` for the same `f` that
`fire?` calls, and `initiateMessage` and `initiateTimer` wrap that equation in a single-constructor
inductive. Three arming arms reach the same place by a different route: `BoundedTaskArmingStep`,
`MonitoredTaskArmingStep`, and `BoundedScopeArmingStep` bind their premises and then name the
evaluator's own transformation as the successor, so a wrong `activateBoundedUserTask` or
`armScopeDeadline` produces a wrong relation that the bridge still satisfies. For every arm meeting
the criterion the bridge is one evidence lane, not two.

An arm earns an independent lane only by stating premises the evaluator does not supply.
`MergeExclusiveStep` is the reference shape: it quantifies over an offered token with a membership
premise and admits one transition per offered occurrence, so it is deliberately broader than the
evaluator that selects one of them, and a wrong selection is visible against it.

Falsifiable evidence about meaning comes from runtime-state well-formedness preservation and
monotonicity, not from this relation's agreement with the evaluator on the arms meeting the
criterion above. That evidence is executable in the semantic core over a bounded schedule set; the
quantified Lean obligation over these arms is an open lane, so neither is a substitute for the
other. -/
inductive OperationStep (program : Program) :
    SemanticOperation → RuntimeState → RuntimeState → Prop where
  | initiate (id origin output) (before after : RuntimeState)
      (transition : initiateState? before output = some after) :
      OperationStep program (.initiate id origin output) before after
  | initiateMessage (id origin channel outputs) (before after : RuntimeState)
      (transition : MessageInitiationStep before outputs after) :
      OperationStep program
        (.initiateMessage id origin channel outputs) before after
  | initiateTimer (id origin durationMs outputs) (before after : RuntimeState)
      (transition : TimerInitiationStep before outputs after) :
      OperationStep program
        (.initiateTimer id origin durationMs outputs) before after
  | enterScope (id origin input childEntry childScopeId)
      (before after : RuntimeState)
      (transition :
        enterScopeState? before input childEntry childScopeId = some after) :
      OperationStep program
        (.enterScope id origin input childEntry childScopeId) before after
  | enterBoundedScope (id origin input childEntry childScopeId boundaryTimer)
      (before after : RuntimeState)
      (transition :
        BoundedScopeArmingStep before input childEntry childScopeId boundaryTimer
          after) :
      OperationStep program
        (.enterBoundedScope id origin input childEntry childScopeId boundaryTimer)
        before after
  | invokeProcess (id origin input calledProcessId calledRootScopeId calledEntry
      returnOperationId) (before after : RuntimeState)
      (transition : InvokeProcessStep before origin input calledProcessId
        calledRootScopeId calledEntry returnOperationId after) :
      OperationStep program
        (.invokeProcess id origin input calledProcessId calledRootScopeId
          calledEntry returnOperationId) before after
  | returnProcess (id origin calledProcessId calledRootScopeId callerOutput)
      (before after : RuntimeState)
      (transition : ReturnProcessStep before id origin calledProcessId
        calledRootScopeId callerOutput after) :
      OperationStep program
        (.returnProcess id origin calledProcessId calledRootScopeId callerOutput)
        before after
  | awaitUserTask (id origin input output task) (before after : RuntimeState)
      (transition : awaitUserTaskState? before input output task = some after) :
      OperationStep program (.awaitUserTask id origin input output task) before after
  | awaitDataInputUserTask (id origin input output taskId taskName directInput)
      (before after : RuntimeState)
      (transition : activateDataInputUserTask? before input output taskId taskName
        directInput = some after) :
      OperationStep program
        (.awaitDataInputUserTask id origin input output taskId taskName directInput)
        before after
  | awaitDataOutputUserTask (id origin input output taskId taskName directOutput)
      (before after : RuntimeState)
      (transition : activateDataOutputUserTask? before input output taskId taskName
        = some after) :
      OperationStep program
        (.awaitDataOutputUserTask id origin input output taskId taskName directOutput)
        before after
  | awaitSequentialMultiInstanceUserTask
      (id origin input task data normalOutput boundaryTimer limits)
      (before after : RuntimeState)
      (arm : SequentialMultiInstanceArm)
      (projects : SequentialMultiInstanceArm.ofOperation?
        (.awaitSequentialMultiInstanceUserTask id origin input task data normalOutput
          boundaryTimer limits) = some arm)
      (transition : enterSequentialMultiInstanceWithCompensation? program arm before =
        some after) :
      OperationStep program
        (.awaitSequentialMultiInstanceUserTask id origin input task data normalOutput
          boundaryTimer limits) before after
  | awaitParallelMultiInstanceUserTask
      (id origin input taskId taskName data normalOutput boundaryTimer completionCondition limits)
      (before after : RuntimeState)
      (transition : enterParallelMultiInstanceWithCompensation? program
        { id, origin, input, taskId, taskName, data, normalOutput, boundaryTimer,
          completionCondition, limits } before = some after) :
      OperationStep program
        (.awaitParallelMultiInstanceUserTask id origin input taskId taskName data normalOutput
          boundaryTimer completionCondition limits) before after
  | awaitTimer (id origin input output timer) (before after : RuntimeState)
      (transition : awaitTimerState? before input output timer = some after) :
      OperationStep program (.awaitTimer id origin input output timer) before after
  | awaitMessage (id origin input output message) (before after : RuntimeState)
      (transition : awaitMessageState? before input output message = some after) :
      OperationStep program (.awaitMessage id origin input output message) before after
  | awaitPayloadMessage (id origin input output message directOutput)
      (before after : RuntimeState)
      (transition : awaitPayloadMessageState? before input output message = some after) :
      OperationStep program
        (.awaitPayloadMessage id origin input output message directOutput) before after
  | awaitCorrelatedPayloadMessage
      (id origin input output message correlationKeyId correlationPropertyId
        payloadSelector processPropertySelector) (before after : RuntimeState)
      (transition : awaitCorrelatedPayloadMessageState? before input output message = some after) :
      OperationStep program
        (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector) before after
  | awaitEventRace (id origin input message timer) (before after : RuntimeState)
      (transition :
        EventRaceArmingStep before origin input message timer after) :
      OperationStep program (.awaitEventRace id origin input message timer) before after
  | awaitBoundedUserTask (id origin input task boundaryTimer)
      (before after : RuntimeState)
      (transition :
        BoundedTaskArmingStep before input task boundaryTimer after) :
      OperationStep program
        (.awaitBoundedUserTask id origin input task boundaryTimer) before after
  | awaitMessageBoundedUserTask (id origin input task boundaryMessage)
      (before after : RuntimeState)
      (transition : MessageBoundedTaskArmingStep before input task boundaryMessage after) :
      OperationStep program
        (.awaitMessageBoundedUserTask id origin input task boundaryMessage) before after
  | awaitMonitoredUserTask (id origin input task boundaryTimer)
      (before after : RuntimeState)
      (transition :
        MonitoredTaskArmingStep before input task boundaryTimer after) :
      OperationStep program
        (.awaitMonitoredUserTask id origin input task boundaryTimer) before after
  | awaitEffect (id origin input output effect route)
      (before after : RuntimeState)
      (transition :
        awaitEffectState? before input output effect route = some after) :
      OperationStep program
        (.awaitEffect id origin input output effect route) before after
  | duplicate (id origin input outputs) (before after : RuntimeState)
      (transition : duplicateState? before input outputs = some after) :
      OperationStep program (.duplicate id origin input outputs) before after
  | synchronize (id origin inputs output) (before after : RuntimeState)
      (transition : synchronizeState? before inputs output = some after) :
      OperationStep program (.synchronize id origin inputs output) before after
  | mergeExclusive (id origin inputs output) (before after : RuntimeState)
      (transition : MergeExclusiveStep before inputs output after) :
      OperationStep program
        (.mergeExclusive id origin inputs output) before after
  | choose (id origin input candidates defaultOutput defaultOrigin)
      (before after : RuntimeState)
      (transition :
        chooseState? before input candidates defaultOutput = some after) :
      OperationStep program
        (.choose id origin input candidates defaultOutput defaultOrigin)
        before after
  | selectMany (id origin input candidates defaultBranch selectionKey)
      (before after : RuntimeState)
      (transition :
        SelectManyStep before input candidates defaultBranch selectionKey after) :
      OperationStep program
        (.selectMany id origin input candidates defaultBranch selectionKey)
        before after
  | synchronizeSelected (id origin inputs output selectionKey)
      (before after : RuntimeState)
      (transition :
        SynchronizeSelectedStep before output selectionKey after) :
      OperationStep program
        (.synchronizeSelected id origin inputs output selectionKey) before after
  | throwError (id origin input error handler) (before after : RuntimeState)
      (transition :
        throwErrorState? before input error handler = some after) :
      OperationStep program (.throwError id origin input error handler) before after
  | reachNoneEnd (id origin input) (before after : RuntimeState)
      (transition : reachNoneEndState? before input = some after) :
      OperationStep program (.reachNoneEnd id origin input) before after
  | terminateScope (id origin input scopeId) (before after : RuntimeState)
      (transition :
        TerminateScopeStep program id origin input scopeId before after) :
      OperationStep program
        (.terminateScope id origin input scopeId) before after
  | completeScope (id origin scopeId parentOutput)
      (before after : RuntimeState)
      (transition :
        completeBoundedScope? program before scopeId parentOutput = some after) :
      OperationStep program
        (.completeScope id origin scopeId parentOutput) before after

private def fireWithoutCompensationSnapshots? (program : Program)
    (operation : SemanticOperation)
    (state : RuntimeState) :
    Option RuntimeState :=
  match operation with
  | .initiate _ _ output => initiateState? state output
  | .initiateMessage _ _ _ outputs => initiateMessageState? state outputs
  | .initiateTimer _ _ _ outputs => initiateTimerState? state outputs
  | .enterScope _ _ input childEntry childScopeId =>
      enterScopeState? state input childEntry childScopeId
  | .enterBoundedScope _ _ input childEntry childScopeId boundaryTimer =>
      armBoundedScopeState? state input childEntry childScopeId boundaryTimer
  | .invokeProcess _ origin input calledProcessId calledRootScopeId calledEntry
      returnOperationId =>
      invokeProcessState? state origin input calledProcessId calledRootScopeId
        calledEntry returnOperationId
  | .returnProcess id origin calledProcessId calledRootScopeId callerOutput =>
      returnProcessState? state id origin calledProcessId calledRootScopeId
        callerOutput
  | .awaitUserTask _ _ input output task =>
      awaitUserTaskState? state input output task
  | .awaitDataInputUserTask _ _ input output taskId taskName directInput =>
      activateDataInputUserTask? state input output taskId taskName directInput
  | .awaitDataOutputUserTask _ _ input output taskId taskName _ =>
      activateDataOutputUserTask? state input output taskId taskName
  | operation@(.awaitSequentialMultiInstanceUserTask ..) => do
      let arm ← SequentialMultiInstanceArm.ofOperation? operation
      enterSequentialMultiInstanceWithCompensation? program arm state
  | operation@(.awaitParallelMultiInstanceUserTask ..) => do
      let arm ← ParallelMultiInstanceArm.ofOperation? operation
      enterParallelMultiInstanceWithCompensation? program arm state
  | .completeParallelMultiInstanceUserTask .. => none
  | .awaitTimer _ _ input output timer =>
      awaitTimerState? state input output timer
  | .awaitMessage _ _ input output message =>
      awaitMessageState? state input output message
  | .awaitPayloadMessage _ _ input output message _ =>
      awaitMessageState? state input output message
  | .awaitCorrelatedPayloadMessage _ _ input output message _ _ _ _ =>
      awaitCorrelatedPayloadMessageState? state input output message
  | .awaitEventRace _ origin input message timer =>
      awaitEventRaceState? state origin input message timer
  | .awaitBoundedUserTask _ _ input task boundaryTimer =>
      armBoundedUserTaskState? state input task boundaryTimer
  | .awaitMessageBoundedUserTask _ _ input task boundaryMessage =>
      armMessageBoundedUserTaskState? state input task boundaryMessage
  | .awaitMonitoredUserTask _ _ input task boundaryTimer =>
      armMonitoredUserTaskState? state input task boundaryTimer
  | .awaitEffect _ _ input output effect route =>
      awaitEffectState? state input output effect route
  | .duplicate _ _ input outputs => duplicateState? state input outputs
  | .synchronize _ _ inputs output => synchronizeState? state inputs output
  | .mergeExclusive _ _ inputs output =>
      mergeExclusiveState? state inputs output
  | .choose _ _ input candidates defaultOutput _ =>
      chooseState? state input candidates defaultOutput
  | .selectMany _ _ input candidates defaultBranch selectionKey =>
      selectManyState? state input candidates defaultBranch selectionKey
  | .synchronizeSelected _ _ _ output selectionKey =>
      synchronizeSelectedState? state output selectionKey
  | .throwError _ _ input error handler =>
      throwErrorState? state input error handler
  | .reachNoneEnd _ _ input => reachNoneEndState? state input
  | .terminateScope id origin input scopeId =>
      terminateScopeState? program state id origin input scopeId
  | .completeScope _ _ scopeId parentOutput =>
      completeBoundedScope? program state scopeId parentOutput

/-- Dispatcher and constructor-selection check: `fire?` routes every operation kind to the state
transformation its relation arm names, and the constructor match is exhaustive.

This is worth having and it is not evidence about BPMN meaning. It fails if an operation kind is
routed to the wrong transformation or added without a matching arm; it cannot fail because a
transformation is semantically wrong, for every arm meeting the criterion documented on
`OperationStep`. No capsule may cite it as a semantic evidence lane. -/
private theorem fireWithoutCompensationSnapshots_sound (program : Program)
    (operation : SemanticOperation)
    (before after : RuntimeState)
    (result : fireWithoutCompensationSnapshots? program operation before = some after) :
    OperationStep program operation before after := by
  cases operation <;> first
    | exact .initiate _ _ _ before after result
    | exact .initiateMessage _ _ _ _ before after
        (initiateMessageState_sound before after _ result)
    | exact .initiateTimer _ _ _ _ before after
        (initiateTimerState_sound before after _ result)
    | exact .enterScope _ _ _ _ _ before after result
    | exact OperationStep.enterBoundedScope _ _ _ _ _ _ before after
        (armBoundedScopeState_sound before after _ _ _ _
          (by simpa [fireWithoutCompensationSnapshots?] using result))
    | exact .invokeProcess _ _ _ _ _ _ _ before after
        (invokeProcessState_sound _ _ _ _ _ _ _ _ result)
    | exact .returnProcess _ _ _ _ _ before after
        (returnProcessState_sound _ _ _ _ _ _ _ result)
    | exact .awaitUserTask _ _ _ _ _ before after result
    | exact .awaitDataInputUserTask _ _ _ _ _ _ _ before after result
    | exact .awaitDataOutputUserTask _ _ _ _ _ _ _ before after result
    | rename_i id origin input task data normalOutput boundaryTimer limits
      let arm : SequentialMultiInstanceArm :=
        { input
          taskId := task.id
          taskName := task.name
          normalOutput
          boundaryTimer
          data :=
            { inputDataObjectReferenceId := data.input.dataObjectReferenceId
              taskDataOutputId := data.output.taskDataOutputId
              outputDataObjectReferenceId := data.output.dataObjectReferenceId }
          limits }
      exact OperationStep.awaitSequentialMultiInstanceUserTask
        id origin input task data normalOutput boundaryTimer limits before after arm rfl
        (by simpa [fireWithoutCompensationSnapshots?,
          SequentialMultiInstanceArm.ofOperation?, arm] using result)
    | rename_i id origin input taskId taskName data normalOutput boundaryTimer completionCondition limits
      exact OperationStep.awaitParallelMultiInstanceUserTask
        id origin input taskId taskName data normalOutput boundaryTimer completionCondition limits
        before after (by simpa [fireWithoutCompensationSnapshots?,
          ParallelMultiInstanceArm.ofOperation?] using result)
    | case completeParallelMultiInstanceUserTask =>
        exact False.elim (by simp [fireWithoutCompensationSnapshots?] at result)
    | exact .awaitTimer _ _ _ _ _ before after result
    | exact .awaitMessage _ _ _ _ _ before after result
    | exact .awaitPayloadMessage _ _ _ _ _ _ before after result
    | exact .awaitCorrelatedPayloadMessage _ _ _ _ _ _ _ _ _ before after result
    | exact OperationStep.awaitEventRace _ _ _ _ _ before after
        (armEventRaceState_sound before after _ _ _ _
          (by simpa [fireWithoutCompensationSnapshots?, awaitEventRaceState?] using result))
    | exact OperationStep.awaitBoundedUserTask _ _ _ _ _ before after
        (armBoundedUserTaskState_sound before after _ _ _
          (by simpa [fireWithoutCompensationSnapshots?] using result))
    | exact OperationStep.awaitMessageBoundedUserTask _ _ _ _ _ before after
        (armMessageBoundedUserTaskState_sound before after _ _ _
          (by simpa [fireWithoutCompensationSnapshots?] using result))
    | exact OperationStep.awaitMonitoredUserTask _ _ _ _ _ before after
        (armMonitoredUserTaskState_sound before after _ _ _
          (by simpa [fireWithoutCompensationSnapshots?] using result))
    | exact .awaitEffect _ _ _ _ _ _ before after result
    | exact .duplicate _ _ _ _ before after result
    | exact .synchronize _ _ _ _ before after result
    | exact .mergeExclusive _ _ _ _ before after
        (mergeExclusiveState_sound before after _ _ result)
    | exact .choose _ _ _ _ _ _ before after result
    | exact .selectMany _ _ _ _ _ _ before after
        (selectManyState_sound _ _ _ _ _ _ result)
    | exact .synchronizeSelected _ _ _ _ _ before after
        (synchronizeSelectedState_sound _ _ _ _ result)
    | exact .throwError _ _ _ _ _ before after result
    | exact .reachNoneEnd _ _ _ before after result
    | exact .terminateScope _ _ _ _ before after
        (terminateScopeState_sound program before after _ _ _ _ result)
    | exact .completeScope _ _ _ _ before after result

structure AppliedInternalOperation where
  operation : SemanticOperation
  successor : RuntimeState
  deriving Repr, DecidableEq

inductive InternalOperationAttempt where
  | disabled (operation : SemanticOperation)
  | applied (step : AppliedInternalOperation)
  | refused (operation : SemanticOperation)
      (reason : CompensationParentContextRefusal)
  deriving Repr, DecidableEq

def InternalOperationAttempt.operation : InternalOperationAttempt → SemanticOperation
  | .disabled operation | .refused operation _ => operation
  | .applied step => step.operation

/-- Recover the exact child occurrence created by one successful scope-entry preflight. -/
def childOccurrenceAfterEntry? (state : RuntimeState)
    (input : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (entered : RuntimeState) : Option RuntimeScopeOccurrence := do
  let parent ← onlyTokenOwner? state input
  match entered.scopeOccurrences.filter fun occurrence =>
      occurrence.parent == some parent &&
        occurrence.id.definitionScopeId == childScopeId with
  | [child] => some child
  | _ => none

/-- Apply child entry only after its selected snapshot reservation has been decided. -/
def applyPreparedReservation (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (child : RuntimeScopeOccurrence)
    (apply : RuntimeState → Option RuntimeState) : InternalOperationAttempt :=
  match reserveCompensationParentContext program state child with
  | .refused reason _ => .refused operation reason
  | .disabled prepared | .applied prepared =>
      match apply prepared with
      | none => .disabled operation
      | some successor => .applied { operation, successor }

/-- Compose ordinary child entry with its exact snapshot reservation. -/
def attemptEnterScope (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId) : InternalOperationAttempt :=
  match enterScopeState? state input childEntry childScopeId with
  | none => .disabled operation
  | some entered =>
      match childOccurrenceAfterEntry? state input childScopeId entered with
      | none => .disabled operation
      | some child =>
          applyPreparedReservation program operation state child fun prepared =>
            enterScopeState? prepared input childEntry childScopeId

/-- Compose bounded child entry and arming with its exact snapshot reservation. -/
def attemptEnterBoundedScope (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (boundaryTimer : BoundaryTimerArm) : InternalOperationAttempt :=
  match armBoundedScopeState? state input childEntry childScopeId boundaryTimer with
  | none => .disabled operation
  | some entered =>
      match childOccurrenceAfterEntry? state input childScopeId entered with
      | none => .disabled operation
      | some child =>
          applyPreparedReservation program operation state child fun prepared =>
            armBoundedScopeState? prepared input childEntry childScopeId boundaryTimer

/-- Resolve the sole live occurrence whose completion is being decided. -/
def selectedCompletionOccurrence? (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Option RuntimeScopeOccurrence :=
  match state.scopeOccurrences.filter fun occurrence =>
      occurrence.id.definitionScopeId == scopeId with
  | [occurrence] => some occurrence
  | _ => none

/-- Apply the selected root disposition after the completion transition succeeds. -/
def finishRootCompletion (successor : RuntimeState)
    (occurrence : RuntimeScopeOccurrence)
    (disposition : CompensationParentContextRootDisposition) : RuntimeState :=
  match occurrence.parent with
  | none => purgeCompensationParentContextForRoot successor occurrence disposition
  | some _ => successor

private def scopeOccurrenceIsLive (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Bool :=
  state.scopeOccurrences.any fun occurrence => occurrence.id == owner

private def keepAfterUnsuccessfulScopeRemoval (successor : RuntimeState)
    (retention : CompensationParentContextRetention) : Bool :=
  match retention with
  | .provisional parent _ =>
      scopeOccurrenceIsLive successor parent.id &&
        match parent.parent with
        | none => true
        | some root => scopeOccurrenceIsLive successor root
  | .promoted parent _ _ =>
      match parent.parent with
      | none => scopeOccurrenceIsLive successor parent.id
      | some root => scopeOccurrenceIsLive successor root

/- Regional scope cancellation already removes records owned by the occurrences it withdraws. This
fallback covers other operation families whose successful transition removes a parent or its owning
root without going through that shared cancellation primitive. -/
/-- Purge provisional parents and whole collections whose owning root disappeared unsuccessfully. -/
def purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval
    (successor : RuntimeState) : RuntimeState :=
  { successor with
    compensationParentContextRetentions :=
      successor.compensationParentContextRetentions.filter
        (keepAfterUnsuccessfulScopeRemoval successor) }

/-- Promote the deciding pre-completion context before completing the selected scope. -/
def attemptCompleteScope (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId) :
    InternalOperationAttempt :=
  match completeBoundedScope? program state scopeId parentOutput,
      selectedCompletionOccurrence? state scopeId with
  | some _, some occurrence =>
      match promoteCompensationParentContext program state occurrence with
      | .refused reason _ => .refused operation reason
      | .disabled prepared =>
          match completeBoundedScope? program prepared scopeId parentOutput with
          | none => .disabled operation
          | some successor =>
              .applied
                { operation
                  successor := finishRootCompletion successor occurrence .discard }
      | .applied prepared =>
          match completeBoundedScope? program prepared scopeId parentOutput with
          | none => .disabled operation
          | some successor =>
              .applied
                { operation
                  successor := finishRootCompletion successor occurrence .retainPromoted }
  | _, _ => .disabled operation

/-- Evaluate one exact Program operation through the closed snapshot-aware attempt boundary. -/
def attemptInternalOperation (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) : InternalOperationAttempt :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      match fireWithoutCompensationSnapshots? program operation state with
      | none => .disabled operation
      | some successor => .applied { operation, successor }
  | some _ =>
      match operation with
      | .enterScope _ _ input childEntry childScopeId =>
          attemptEnterScope program operation state input childEntry childScopeId
      | .enterBoundedScope _ _ input childEntry childScopeId boundaryTimer =>
          attemptEnterBoundedScope program operation state input childEntry childScopeId
            boundaryTimer
      | .completeScope _ _ scopeId parentOutput =>
          attemptCompleteScope program operation state scopeId parentOutput
      | _ =>
          match fireWithoutCompensationSnapshots? program operation state with
          | none => .disabled operation
          | some successor =>
              .applied
                { operation
                  successor :=
                    purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval successor }

/-- The legacy operation evaluator is mechanically restricted to declaration-free Programs. -/
def fire? (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) : Option RuntimeState :=
  match program.compensationEventSubProcessSnapshots with
  | none => fireWithoutCompensationSnapshots? program operation state
  | some _ => none

theorem fire_withSnapshotDeclaration_is_disabled (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    fire? program operation state = none := by
  simp [fire?, declared]

@[simp] theorem fire_mergeExclusive_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.mergeExclusive id origin inputs output) state =
      mergeExclusiveState? state inputs output := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_choose_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (candidates : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId) (defaultOrigin : BpmnSequenceFlowOrigin)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.choose id origin input candidates defaultOutput defaultOrigin) state =
      chooseState? state input candidates defaultOutput := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_reachNoneEnd_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.reachNoneEnd id origin input) state =
      reachNoneEndState? state input := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_awaitUserTask_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.awaitUserTask id origin input output task) state =
      awaitUserTaskState? state input output task := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_awaitMessage_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (message : MessageDefinition)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.awaitMessage id origin input output message) state =
      awaitMessageState? state input output message := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_awaitPayloadMessage_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (message : MessageDefinition)
    (directOutput : DirectCatchEventPayloadOutput)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.awaitPayloadMessage id origin input output message directOutput) state =
      awaitMessageState? state input output message := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_awaitCorrelatedPayloadMessage_withoutSnapshotDeclaration
    (program : Program) (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (message : MessageDefinition) (correlationKeyId correlationPropertyId : String)
    (payloadSelector : CorrelationMessagePath)
    (processPropertySelector : CorrelationProcessPropertyPath)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program
        (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector) state =
      awaitCorrelatedPayloadMessageState? state input output message := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_awaitTimer_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (timer : TimerDefinition)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.awaitTimer id origin input output timer) state =
      awaitTimerState? state input output timer := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

@[simp] theorem fire_awaitEffect_withoutSnapshotDeclaration (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition)
    (route : Option BpmnErrorRoute)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    fire? program (.awaitEffect id origin input output effect route) state =
      awaitEffectState? state input output effect route := by
  simp [fire?, absent, fireWithoutCompensationSnapshots?]

theorem fire_isSome_snapshotDeclaration_is_absent (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (enabled : (fire? program operation state).isSome = true) :
    program.compensationEventSubProcessSnapshots = none := by
  cases declared : program.compensationEventSubProcessSnapshots with
  | none => rfl
  | some _ => simp [fire?, declared] at enabled

theorem fire_sound (program : Program) (operation : SemanticOperation)
    (before after : RuntimeState)
    (result : fire? program operation before = some after) :
    OperationStep program operation before after := by
  cases declared : program.compensationEventSubProcessSnapshots with
  | none =>
      exact fireWithoutCompensationSnapshots_sound program operation before after
        (by simpa [fire?, declared] using result)
  | some _ => simp [fire?, declared] at result

/-- Snapshot-free Programs use the original two-arm evaluator without reducing snapshot validation. This equality is semantic compatibility and a resource invariant because legacy kernel fixtures reduce the dispatcher repeatedly. -/
theorem attemptInternalOperation_withoutSnapshotDeclaration
    (program : Program) (operation : SemanticOperation) (state : RuntimeState)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    attemptInternalOperation program operation state =
      match fire? program operation state with
      | none => .disabled operation
      | some successor => .applied { operation, successor } := by
  simp [attemptInternalOperation, fire?, absent]

/-- Program relation keeps the explicit selected operation identity as semantic input. -/
def ProgramStep (program : Program) (before : RuntimeState)
    (choice : OperationId) (after : RuntimeState) : Prop :=
  ∃ operation,
    operation ∈ program.operations ∧
      operation.id = choice ∧
        OperationStep program operation before after

/-- Select and execute exactly the operation named by the semantic input. -/
def step (program : Program) (state : RuntimeState) (choice : OperationId) :
    Option RuntimeState :=
  match program.operations.find? fun operation =>
      decide (operation.id = choice) with
  | none => none
  | some operation => fire? program operation state

/-- The same dispatcher and constructor-selection check as `fire_sound`, one level up: `step`
resolves the named operation identity and hands it to `fire?`.

It establishes operation selection, not that the selected operation means what it should. -/
theorem step_sound :
    Obligations.evaluator_sound ProgramStep step := by
  intro program state choice successor result
  unfold step at result
  generalize selectedEq :
      program.operations.find? (fun operation =>
        decide (operation.id = choice)) = selected at result
  cases selected with
  | none => simp at result
  | some operation =>
      refine ⟨operation, List.mem_of_find?_eq_some selectedEq, ?_, ?_⟩
      · have selectedMatches : decide (operation.id = choice) = true :=
          List.find?_some
            (p := fun candidate : SemanticOperation =>
              decide (candidate.id = choice))
            selectedEq
        exact of_decide_eq_true selectedMatches
      · exact fire_sound program operation state successor result

/-- Program relation for the exact snapshot-aware three-arm evaluator. -/
def AttemptProgramStep (program : Program) (before : RuntimeState)
    (choice : OperationId) (after : RuntimeState) : Prop :=
  ∃ operation step,
    operation ∈ program.operations ∧
      operation.id = choice ∧
        attemptInternalOperation program operation before = .applied step ∧
          step.successor = after

theorem attemptInternalOperation_sound (program : Program)
    (operation : SemanticOperation) (before : RuntimeState)
    (step : AppliedInternalOperation)
    (result : attemptInternalOperation program operation before = .applied step)
    (present : operation ∈ program.operations) :
    AttemptProgramStep program before operation.id step.successor := by
  exact ⟨operation, step, present, rfl, result, rfl⟩

/-- A successful attempt for a declaration-free Program remains an ordinary Program step. -/
theorem attemptProgramStep_withoutSnapshotDeclaration
    (program : Program) (before : RuntimeState) (choice : OperationId)
    (after : RuntimeState)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (attempted : AttemptProgramStep program before choice after) :
    ProgramStep program before choice after := by
  rcases attempted with
    ⟨operation, step, present, selected, evaluated, successor⟩
  cases fired : fire? program operation before with
  | none =>
      rw [attemptInternalOperation_withoutSnapshotDeclaration
        program operation before absent, fired] at evaluated
      contradiction
  | some firedSuccessor =>
      rw [attemptInternalOperation_withoutSnapshotDeclaration
        program operation before absent, fired] at evaluated
      have stepEq :
          { operation := operation, successor := firedSuccessor } = step :=
        InternalOperationAttempt.applied.inj evaluated
      have firedSuccessorEq : firedSuccessor = step.successor :=
        congrArg AppliedInternalOperation.successor stepEq
      exact ⟨operation, present, selected,
        fire_sound program operation before after
          (by simpa [firedSuccessorEq.trans successor] using fired)⟩

end BpmnSemantics.SemanticProcess
