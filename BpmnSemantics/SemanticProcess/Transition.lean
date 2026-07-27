import BpmnSemantics.SemanticProcess.Lowering

/-! # Semantic Process internal transitions

This module owns committed runtime state, token operations, the declarative internal-operation relation, the executable internal evaluator, and its soundness bridge. External stimuli, closure, observations, and capsule fixtures remain separate.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive ProcessControl where
  | notStarted
  | running (instanceId : SemanticId)
  | completed (instanceId : SemanticId)
  deriving Repr, DecidableEq

structure UserTaskWait where
  processInstanceId : SemanticId
  task : UserTaskDefinition
  activation : Nat
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure TimerWait where
  processInstanceId : SemanticId
  elementId : NodeId
  activation : Nat
  deadlineMs : Nat
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure EffectWait where
  processInstanceId : SemanticId
  elementId : NodeId
  activation : Nat
  descriptor : EffectDescriptor
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure TaskActivation where
  taskId : TaskDefinitionId
  count : Nat
  deriving Repr, DecidableEq

structure TimerActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure EffectActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure RuntimeState where
  control : ProcessControl
  initiationPending : Bool
  tokens : List ControlPlaceId
  waits : List UserTaskWait
  timerWaits : List TimerWait
  effectWaits : List EffectWait
  activations : List TaskActivation
  timerActivations : List TimerActivation
  effectActivations : List EffectActivation
  endOccurrences : Nat
  logicalTimeMs : Nat
  deriving Repr, DecidableEq

def initialState : RuntimeState :=
  { control := .notStarted
    initiationPending := false
    tokens := []
    waits := []
    timerWaits := []
    effectWaits := []
    activations := []
    timerActivations := []
    effectActivations := []
    endOccurrences := 0
    logicalTimeMs := 0 }

def runningStartState (instanceId : SemanticId) : RuntimeState :=
  { initialState with
    control := .running instanceId
    initiationPending := true }

def tokenMultiplicity (state : RuntimeState) (place : ControlPlaceId) : Nat :=
  (state.tokens.filter fun token => decide (token = place)).length

def hasToken (state : RuntimeState) (place : ControlPlaceId) : Bool :=
  tokenMultiplicity state place > 0

private def removeToken : List ControlPlaceId → ControlPlaceId →
    List ControlPlaceId
  | [], _ => []
  | token :: rest, place =>
      if token = place then rest else token :: removeToken rest place

private def removeTokens (tokens : List ControlPlaceId)
    (places : List ControlPlaceId) : List ControlPlaceId :=
  places.foldl removeToken tokens

private def addTokens (tokens : List ControlPlaceId)
    (places : List ControlPlaceId) : List ControlPlaceId :=
  places.foldr List.cons tokens

private def activationCount (state : RuntimeState) (taskId : TaskDefinitionId) :
    Nat :=
  (state.activations.find? fun activation =>
    decide (activation.taskId = taskId)).map (·.count) |>.getD 0

private def setActivationCount (activations : List TaskActivation)
    (taskId : TaskDefinitionId) (count : Nat) : List TaskActivation :=
  { taskId, count } ::
    activations.filter fun activation => decide (activation.taskId ≠ taskId)

private def timerActivationCount (state : RuntimeState) (elementId : NodeId) :
    Nat :=
  (state.timerActivations.find? fun activation =>
    decide (activation.elementId = elementId)).map (·.count) |>.getD 0

private def setTimerActivationCount (activations : List TimerActivation)
    (elementId : NodeId) (count : Nat) : List TimerActivation :=
  { elementId, count } ::
    activations.filter fun activation =>
      decide (activation.elementId ≠ elementId)

private def effectActivationCount (state : RuntimeState) (elementId : NodeId) :
    Nat :=
  (state.effectActivations.find? fun activation =>
    decide (activation.elementId = elementId)).map (·.count) |>.getD 0

private def setEffectActivationCount (activations : List EffectActivation)
    (elementId : NodeId) (count : Nat) : List EffectActivation :=
  { elementId, count } ::
    activations.filter fun activation =>
      decide (activation.elementId ≠ elementId)

