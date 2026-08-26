import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts

/-! # Parallel Multi-Instance FlowNode occurrence lifecycle

Family-local E2 lifecycle facts distinguish the accepted winner from siblings terminated by early or
Timer closure. They deliberately retain no host order. Shared E1/E2 publication maps this closed
semantic delta into the repository-wide occurrence contract during integration.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive ParallelChildLifecycleDisposition where
  | completed
  | terminated
  deriving Repr, DecidableEq

structure ParallelChildLifecycleFact where
  taskId : UserTaskInstanceId
  disposition : ParallelChildLifecycleDisposition
  deriving Repr, DecidableEq

structure ParallelMultiInstanceLifecycleDelta where
  childFacts : List ParallelChildLifecycleFact
  outerClosed : Bool
  timerWithdrawn : Bool
  deriving Repr, DecidableEq

def terminatedParallelSiblings (winner : UserTaskInstanceId) :
    List UserTaskInstanceId → List ParallelChildLifecycleFact
  | [] => []
  | taskId :: rest =>
      if taskId = winner then terminatedParallelSiblings winner rest
      else { taskId, disposition := .terminated } :: terminatedParallelSiblings winner rest

/-- Lifecycle delta for one accepted completion. A still-open result records only its completed child;
an atomic close additionally records every other previously live child as terminated. -/
def parallelCompletionLifecycleDelta (before after : ParallelMultiInstanceRuntimeState)
    (winner : UserTaskInstanceId) : ParallelMultiInstanceLifecycleDelta :=
  let closed := after.controller.isNone
  { childFacts :=
      { taskId := winner, disposition := .completed } ::
        if closed then terminatedParallelSiblings winner before.liveChildren else []
    outerClosed := closed
    timerWithdrawn := before.lifetimeTimer.isSome && after.lifetimeTimer.isNone }

/-- Timer closure terminates every child live immediately before the interrupting step. -/
def parallelTimerLifecycleDelta (before after : ParallelMultiInstanceRuntimeState) :
    ParallelMultiInstanceLifecycleDelta :=
  { childFacts := before.liveChildren.map fun taskId =>
      { taskId, disposition := .terminated }
    outerClosed := after.controller.isNone
    timerWithdrawn := before.lifetimeTimer.isSome && after.lifetimeTimer.isNone }

def parallelEntryFlowNodeStarts? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (before after : RuntimeState) :
    Option (List UnnumberedFlowNodeOccurrenceStart) := do
  let arm ← ParallelMultiInstanceArm.ofOperation? operation
  let firstActivation := activationCount before arm.taskId + 1
  let finalActivation := activationCount after arm.taskId
  let waits := after.waits.filter fun wait =>
    wait.owner == owner && wait.task.id == arm.taskId &&
      decide (firstActivation ≤ wait.activation && wait.activation ≤ finalActivation)
  waits.mapM (candidateUserTaskStart? program operation owner)

private def parallelWaitEnd (id : OccurrenceId)
    (terminal : FlowNodeOccurrenceTerminalKind) : UnnumberedFlowNodeOccurrenceEnd :=
  { anchor := .wait id, terminal }

def parallelCompletionFlowNodeEnds? (program : Program) (before : RuntimeState)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding) :
    Option (List UnnumberedFlowNodeOccurrenceEnd) := do
  let entry ← parallelMultiInstanceEntryForTask? program ⟨taskId.elementId.value⟩
  let arm ← ParallelMultiInstanceArm.ofOperation? entry
  let controller ← parallelControllerForTask? arm before taskId
  let result ← acceptedParallelResult? arm submitted
  let updated := replacePendingParallelSlot controller.slots taskId result
  let condition ← evaluateSimpleBooleanExpression arm.completionCondition
    before.variables.process.bindings
  let closes := (completedParallelResults? updated).isSome || condition
  let siblings := if closes then
      pendingParallelTaskIds controller.slots |>.filter (· != taskId)
    else []
  pure (parallelWaitEnd taskId .completed ::
    siblings.map fun sibling => parallelWaitEnd sibling .cancelled)

def parallelTimerFlowNodeEnds? (program : Program) (before : RuntimeState)
    (timerId : TimerOccurrenceId) : Option (List UnnumberedFlowNodeOccurrenceEnd) := do
  let entry ← parallelMultiInstanceEntryForTimer? program ⟨timerId.elementId.value⟩
  let arm ← ParallelMultiInstanceArm.ofOperation? entry
  let controller ← parallelControllerForTimer? arm before timerId
  pure (pendingParallelTaskIds controller.slots |>.map fun taskId =>
    parallelWaitEnd taskId .cancelled)

end BpmnSemantics.SemanticProcess
