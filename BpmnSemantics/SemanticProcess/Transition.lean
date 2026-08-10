import BpmnSemantics.SemanticProcess.BoundedScope
import BpmnSemantics.SemanticProcess.BoundedTask
import BpmnSemantics.SemanticProcess.EventBasedGateway
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.MonitoredTask
import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.CyclicControlFlow
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

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

/-- Declarative transition relation for one explicitly selected Semantic Process operation. -/
inductive OperationStep (program : Program) :
    SemanticOperation → RuntimeState → RuntimeState → Prop where
  | initiate (id origin output) (before after : RuntimeState)
      (transition : initiateState? before output = some after) :
      OperationStep program (.initiate id origin output) before after
  | initiateMessage (id origin channel outputs) (before after : RuntimeState)
      (transition : MessageInitiationStep before outputs after) :
      OperationStep program
        (.initiateMessage id origin channel outputs) before after
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
  | awaitTimer (id origin input output timer) (before after : RuntimeState)
      (transition : awaitTimerState? before input output timer = some after) :
      OperationStep program (.awaitTimer id origin input output timer) before after
  | awaitMessage (id origin input output message) (before after : RuntimeState)
      (transition : awaitMessageState? before input output message = some after) :
      OperationStep program (.awaitMessage id origin input output message) before after
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
  | completeScope (id origin scopeId parentOutput)
      (before after : RuntimeState)
      (transition :
        completeBoundedScope? program before scopeId parentOutput = some after) :
      OperationStep program
        (.completeScope id origin scopeId parentOutput) before after

/-- Executable transition for one operation. It performs no operation selection. -/
def fire? (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) :
    Option RuntimeState :=
  match operation with
  | .initiate _ _ output => initiateState? state output
  | .initiateMessage _ _ _ outputs => initiateMessageState? state outputs
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
  | .awaitTimer _ _ input output timer =>
      awaitTimerState? state input output timer
  | .awaitMessage _ _ input output message =>
      awaitMessageState? state input output message
  | .awaitEventRace _ origin input message timer =>
      awaitEventRaceState? state origin input message timer
  | .awaitBoundedUserTask _ _ input task boundaryTimer =>
      armBoundedUserTaskState? state input task boundaryTimer
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
  | .completeScope _ _ scopeId parentOutput =>
      completeBoundedScope? program state scopeId parentOutput

theorem fire_sound (program : Program) (operation : SemanticOperation)
    (before after : RuntimeState)
    (result : fire? program operation before = some after) :
    OperationStep program operation before after := by
  cases operation <;> first
    | exact .initiate _ _ _ before after result
    | exact .initiateMessage _ _ _ _ before after
        (initiateMessageState_sound before after _ result)
    | exact .enterScope _ _ _ _ _ before after result
    | exact OperationStep.enterBoundedScope _ _ _ _ _ _ before after
        (armBoundedScopeState_sound before after _ _ _ _
          (by simpa [fire?] using result))
    | exact .invokeProcess _ _ _ _ _ _ _ before after
        (invokeProcessState_sound _ _ _ _ _ _ _ _ result)
    | exact .returnProcess _ _ _ _ _ before after
        (returnProcessState_sound _ _ _ _ _ _ _ result)
    | exact .awaitUserTask _ _ _ _ _ before after result
    | exact .awaitTimer _ _ _ _ _ before after result
    | exact .awaitMessage _ _ _ _ _ before after result
    | exact OperationStep.awaitEventRace _ _ _ _ _ before after
        (armEventRaceState_sound before after _ _ _ _
          (by simpa [fire?, awaitEventRaceState?] using result))
    | exact OperationStep.awaitBoundedUserTask _ _ _ _ _ before after
        (armBoundedUserTaskState_sound before after _ _ _
          (by simpa [fire?] using result))
    | exact OperationStep.awaitMonitoredUserTask _ _ _ _ _ before after
        (armMonitoredUserTaskState_sound before after _ _ _
          (by simpa [fire?] using result))
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
    | exact .completeScope _ _ _ _ before after result

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

/-- Every evaluator-produced transition is permitted by the declarative program relation. -/
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

end BpmnSemantics.SemanticProcess
