module

public import Kernel.IL.Types

/-! # Read and write footprints

What an expression, a mapping list or an element reads and writes, over-approximated where the text cannot show it: a
JUEL or foreign expression reads every name, and a Multi-Instance definition reads every name when its element begins.
`Kernel.Admission.Flow` compares branch footprints for `BranchSchedule.orderInvariant`.
-/

public section

namespace Kernel

/-- A set of variable names, or every name. -/
structure NameSet where
  names : List String := []
  all : Bool := false

def NameSet.union (left right : NameSet) : NameSet := { names := left.names ++ right.names, all := left.all || right.all }

def NameSet.meets (left right : NameSet) : Bool :=
  (left.all && (right.all || !right.names.isEmpty)) || (right.all && !left.names.isEmpty) ||
    left.names.any right.names.contains

/-- What a branch reads and writes within one closure. -/
structure Footprint where
  reads : NameSet := {}
  writes : NameSet := {}

def Footprint.union (left right : Footprint) : Footprint :=
  { reads := left.reads.union right.reads, writes := left.writes.union right.writes }

/-- Whether one branch's writes meet the other's reads or writes, in either direction. -/
def Footprint.races (left right : Footprint) : Bool :=
  left.writes.meets (right.reads.union right.writes) || right.writes.meets left.reads

/-- The names an expression reads. A JUEL or foreign text counts as reading every name: a JUEL method or the
`execution` object can read a variable no identifier names. -/
def expressionReads : Expression → NameSet
  | .literal _ => {}
  | .variable name => { names := [name] }
  | .simpleBoolean (.literal _) => {}
  | .simpleBoolean (.isPresent name) => { names := [name] }
  | .simpleBoolean (.isNull name) => { names := [name] }
  | .simpleBoolean (.stringEquals name _) => { names := [name] }
  | .juel _ => { all := true }
  | .foreign _ _ => { all := true }

def mappingReads (mappings : List Mapping) : NameSet :=
  mappings.foldl (fun found mapping => found.union (expressionReads mapping.source)) {}

/-- What `element` reads when it begins: its input mappings, and every name for a Multi-Instance definition, whose
count, collection and condition it evaluates then or later in the closure. -/
def beginReads (element : Element) : NameSet :=
  (element.envelope?.map fun envelope => (mappingReads envelope.inputs).union { all := envelope.multiInstance.isSome }).getD {}

/-- What `element` reads and writes when it runs through in the closure: it begins, its outputs read their sources
and write their targets, a Call maps its inputs and outputs, and its outgoing conditions are evaluated. -/
def footprint (program : Program) (element : Element) : Footprint :=
  let outputs := (element.envelope?.map (·.outputs)).getD []
  let call := element.activity?.bind fun (_, payload) => payload.work.call?
  let conditions := (element.outgoing.filterMap fun flow => (program.flow? flow).bind (·.condition)).foldl
    (fun found condition => found.union (expressionReads condition)) {}
  let callOutputs := (call.map fun work => work.outputs.map (·.target)).getD []
  { reads := ((beginReads element).union (mappingReads outputs)).union
      (((call.map fun work => mappingReads work.inputs).getD {}).union conditions),
    writes := { names := outputs.map (·.target) ++ callOutputs, all := call.any (·.propagateAllOutputs) } }

end Kernel
