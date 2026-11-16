module

public import Kernel.IL.Types

/-! # Read and write footprints

What an expression, a mapping list or an element reads and writes, over-approximated where the text cannot show it: a
JUEL or foreign expression reads every name, and a Multi-Instance definition reads every name when its element begins.
`Kernel.Admission.Flow` compares branch footprints for `BranchSchedule.orderInvariant`, and `writes` is the one account of
what an element writes, which that closure walk and `Kernel.Feature.Compensation`'s data dependency both read. The
mechanisms whose units those comparisons pair (`QueuingMechanism`) are listed here once, for admission's checks and
`Kernel.Laws.Flow.Concurrent` alike.
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

/-- Whether an Event Sub-Process writes every name when its start begins it: a delivery's own variables are input
data, unknown at admission, which the begin writes outward from the new occurrence (`Step.writeStart`) under
`DeliveryVariables.installs` for a Message start (CIB-EXT-0025) and `SignalPayload.variables` for a Signal start
(CIB-EXT-0043). -/
def deliveredWrites (program : Program) (element : Element) : Bool :=
  ((element.scope?).bind fun (_, payload) => payload.kind.start?).any fun start =>
    let view := triggerView start.trigger
    (view.message.isSome && program.options.deliveryVariables == .installs) ||
      (view.signal.isSome && program.options.signalPayload == .variables)

/-- What `element` reads and writes when it runs through in the closure: it begins, its outputs read their sources
and write their targets, a Call maps its inputs and outputs, its outgoing conditions are evaluated, and an Event
Sub-Process whose start carries a delivery's variables writes every name (`deliveredWrites`). -/
def footprint (program : Program) (element : Element) : Footprint :=
  let outputs := (element.envelope?.map (·.outputs)).getD []
  let call := element.activity?.bind fun (_, payload) => payload.work.call?
  let conditions := (element.outgoing.filterMap fun flow => (program.flow? flow).bind (·.condition)).foldl
    (fun found condition => found.union (expressionReads condition)) {}
  let callOutputs := (call.map fun work => work.outputs.map (·.target)).getD []
  { reads := ((beginReads element).union (mappingReads outputs)).union
      (((call.map fun work => mappingReads work.inputs).getD {}).union conditions),
    writes := { names := outputs.map (·.target) ++ callOutputs,
                all := call.any (·.propagateAllOutputs) || deliveredWrites program element } }

/-- The names a catch writes when it fires: its output mappings' targets and the variables its trigger sets from what
it caught, an Error's code and message and an Escalation's code (CIB-EXT-0028). -/
def catchWrites (subscription : Subscription) : List String :=
  subscription.outputs.map (·.target) ++ (triggerView subscription.trigger).variables

/-- What `element` writes when it runs, beside its envelope's and a Call's outputs and an Event Sub-Process start's
delivered variables, which need the program's options (`footprint`), and what a boundary writes when it fires
(`catchWrites`): its work's results, its catch's or start's writes, what its Signal throw's receivers install, a
Signal's `camunda:in` targets or every name (CIB-EXT-0043), and its loop's output collection. A loop's counters and
items stay in scope occurrences of its own. -/
def writes (element : Element) : NameSet :=
  let work := (element.activity?.map fun (_, payload) => payload.work.results).getD []
  let caught := (element.event?.bind (·.2.catch?)).toList ++ (element.start?.bind (·.2.subscription)).toList ++
    ((element.scope?).bind fun (_, payload) => payload.kind.start?).toList
  let thrown := (element.event?.bind (·.2.throw?)).map throwView
  let collection := ((element.envelope?).bind (·.multiInstance)).bind (·.outputCollection)
  { names := work ++ caught.flatMap catchWrites ++ ((thrown.map (·.installs)).getD []) ++ collection.toList
    all := thrown.any (·.installsAll) }

/-- A mechanism of the kernel that queues more than one unit of work in one closure, in an order no input states (P1's
census of the queuing sites). Admission's order checks under `BranchSchedule.orderInvariant` and
`Kernel.Laws.Flow.Concurrent` both range over `QueuingMechanism.all`, so a new mechanism takes a case in each. -/
inductive QueuingMechanism where
  /-- A split's branches (BPMN 2.0.2 §13.3.1, Table 13.1). -/
  | split
  /-- The children a Scope's entry begins without a start Event (§13.3.4). -/
  | entered
  /-- A parallel Multi-Instance body's instances (§13.3.7). -/
  | instances
  /-- A Signal throw's firings beside its continuation (§10.5.1). -/
  | signalled
  /-- An Escalation throw's continuation beside its non-interrupting catchers (§10.5.1). -/
  | escalated
  /-- The Conditional firings one write offers (Tables 10.89, 10.90). -/
  | writes
  /-- The handler runs one Compensation throw or Cancel End begins (§13.5.5). -/
  | compensating
  /-- The Conditional items one arming finds true, beside the entry's begun work (§13.4.4). -/
  | armed
  /-- The continuations of the Inclusive joins one quiescent closure offers again (Table 13.3). -/
  | rejoined

/-- Where a mechanism queues its units, and so where admission checks it: at a Sequence Flow's source, at a looping
element, or at an element whose run or entry fans out. -/
inductive QueuingSite where
  | flow
  | loop
  | element
  deriving DecidableEq

def QueuingMechanism.queuedAt : QueuingMechanism → QueuingSite
  | .split => .flow
  | .instances => .loop
  | .entered => .element
  | .signalled => .element
  | .escalated => .element
  | .writes => .element
  | .compensating => .element
  | .armed => .element
  | .rejoined => .element

/-- Every mechanism, in the order `Kernel.AdmissionRegistry.admitLocated` reaches its check: flows, then loops, then
each element's fan-outs. An abbreviation, so that a law sees its members (`Kernel.Laws.Flow.mechanism_mem_all`). -/
abbrev QueuingMechanism.all : List QueuingMechanism :=
  [.split, .instances, .signalled, .escalated, .writes, .compensating, .entered, .armed, .rejoined]

end Kernel
