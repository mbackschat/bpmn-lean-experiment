import BpmnSemantics.SemanticProcess.TransitionTrace

/-! Explicit operation-choice execution and isolated refusal-law states are executable data.
The refusal guarantees remain in `Execution`; the stimulus boundary is owned by `TransitionTrace`. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def runChoices (program : Program) : RuntimeState → List OperationId →
    Option RuntimeState
  | state, [] => some state
  | state, choice :: choices =>
      match step program state choice with
      | none => none
      | some successor => runChoices program successor choices

def singletonWaitingState (wait : UserTaskWait) (logicalTimeMs : Nat := 0)
    (variables : ScopedVariables := emptyScopedVariables) :
    RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    scopeOccurrences := [{ id := wait.owner, parent := none }]
    waits := [wait]
    activations := [{ taskId := wait.task.id, count := wait.activation }]
    scopeActivations :=
      [{ scopeId := wait.owner.definitionScopeId, count := wait.owner.activation }]
    variables
    logicalTimeMs }

/-- Isolated state used to state timer-refusal laws over the complete public timer occurrence identity and logical-time input. -/
def singletonTimerWaitingState (wait : TimerWait) (logicalTimeMs : Nat := 0) :
    RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    scopeOccurrences := [{ id := wait.owner, parent := none }]
    timerWaits := [wait]
    timerActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
    scopeActivations :=
      [{ scopeId := wait.owner.definitionScopeId, count := wait.owner.activation }]
    logicalTimeMs }

/-- Isolated state used to state effect-result refusal over the complete public occurrence identity. -/
def singletonEffectWaitingState (wait : EffectWait)
    (logicalTimeMs : Nat := 0) : RuntimeState :=
  let owner : EffectOccurrenceId :=
    { processInstanceId := wait.processInstanceId
      elementId := ⟨wait.elementId.value⟩
      activation := wait.activation }
  { initialState with
    control := .running wait.processInstanceId
    scopeOccurrences := [{ id := wait.owner, parent := none }]
    effectWaits := [wait]
    variables :=
      addActivityVariableScope initialState.variables owner wait.arguments
    effectActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
    scopeActivations :=
      [{ scopeId := wait.owner.definitionScopeId, count := wait.owner.activation }]
    logicalTimeMs }

end BpmnSemantics.SemanticProcess
