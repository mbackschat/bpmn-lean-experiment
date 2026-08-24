import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Wait activation

This module owns the transitions that arm one wait of each family: User Task, Timer, bounded User
Task, Message, and effect. Each mints the occurrence identity from its own counter family and inserts
into the collection that holds it.

Separate from `RuntimeState` because arming a wait is a transition while that module is the
representation it transitions over, and the representation module had grown to hold both. Nothing
here is read by the representation: the dependency runs one way, which is what made the split
behaviour-preserving.

The bounded arm is the one to read first. It mints three identities from three counter families in
one step, the task from `taskActivations`, the deadline from `timerActivations`, and the Activity
occurrence from `activityActivations`, and writes the ownership record that pairs them. The three
ordinals agree under every registered profile and the record is what stops that agreement from being
load-bearing.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def messageActivationCount (state : RuntimeState)
    (elementId : NodeId) : Nat :=
  elementActivationCount (state.messageActivations.map fun value =>
    (value.elementId, value.count)) elementId

def effectActivationCount (state : RuntimeState) (elementId : NodeId) :
    Nat :=
  elementActivationCount (state.effectActivations.map fun value =>
    (value.elementId, value.count)) elementId

def activateUserTask (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (task : UserTaskDefinition) : RuntimeState :=
  let activation := activationCount state task.id + 1
  { state with
    tokens := removeToken state.tokens input owner
    waits := insertUserTaskWait
      { processInstanceId := instanceId
        owner
        task
        activation
        output
        metadata := task.metadata } state.waits
    activations := setActivationCount state.activations task.id activation }

def activateTimer (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (timer : TimerDefinition) : RuntimeState :=
  let activation := timerActivationCount state timer.elementId + 1
  { state with
    tokens := removeToken state.tokens input owner
    timerWaits :=
      { processInstanceId := instanceId
        owner
        elementId := timer.elementId
        activation
        deadlineMs := state.logicalTimeMs + timer.durationMs
        output } :: state.timerWaits
    timerActivations :=
      { elementId := timer.elementId, count := activation } ::
        state.timerActivations.filter fun value =>
          decide (value.elementId ≠ timer.elementId) }

/-- Arms the Activity occurrence and its boundary deadline as one transition, in either interruption disposition, consuming the incoming token exactly once. Both occurrences take a fresh ordinal from their own element's counter, so the pair shares one activation only because arming is atomic; that shared ordinal is what later recovers the pair without a stored ownership record. -/
def activateBoundedUserTask (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryTimer : BoundaryTimerArm) : RuntimeState :=
  let taskActivation := activationCount state task.id + 1
  let timerActivation := timerActivationCount state boundaryTimer.elementId + 1
  let activityActivation := activityActivationCount state task.id + 1
  { state with
    tokens := removeToken state.tokens input owner
    waits := insertUserTaskWait
      { processInstanceId := instanceId
        owner
        task := { id := task.id, name := task.name }
        activation := taskActivation
        output := task.output
        metadata := none } state.waits
    timerWaits :=
      { processInstanceId := instanceId
        owner
        elementId := boundaryTimer.elementId
        activation := timerActivation
        deadlineMs := state.logicalTimeMs + boundaryTimer.durationMs
        output := boundaryTimer.output } :: state.timerWaits
    activations := setActivationCount state.activations task.id taskActivation
    timerActivations :=
      { elementId := boundaryTimer.elementId, count := timerActivation } ::
        state.timerActivations.filter fun value =>
          decide (value.elementId ≠ boundaryTimer.elementId)
    activityOccurrences := insertActivityOccurrence
      { processInstanceId := instanceId
        activityElementId := { value := task.id.value }
        activation := activityActivation
        owner
        body := .userTask
          { processInstanceId := instanceId
            elementId := { value := task.id.value }
            activation := taskActivation }
        attachedTimers :=
          [{ processInstanceId := instanceId
             elementId := { value := boundaryTimer.elementId.value }
             activation := timerActivation }] } state.activityOccurrences
    activityActivations :=
      { taskId := task.id, count := activityActivation } ::
        state.activityActivations.filter fun value =>
          decide (value.taskId ≠ task.id) }

def activateMessage (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (message : MessageDefinition) : RuntimeState :=
  let activation := messageActivationCount state message.elementId + 1
  { state with
    tokens := removeToken state.tokens input owner
    messageWaits :=
      { processInstanceId := instanceId
        owner
        elementId := message.elementId
        activation
        channel := message.channel
        output } :: state.messageWaits
    messageActivations :=
      { elementId := message.elementId, count := activation } ::
        state.messageActivations.filter fun value =>
          decide (value.elementId ≠ message.elementId) }

def activateEffect (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (effect : EffectDefinition) (bpmnErrorRoute : Option BpmnErrorRoute) :
    RuntimeState :=
  let activation := effectActivationCount state effect.elementId + 1
  let arguments := (evaluateInputMappings effect.inputMappings).getD []
  let effectOwner : EffectOccurrenceId :=
    { processInstanceId := instanceId
      elementId := ⟨effect.elementId.value⟩
      activation }
  { state with
    tokens := removeToken state.tokens input owner
    effectWaits :=
      { processInstanceId := instanceId
        owner
        elementId := effect.elementId
        activation
        descriptor := effect.descriptor
        arguments
        outputMappings := effect.outputMappings
        output
        bpmnErrorRoute
        incidentAlreadyRetried := false } :: state.effectWaits
    variables := addActivityVariableScope state.variables effectOwner arguments
    effectActivations :=
      { elementId := effect.elementId, count := activation } ::
        state.effectActivations.filter fun value =>
          decide (value.elementId ≠ effect.elementId) }

/-- The shared bounded and monitored User Task arming root issues its Activity occurrence strictly
above the predecessor Activity-element high-water mark. Sequential Multi-Instance entry reuses this
same root and therefore reuses this law. -/
theorem activateBoundedUserTask_issues_fresh_activity (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryTimer : BoundaryTimerArm) :
    activityIdentityIssuingDiscipline state
      (activateBoundedUserTask state instanceId owner input task boundaryTimer) = true := by
  apply activityIdentityIssuingDiscipline_insertActivityOccurrence
  simp

end BpmnSemantics.SemanticProcess
