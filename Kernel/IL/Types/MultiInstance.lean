module

public import Kernel.IL.Types.Expression

/-! # Multi-Instance loop characteristics

The loop an Activity's envelope may carry (BPMN 2.0.2 §10.3.8, Table 10.30): its mode, how many instances it runs, and
the names it reads and writes ([Multi-Instance semantics](../../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md)).
Part of `Kernel.IL.Types`, which re-exports it.
-/

public section

namespace Kernel

inductive MultiInstanceMode where
  | sequential
  | parallel
  deriving DecidableEq, Repr

inductive InstanceCount where
  | collection (items : Expression)
  | cardinality (count : Expression)
  /-- Both a cardinality and a collection, which CIB reads together (`MultiInstanceActivityBehavior:84-89`, `:107-110`);
  admission refuses it (`multiInstance.countAndCollection`). -/
  | countAndCollection (count : Expression) (items : Expression)
  deriving Repr

structure MultiInstance where
  mode : MultiInstanceMode
  count : InstanceCount
  elementVariable : Option String := none
  completionCondition : Option Expression := none
  inputDataItem : Option String := none
  outputDataItem : Option String := none
  outputCollection : Option String := none
  /-- A transaction boundary before each instance begins and after it completes, declared on the loop
  characteristics; the envelope's marks are the body's (CIB-EXT-0027, `BpmnParse#parseMultiInstanceLoopCharacteristics`). -/
  asyncBefore : Bool := false
  asyncAfter : Bool := false
  /-- The element `loopDataInputRef` names and the `inputDataItem`'s `name`, which `MultiInstanceBinding.loopReferences`
  binds instead of the Data Associations (CIB-INT-0014). -/
  loopDataInputRef : Option String := none
  inputDataItemName : Option String := none
  deriving Repr

end Kernel
