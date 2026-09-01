import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Runtime-state well-formedness fixtures

This module owns the shared boundary-Timer program, instance, reachable state, and ordinary malformed
states used by the independent runtime-state well-formedness proof leaves.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def program : Program := ActivityBoundaryTimerConformance.program

def instanceId : SemanticId := ActivityBoundaryTimerConformance.instanceId

def armedState : RuntimeState := ActivityBoundaryTimerConformance.armedState

/-- `W1`, violating `RSI-OWN-01`: a Timer wait whose owner occurrence does not exist.

The owner is stranded by naming an activation no occurrence carries rather than by emptying
`scopeOccurrences`, which would destroy the hosting root and be refused by the existing position
predicate instead. -/
def strandedTimerOwnerState : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits.map fun wait =>
      { wait with owner := { wait.owner with activation := wait.owner.activation + 1 } } }

/-- `W2`, violating `RSI-UNIQ-02`: two Timer waits sharing one occurrence key.

The duplicate differs in its deadline, so the pair is not caught by ordinary structural equality and
the state is refused for the key rather than for the value. -/
def duplicateTimerKeyState : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits ++
      armedState.timerWaits.map fun wait => { wait with deadlineMs := wait.deadlineMs + 1 } }

/-- `W3`, violating `RSI-BIND-04`: a Timer wait whose element identity no operation declares.

Reachable only through an injected or cross-program state, because no arming operation can produce a
wait for an element the program does not carry. -/
def undeclaredTimerElementState : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits.map fun wait =>
      { wait with elementId := ⟨wait.elementId.value ++ "_Injected"⟩ }
    timerActivations := armedState.timerActivations.map fun activation =>
      { activation with elementId := ⟨activation.elementId.value ++ "_Injected"⟩ } }

/-- Violating `RSI-ORDER-01`: a canonically ordered collection holding its elements reversed.

Separate from the wait conjuncts because order is retained state: `RuntimeState` derives
`DecidableEq`, so a collection whose add sites all insert canonically carries its order as meaning
rather than as presentation. -/
def unorderedActivationsState : RuntimeState :=
  { armedState with
    activations :=
      [ { taskId := ⟨"Task_ZZZ"⟩, count := 1 }
      , { taskId := ⟨"BoundedTask"⟩, count := 1 }
      , { taskId := ⟨"Task_AAA"⟩, count := 1 } ] }

/-- Violating `RSI-LIFE-01`: a not-started state holding runtime work.

`lifecyclePositionValid` reaches occurrences and tokens here but no wait family, so a pending
initiation flag with no occurrences is admitted by the existing predicate and refused only by this
conjunct. -/
def notStartedWithPendingInitiationState : RuntimeState :=
  { initialState with initiationPending := true }

end BpmnSemantics.RuntimeStateWellFormedConformance
