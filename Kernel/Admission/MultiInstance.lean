module

public import Kernel.IL.Types

/-! # Admission of Multi-Instance loop characteristics. A refusal carries a stable code.

`Kernel.Feature.MultiInstance` runs one instance per item of an input collection the Activity reads from a
variable once, on entry, gives each instance its item as the input data item and takes the output data item from
each completion; it applies no other data mapping to an instance and evaluates a completion condition only in the
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

def activity (envelope : Envelope) (loop : MultiInstance) : Option String :=
  collection loop.count <|> condition loop.completionCondition <|>
    if loop.elementVariable.isSome then some "multiInstance.elementVariable"
    else if loop.mutableCollection == .sequentialReread then some "multiInstance.mutableCollection"
    else if loop.inputDataItem.isNone then some "multiInstance.inputDataItem"
    else if loop.outputDataItem.isNone then some "multiInstance.outputDataItem"
    else if !envelope.inputs.isEmpty || !envelope.outputs.isEmpty then some "multiInstance.mappings"
    else none

end Kernel.Admission.MultiInstance
