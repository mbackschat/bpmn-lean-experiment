import BpmnSemantics.SemanticProcess.EventBasedGateway
import BpmnSemantics.SemanticProcess.InclusiveGateway
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
  let instanceId ← runningInstance? state
  pure (activateUserTask state instanceId owner input output task)

def awaitTimerState? (state : RuntimeState) (input output : ControlPlaceId)
    (timer : TimerDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← runningInstance? state
  pure (activateTimer state instanceId owner input output timer)

def awaitMessageState? (state : RuntimeState) (input output : ControlPlaceId)
    (message : MessageDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← runningInstance? state
  pure (activateMessage state instanceId owner input output message)

def awaitEventRaceState? (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : EventRaceMessageArm)
    (timer : EventRaceTimerArm) : Option RuntimeState :=
  armEventRaceState? state origin input message timer

def awaitEffectState? (state : RuntimeState) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← runningInstance? state
  pure (activateEffect state instanceId owner input output effect route)

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
inductive OperationStep : SemanticOperation → RuntimeState → RuntimeState → Prop where
  | initiate (id origin output) (before after : RuntimeState)
      (transition : initiateState? before output = some after) :
      OperationStep (.initiate id origin output) before after
  | enterScope (id origin input childEntry childScopeId)
      (before after : RuntimeState)
      (transition :
        enterScopeState? before input childEntry childScopeId = some after) :
      OperationStep
        (.enterScope id origin input childEntry childScopeId) before after
  | awaitUserTask (id origin input output task) (before after : RuntimeState)
      (transition : awaitUserTaskState? before input output task = some after) :
      OperationStep (.awaitUserTask id origin input output task) before after
  | awaitTimer (id origin input output timer) (before after : RuntimeState)
      (transition : awaitTimerState? before input output timer = some after) :
      OperationStep (.awaitTimer id origin input output timer) before after
  | awaitMessage (id origin input output message) (before after : RuntimeState)
      (transition : awaitMessageState? before input output message = some after) :
      OperationStep (.awaitMessage id origin input output message) before after
  | awaitEventRace (id origin input message timer) (before after : RuntimeState)
      (transition :
        EventRaceArmingStep before origin input message timer after) :
      OperationStep (.awaitEventRace id origin input message timer) before after
  | awaitEffect (id origin input output effect route)
      (before after : RuntimeState)
      (transition :
        awaitEffectState? before input output effect route = some after) :
      OperationStep
        (.awaitEffect id origin input output effect route) before after
  | duplicate (id origin input outputs) (before after : RuntimeState)
      (transition : duplicateState? before input outputs = some after) :
      OperationStep (.duplicate id origin input outputs) before after
  | synchronize (id origin inputs output) (before after : RuntimeState)
      (transition : synchronizeState? before inputs output = some after) :
      OperationStep (.synchronize id origin inputs output) before after
  | choose (id origin input candidates defaultOutput defaultOrigin)
      (before after : RuntimeState)
      (transition :
        chooseState? before input candidates defaultOutput = some after) :
      OperationStep
        (.choose id origin input candidates defaultOutput defaultOrigin)
        before after
  | selectMany (id origin input candidates defaultBranch selectionKey)
      (before after : RuntimeState)
      (transition :
        SelectManyStep before input candidates defaultBranch selectionKey after) :
      OperationStep
        (.selectMany id origin input candidates defaultBranch selectionKey)
        before after
  | synchronizeSelected (id origin inputs output selectionKey)
      (before after : RuntimeState)
      (transition :
        SynchronizeSelectedStep before output selectionKey after) :
      OperationStep
        (.synchronizeSelected id origin inputs output selectionKey) before after
  | throwError (id origin input error handler) (before after : RuntimeState)
      (transition :
        throwErrorState? before input error handler = some after) :
      OperationStep (.throwError id origin input error handler) before after
  | reachNoneEnd (id origin input) (before after : RuntimeState)
      (transition : reachNoneEndState? before input = some after) :
      OperationStep (.reachNoneEnd id origin input) before after
  | completeScope (id origin scopeId parentOutput)
      (before after : RuntimeState)
      (transition :
        completeScopeState? before scopeId parentOutput = some after) :
      OperationStep
        (.completeScope id origin scopeId parentOutput) before after

/-- Executable transition for one operation. It performs no operation selection. -/
def fire? (operation : SemanticOperation) (state : RuntimeState) :
    Option RuntimeState :=
  match operation with
  | .initiate _ _ output => initiateState? state output
  | .enterScope _ _ input childEntry childScopeId =>
      enterScopeState? state input childEntry childScopeId
  | .awaitUserTask _ _ input output task =>
      awaitUserTaskState? state input output task
  | .awaitTimer _ _ input output timer =>
      awaitTimerState? state input output timer
  | .awaitMessage _ _ input output message =>
      awaitMessageState? state input output message
  | .awaitEventRace _ origin input message timer =>
      awaitEventRaceState? state origin input message timer
  | .awaitEffect _ _ input output effect route =>
      awaitEffectState? state input output effect route
  | .duplicate _ _ input outputs => duplicateState? state input outputs
  | .synchronize _ _ inputs output => synchronizeState? state inputs output
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
      completeScopeState? state scopeId parentOutput

theorem fire_sound (operation : SemanticOperation)
    (before after : RuntimeState)
    (result : fire? operation before = some after) :
    OperationStep operation before after := by
  cases operation <;> first
    | exact .initiate _ _ _ before after result
    | exact .enterScope _ _ _ _ _ before after result
    | exact .awaitUserTask _ _ _ _ _ before after result
    | exact .awaitTimer _ _ _ _ _ before after result
    | exact .awaitMessage _ _ _ _ _ before after result
    | exact OperationStep.awaitEventRace _ _ _ _ _ before after
        (armEventRaceState_sound before after _ _ _ _
          (by simpa [fire?, awaitEventRaceState?] using result))
    | exact .awaitEffect _ _ _ _ _ _ before after result
    | exact .duplicate _ _ _ _ before after result
    | exact .synchronize _ _ _ _ before after result
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
        OperationStep operation before after

/-- Select and execute exactly the operation named by the semantic input. -/
def step (program : Program) (state : RuntimeState) (choice : OperationId) :
    Option RuntimeState :=
  match program.operations.find? fun operation =>
      decide (operation.id = choice) with
  | none => none
  | some operation => fire? operation state

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
      · exact fire_sound operation state successor result

end BpmnSemantics.SemanticProcess