private def activateUserTask (state : RuntimeState) (instanceId : SemanticId)
    (input output : ControlPlaceId) (task : UserTaskDefinition) : RuntimeState :=
  let activation := activationCount state task.id + 1
  { state with
    tokens := removeToken state.tokens input
    waits :=
      { processInstanceId := instanceId
        task
        activation
        output } :: state.waits
    activations := setActivationCount state.activations task.id activation }

private def activateTimer (state : RuntimeState) (instanceId : SemanticId)
    (input output : ControlPlaceId) (timer : TimerDefinition) : RuntimeState :=
  let activation := timerActivationCount state timer.elementId + 1
  { state with
    tokens := removeToken state.tokens input
    timerWaits :=
      { processInstanceId := instanceId
        elementId := timer.elementId
        activation
        deadlineMs := state.logicalTimeMs + timer.durationMs
        output } :: state.timerWaits
    timerActivations :=
      setTimerActivationCount state.timerActivations timer.elementId activation }

private def activateEffect (state : RuntimeState) (instanceId : SemanticId)
    (input output : ControlPlaceId) (effect : EffectDefinition) : RuntimeState :=
  let activation := effectActivationCount state effect.elementId + 1
  { state with
    tokens := removeToken state.tokens input
    effectWaits :=
      { processInstanceId := instanceId
        elementId := effect.elementId
        activation
        descriptor := effect.descriptor
        output } :: state.effectWaits
    effectActivations :=
      setEffectActivationCount state.effectActivations
        effect.elementId activation }

private def duplicateToken (state : RuntimeState) (input : ControlPlaceId)
    (outputs : List ControlPlaceId) : RuntimeState :=
  { state with
    tokens := addTokens (removeToken state.tokens input) outputs }

private def synchronizeTokens (state : RuntimeState)
    (inputs : List ControlPlaceId) (output : ControlPlaceId) : RuntimeState :=
  { state with
    tokens := output :: removeTokens state.tokens inputs }

private def terminateToken (state : RuntimeState) (instanceId : SemanticId)
    (input : ControlPlaceId) : RuntimeState :=
  let tokens := removeToken state.tokens input
  let completed :=
    tokens.isEmpty && state.waits.isEmpty && state.timerWaits.isEmpty &&
      state.effectWaits.isEmpty &&
      !state.initiationPending
  { state with
    control := if completed then .completed instanceId else state.control
    tokens
    endOccurrences := state.endOccurrences + 1 }

/-- Declarative transition relation for one explicitly selected Semantic Process operation. -/
inductive OperationStep : SemanticOperation → RuntimeState → RuntimeState → Prop where
  | initiate (id origin output) (state : RuntimeState)
      (pending : state.initiationPending = true) :
      OperationStep
        (.initiate id origin output)
        state
        { state with
          initiationPending := false
          tokens := output :: state.tokens }
  | awaitUserTask (id origin input output task) (state : RuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled : hasToken state input = true) :
      OperationStep
        (.awaitUserTask id origin input output task)
        state
        (activateUserTask state instanceId input output task)
  | awaitTimer (id origin input output timer) (state : RuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled : hasToken state input = true) :
      OperationStep
        (.awaitTimer id origin input output timer)
        state
        (activateTimer state instanceId input output timer)
  | awaitEffect (id origin input output effect) (state : RuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled : hasToken state input = true) :
      OperationStep
        (.awaitEffect id origin input output effect)
        state
        (activateEffect state instanceId input output effect)
  | duplicate (id origin input outputs) (state : RuntimeState)
      (enabled : hasToken state input = true) :
      OperationStep
        (.duplicate id origin input outputs)
        state
        (duplicateToken state input outputs)
  | synchronize (id origin inputs output) (state : RuntimeState)
      (enabled : inputs.all (hasToken state) = true) :
      OperationStep
        (.synchronize id origin inputs output)
        state
        (synchronizeTokens state inputs output)
  | terminate (id origin input) (state : RuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled : hasToken state input = true) :
      OperationStep
        (.terminate id origin input)
        state
        (terminateToken state instanceId input)

