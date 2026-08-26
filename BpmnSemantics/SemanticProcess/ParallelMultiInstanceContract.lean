import BpmnSemantics.SemanticProcessContract

/-! # Parallel Multi-Instance operation contract

The immutable definition facts projected from one distinct parallel Multi-Instance User Task
operation. The root Semantic Process contract owns only the closed operation arm; this module owns
the family-shaped payload consumed by future admission, transition, and observation modules.

The data graph and limits reuse the reviewed Multi-Instance carriers because their field vocabulary
is identical across the sequential and parallel profiles. This does not reinterpret the sequential
operation: `ofOperation?` accepts only the distinct parallel constructor.

Scope boundary: immutable operation facts and their exact projection. It defines no runtime state,
transition, evaluator, admission rule, or public observation.
-/

namespace BpmnSemantics.SemanticProcess

/-- One admitted parallel Multi-Instance User Task as its runtime transitions read it. -/
structure ParallelMultiInstanceArm where
  id : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  taskId : TaskDefinitionId
  taskName : Option String
  data : SequentialMultiInstanceDataDefinition
  normalOutput : ControlPlaceId
  boundaryTimer : BoundaryTimerArm
  completionCondition : SimpleBooleanExpression
  limits : SequentialMultiInstanceLimits
  deriving Repr, DecidableEq

/-- Project the exact parallel family payload from its distinct committed operation. -/
def ParallelMultiInstanceArm.ofOperation? : SemanticOperation → Option ParallelMultiInstanceArm
  | .awaitParallelMultiInstanceUserTask id origin input taskId taskName data normalOutput boundaryTimer
      completionCondition limits =>
      some
        { id
          origin
          input
          taskId
          taskName
          data
          normalOutput
          boundaryTimer
          completionCondition
          limits }
  | _ => none

/-- The immutable link carried by the command-addressed completion operation. -/
structure ParallelMultiInstanceCompletionArm where
  id : OperationId
  origin : BpmnElementOrigin
  entryOperationId : OperationId
  taskElementId : TaskDefinitionId
  normalOutput : ControlPlaceId
  deriving Repr, DecidableEq

/-- Project only the distinct external child-completion operation. -/
def ParallelMultiInstanceCompletionArm.ofOperation? : SemanticOperation →
    Option ParallelMultiInstanceCompletionArm
  | .completeParallelMultiInstanceUserTask id origin entryOperationId taskElementId normalOutput =>
      some { id, origin, entryOperationId, taskElementId, normalOutput }
  | _ => none

/-- Whether two operations are the exact entry/completion pair for one parallel Activity.

The operation kinds are selected by the two projections. The remaining conjuncts make a completion
linked to another entry, BPMN element, task, or normal route fail closed rather than look like a
completion for this entry. -/
def parallelMultiInstanceOperationsPair (entryOperation completionOperation : SemanticOperation) :
    Bool :=
  match ParallelMultiInstanceArm.ofOperation? entryOperation,
      ParallelMultiInstanceCompletionArm.ofOperation? completionOperation with
  | some entry, some completion =>
      decide (completion.entryOperationId = entry.id) &&
        decide (completion.origin = entry.origin) &&
        decide (completion.taskElementId = entry.taskId) &&
        decide (completion.origin.elementId.value = completion.taskElementId.value) &&
        decide (completion.normalOutput = entry.normalOutput)
  | _, _ => false

/-- The unique exact completion paired to one entry, or `none` for absence or ambiguity. -/
def parallelMultiInstanceCompletionForEntry? (operations : List SemanticOperation)
    (entryOperation : SemanticOperation) : Option SemanticOperation :=
  match operations.filter (parallelMultiInstanceOperationsPair entryOperation) with
  | [completion] => some completion
  | _ => none

def parallelMultiInstanceEntryForTask? (program : Program)
    (taskId : TaskDefinitionId) : Option SemanticOperation :=
  match program.operations.filter fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some arm =>
          decide (arm.taskId = taskId) &&
            (parallelMultiInstanceCompletionForEntry? program.operations operation).isSome
      | none => false with
  | [entry] => some entry
  | _ => none

def parallelMultiInstanceEntryForTimer? (program : Program)
    (elementId : NodeId) : Option SemanticOperation :=
  match program.operations.filter fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some arm =>
          decide (arm.boundaryTimer.elementId = elementId) &&
            (parallelMultiInstanceCompletionForEntry? program.operations operation).isSome
      | none => false with
  | [entry] => some entry
  | _ => none

end BpmnSemantics.SemanticProcess
