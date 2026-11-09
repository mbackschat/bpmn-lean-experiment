module

public import Kernel.IL.Types

/-! # Admission of Multi-Instance loop characteristics. A refusal carries a stable code.

`Kernel.Feature.MultiInstance` runs one instance per item of an input collection the Activity reads from a
variable once, on entry, gives each instance its item as the input data item and takes the output data item, if any,
from each completion; it applies no other data mapping to an instance and evaluates a completion condition only in the
kernel. Which work an instance may do is admitted by `Kernel.Admission.Work`.
-/

public section

namespace Kernel.Admission.MultiInstance

def collection : InstanceCount → Option String
  | .collection (.variable _) => none
  | .collection (.literal _) => some "multiInstance.collectionExpression"
  | .collection (.simpleBoolean _) => some "multiInstance.collectionExpression"
  | .collection (.foreign _ _) => some "expression.outsideSimpleBoolean"
  | .cardinality _ => some "multiInstance.cardinality"

def condition : Option Expression → Option String
  | none => none
  | some (.simpleBoolean _) => none
  | some (.literal _) => some "multiInstance.completionConditionExpression"
  | some (.variable _) => some "multiInstance.completionConditionExpression"
  | some (.foreign _ _) => some "expression.outsideSimpleBoolean"

/-- An instance's result, given whether its work submits the output data item (`Kernel.Admission.Work.instanceBody`):
a User Task's submission fills it; a Service Task's empty OutputSet fills neither an output data item nor an output
collection, which body result effects (PC-MI-10) would. -/
def result (submits : Bool) (loop : MultiInstance) : Option String :=
  if submits then
    if loop.outputDataItem.isNone then some "multiInstance.outputDataItem" else none
  else if loop.outputDataItem.isSome || loop.outputCollection.isSome then some "multiInstance.instanceResult"
  else none

/-- `submits` is `none` for work no instance may do, which `Kernel.Admission.Work` refuses. -/
def activity (submits : Option Bool) (envelope : Envelope) (loop : MultiInstance) : Option String :=
  collection loop.count <|> condition loop.completionCondition <|>
    if loop.elementVariable.isSome then some "multiInstance.elementVariable"
    else if loop.mutableCollection == .sequentialReread then some "multiInstance.mutableCollection"
    else if loop.inputDataItem.isNone then some "multiInstance.inputDataItem"
    else (submits.bind (result · loop)) <|>
      if !envelope.inputs.isEmpty || !envelope.outputs.isEmpty then some "multiInstance.mappings" else none

end Kernel.Admission.MultiInstance