/-- Executable transition for one operation. It performs no operation selection. -/
def fire? (operation : SemanticOperation) (state : RuntimeState) :
    Option RuntimeState :=
  match operation with
  | .initiate _ _ output =>
      if state.initiationPending then
        some
          { state with
            initiationPending := false
            tokens := output :: state.tokens }
      else
        none
  | .awaitUserTask _ _ input output task =>
      match state.control with
      | .running instanceId =>
          if hasToken state input then
            some (activateUserTask state instanceId input output task)
          else
            none
      | .notStarted
      | .completed _ => none
  | .awaitTimer _ _ input output timer =>
      match state.control with
      | .running instanceId =>
          if hasToken state input then
            some (activateTimer state instanceId input output timer)
          else
            none
      | .notStarted
      | .completed _ => none
  | .awaitEffect _ _ input output effect =>
      match state.control with
      | .running instanceId =>
          if hasToken state input then
            some (activateEffect state instanceId input output effect)
          else
            none
      | .notStarted
      | .completed _ => none
  | .duplicate _ _ input outputs =>
      if hasToken state input then
        some (duplicateToken state input outputs)
      else
        none
  | .synchronize _ _ inputs output =>
      if inputs.all (hasToken state) then
        some (synchronizeTokens state inputs output)
      else
        none
  | .terminate _ _ input =>
      match state.control with
      | .running instanceId =>
          if hasToken state input then
            some (terminateToken state instanceId input)
          else
            none
      | .notStarted
      | .completed _ => none

theorem fire_sound (operation : SemanticOperation)
    (before after : RuntimeState)
    (result : fire? operation before = some after) :
    OperationStep operation before after := by
  cases operation with
  | initiate id origin output =>
      by_cases pending : before.initiationPending = true
      · simp [fire?, pending] at result
        subst after
        exact .initiate id origin output before pending
      · simp [fire?, pending] at result
  | awaitUserTask id origin input output task =>
      cases controlEq : before.control with
      | notStarted => simp [fire?, controlEq] at result
      | completed instanceId => simp [fire?, controlEq] at result
      | running instanceId =>
          by_cases enabled : hasToken before input = true
          · simp [fire?, controlEq, enabled] at result
            subst after
            exact .awaitUserTask id origin input output task before
              instanceId controlEq enabled
          · simp [fire?, controlEq, enabled] at result
  | awaitTimer id origin input output timer =>
      cases controlEq : before.control with
      | notStarted => simp [fire?, controlEq] at result
      | completed instanceId => simp [fire?, controlEq] at result
      | running instanceId =>
          by_cases enabled : hasToken before input = true
          · simp [fire?, controlEq, enabled] at result
            subst after
            exact .awaitTimer id origin input output timer before
              instanceId controlEq enabled
          · simp [fire?, controlEq, enabled] at result
  | awaitEffect id origin input output effect =>
      cases controlEq : before.control with
      | notStarted => simp [fire?, controlEq] at result
      | completed instanceId => simp [fire?, controlEq] at result
      | running instanceId =>
          by_cases enabled : hasToken before input = true
          · simp [fire?, controlEq, enabled] at result
            subst after
            exact .awaitEffect id origin input output effect before
              instanceId controlEq enabled
          · simp [fire?, controlEq, enabled] at result
  | duplicate id origin input outputs =>
      by_cases enabled : hasToken before input = true
      · simp [fire?, enabled] at result
        subst after
        exact .duplicate id origin input outputs before enabled
      · simp [fire?, enabled] at result
  | synchronize id origin inputs output =>
      by_cases enabled : inputs.all (hasToken before) = true
      · simp [fire?, enabled] at result
        subst after
        exact .synchronize id origin inputs output before enabled
      · simp [fire?, enabled] at result
  | terminate id origin input =>
      cases controlEq : before.control with
      | notStarted => simp [fire?, controlEq] at result
      | completed instanceId => simp [fire?, controlEq] at result
      | running instanceId =>
          by_cases enabled : hasToken before input = true
          · simp [fire?, controlEq, enabled] at result
            subst after
            exact .terminate id origin input before instanceId controlEq enabled
          · simp [fire?, controlEq, enabled] at result

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

