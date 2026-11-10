module

public import Kernel.IL.Types

/-! # Admission of Multi-Instance loop characteristics. A refusal carries a stable code.

`Kernel.Feature.MultiInstance` runs one instance per item of an input collection, or per count of a cardinality,
read once on entry; it gives each instance its item as the input data item and takes the output data item, if any,
from each completion; it applies no other data mapping to an instance. Under the standards profile the collection is a
variable read and the completion condition Simple Boolean; under `Evaluator.juel` the
[Multi-Instance level](../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#multi-instance-level) admits JUEL, a
variable read and text at all three sites, which `Kernel.Admission.Data.loopExpression` checks. Which work an instance
may do is admitted by `Kernel.Admission.Work`.
-/

public section

namespace Kernel.Admission.MultiInstance

/-- A count under the standards profile: a variable-read collection; Simple Boolean expresses no Integer, so a
cardinality is refused. -/
def standardCount : InstanceCount → Option String
  | .collection (.variable _) => none
  | .collection (.literal _) => some "multiInstance.collectionExpression"
  | .collection (.simpleBoolean _) => some "multiInstance.collectionExpression"
  | .collection (.juel _) => some "expression.outsideSimpleBoolean"
  | .collection (.foreign _ _) => some "expression.outsideSimpleBoolean"
  | .cardinality _ => some "multiInstance.cardinality"
  | .countAndCollection _ _ => some "multiInstance.countAndCollection"

def standardCondition : Expression → Option String
  | .simpleBoolean _ => none
  | .literal _ => some "multiInstance.completionConditionExpression"
  | .variable _ => some "multiInstance.completionConditionExpression"
  | .juel _ => some "expression.outsideSimpleBoolean"
  | .foreign _ _ => some "expression.outsideSimpleBoolean"

/-- A count under `Evaluator.juel`, each expression checked by `juel`. -/
def juelCount (juel : Bool → Expression → Option String) : InstanceCount → Option String
  | .collection items => juel false items
  | .cardinality count => juel false count
  | .countAndCollection _ _ => some "multiInstance.countAndCollection"

/-- A sequential loop whose collection is `.juel`, which CIB re-evaluates before every later instance (PC-MI-08). -/
def rereads (loop : MultiInstance) : Bool :=
  loop.mode == .sequential && match loop.count with
    | .collection (.juel _) => true
    | .collection _ => false
    | .cardinality _ => false
    | .countAndCollection _ _ => false

/-- An instance's result, given whether its work submits the output data item (`Kernel.Admission.Work.instanceBody`):
a User Task's submission fills it; a Service Task's empty OutputSet fills neither an output data item nor an output
collection, which body result effects (PC-MI-10) would. -/
def result (submits : Bool) (loop : MultiInstance) : Option String :=
  if submits then
    if loop.outputDataItem.isNone then some "multiInstance.outputDataItem" else none
  else if loop.outputDataItem.isSome || loop.outputCollection.isSome then some "multiInstance.instanceResult"
  else none

def counterNames : List String := ["loopCounter", "nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"]

/-- `submits` is `none` for work no instance may do, which `Kernel.Admission.Work` refuses. Under the CIB counters an
item named like a counter is refused: CIB sets both on one execution, so one overwrites the other. A collection loop
needs its input data item; a cardinality loop sets none (`MultiInstanceActivityBehavior:85`). -/
def activity (options : ProfileOptions) (juel : Bool → Expression → Option String) (submits : Option Bool)
    (envelope : Envelope) (loop : MultiInstance) : Option String :=
  let underJuel := options.evaluator == .juel
  let counters := options.multiInstanceCounters == .cibLocals
  let collection := match loop.count with
    | .collection _ => true
    | .cardinality _ => false
    | .countAndCollection _ _ => true
  (if underJuel then juelCount juel loop.count else standardCount loop.count) <|>
    (loop.completionCondition.bind fun condition =>
      if underJuel then juel counters condition else standardCondition condition) <|>
    if loop.elementVariable.isSome then some "multiInstance.elementVariable"
    else if loop.mutableCollection == .sequentialReread || (underJuel && rereads loop) then some "multiInstance.mutableCollection"
    else if collection && loop.inputDataItem.isNone then some "multiInstance.inputDataItem"
    else if counters && [loop.inputDataItem, loop.inputDataItemName].any (·.any counterNames.contains) then
      some "multiInstance.itemNamedLikeCounter"
    else (submits.bind (result · loop)) <|>
      if !envelope.inputs.isEmpty || !envelope.outputs.isEmpty then some "multiInstance.mappings" else none

end Kernel.Admission.MultiInstance
