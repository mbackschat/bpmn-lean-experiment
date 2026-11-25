module

public import Kernel.IL.Types
public import Kernel.IL.Footprint
public import Kernel.IL.Paths
import all Kernel.IL.Types
import all Kernel.IL.Types.Options
import all Kernel.IL.Types.Work
import all Kernel.IL.Footprint
import all Kernel.IL.Paths

/-! # Laws of the IL

What the IL's queries return, for the proofs that need a query's value rather than its name. This is the one module
that sees the bodies of `Kernel.IL`'s modules ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
a query enters here when a proof first needs it, so an IL body edit rebuilds only this module and the proofs above it.
Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.IL

open Kernel

/-- The counter names CIB-INT-0018 binds, in `cibLocals`' order. -/
theorem multiInstanceCounterNames_eq :
    multiInstanceCounterNames = ["loopCounter", "nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"] := by
  simp only [multiInstanceCounterNames]

/-- A Gateway carries no envelope, so no loop or Multi-Instance characteristic wraps its occurrence. -/
theorem envelope?_gateway (header : Header) (payload : GatewayPayload) :
    (Element.gateway header payload).envelope? = none := by
  simp only [Element.envelope?]

/-- An Event carries no envelope, so no Multi-Instance body numbers its occurrences apart. -/
theorem envelope?_event (header : Header) (payload : EventPayload) : (Element.event header payload).envelope? = none := by
  simp only [Element.envelope?]

/-! ## Events

Which elements are Events, for `Laws.State.EventRoles`, which a raise reads to find its thrower. -/

/-- The Event `Program.element?` finds carries the identity it was asked for, which its throw raises from. -/
theorem element?_event {program : Program} {id : ElementId} {header : Header} {payload : EventPayload}
    (found : program.element? id = some (.event header payload)) : header.id = id := by
  unfold Program.element? at found
  simpa [Element.header] using List.find?_some found

/-- The element `Program.element?` finds carries the identity it was asked for, which a Multi-Instance body's slot
record names as its element. -/
theorem element?_header {program : Program} {id : ElementId} {element : Element}
    (found : program.element? id = some element) : element.header.id = id := by
  unfold Program.element? at found
  simpa using List.find?_some found

theorem event?_event (header : Header) (payload : EventPayload) :
    (Element.event header payload).event? = some (header, payload) := by
  simp only [Element.event?]

theorem header_event (header : Header) (payload : EventPayload) : (Element.event header payload).header = header := by
  simp only [Element.header]

theorem header_activity (header : Header) (payload : ActivityPayload) :
    (Element.activity header payload).header = header := by
  simp only [Element.header]

theorem header_scope (header : Header) (payload : ScopePayload) : (Element.scope header payload).header = header := by
  simp only [Element.header]

theorem event?_activity (header : Header) (payload : ActivityPayload) : (Element.activity header payload).event? = none := by
  simp only [Element.event?]

theorem event?_scope (header : Header) (payload : ScopePayload) : (Element.scope header payload).event? = none := by
  simp only [Element.event?]

theorem event?_gateway (header : Header) (payload : GatewayPayload) : (Element.gateway header payload).event? = none := by
  simp only [Element.event?]

theorem event?_start (header : Header) (payload : StartPayload) : (Element.start header payload).event? = none := by
  simp only [Element.event?]

/-! ## Start Events

Which elements are start Events, for `Laws.State.Typed`, which tells an Event Sub-Process start's item from an
Activity's or an intermediate Event's by `Element.start?`. -/

theorem start?_start (header : Header) (payload : StartPayload) :
    (Element.start header payload).start? = some (header, payload) := by
  simp only [Element.start?]

theorem header_start (header : Header) (payload : StartPayload) : (Element.start header payload).header = header := by
  simp only [Element.header]

/-- A start carries no envelope. -/
theorem envelope?_start (header : Header) (payload : StartPayload) : (Element.start header payload).envelope? = none := by
  simp only [Element.envelope?]

theorem start?_activity (header : Header) (payload : ActivityPayload) : (Element.activity header payload).start? = none := by
  simp only [Element.start?]

theorem start?_event (header : Header) (payload : EventPayload) : (Element.event header payload).start? = none := by
  simp only [Element.start?]

theorem start?_scope (header : Header) (payload : ScopePayload) : (Element.scope header payload).start? = none := by
  simp only [Element.start?]

theorem start?_gateway (header : Header) (payload : GatewayPayload) : (Element.gateway header payload).start? = none := by
  simp only [Element.start?]

/-- A Scope is one, and no other element is. -/
theorem scope?_scope (header : Header) (payload : ScopePayload) :
    (Element.scope header payload).scope? = some (header, payload) := by simp only [Element.scope?]

theorem scope?_activity (header : Header) (payload : ActivityPayload) : (Element.activity header payload).scope? = none := by
  simp only [Element.scope?]

theorem scope?_event (header : Header) (payload : EventPayload) : (Element.event header payload).scope? = none := by
  simp only [Element.scope?]

theorem scope?_gateway (header : Header) (payload : GatewayPayload) : (Element.gateway header payload).scope? = none := by
  simp only [Element.scope?]

theorem scope?_start (header : Header) (payload : StartPayload) : (Element.start header payload).scope? = none := by
  simp only [Element.scope?]

/-- A Scope's envelope is its payload's. -/
theorem envelope?_scope (header : Header) (payload : ScopePayload) :
    (Element.scope header payload).envelope? = some payload.envelope := by
  simp only [Element.envelope?]

/-- A process a Call resolves to is one the program declares. -/
theorem calledProcessFor_mem {program : Program} {resolution : CalledElementResolution} {callerDeployment : Option Nat}
    {work : CallWork} {process : CalledProcess}
    (member : process ∈ program.calledProcessFor resolution callerDeployment work) : process ∈ program.processes :=
  (List.mem_filter.mp member).1

/-- A start Event is no Activity, so an Activity's item is never a start Event's. -/
theorem activity?_start (header : Header) (payload : StartPayload) : (Element.start header payload).activity? = none := by
  simp only [Element.activity?]

/-- An Activity is its own Activity, as `Step.dispatch` hands it to `Hooks.arriveActivity`. -/
theorem activity?_activity (header : Header) (payload : ActivityPayload) :
    (Element.activity header payload).activity? = some (header, payload) := by
  simp only [Element.activity?]

/-- A gateway is its own gateway, as `Step.dispatch` hands it to `Hooks.arriveGateway`. -/
theorem gateway?_gateway (header : Header) (payload : GatewayPayload) :
    (Element.gateway header payload).gateway? = some (header, payload) := by
  simp only [Element.gateway?]

theorem gateway?_activity (header : Header) (payload : ActivityPayload) :
    (Element.activity header payload).gateway? = none := by simp only [Element.gateway?]

theorem gateway?_scope (header : Header) (payload : ScopePayload) :
    (Element.scope header payload).gateway? = none := by simp only [Element.gateway?]

theorem gateway?_event (header : Header) (payload : EventPayload) :
    (Element.event header payload).gateway? = none := by simp only [Element.gateway?]

theorem gateway?_start (header : Header) (payload : StartPayload) :
    (Element.start header payload).gateway? = none := by simp only [Element.gateway?]

/-- A gateway's outgoing flows are its payload's. -/
theorem outgoing_gateway (header : Header) (payload : GatewayPayload) :
    (Element.gateway header payload).outgoing = payload.outgoing := by
  simp only [Element.outgoing]

theorem header_gateway (header : Header) (payload : GatewayPayload) :
    (Element.gateway header payload).header = header := by simp only [Element.header]

theorem outgoing_event (header : Header) (payload : EventPayload) :
    (Element.event header payload).outgoing = payload.outgoing := by simp only [Element.outgoing]

theorem activity?_scope (header : Header) (payload : ScopePayload) : (Element.scope header payload).activity? = none := by
  simp only [Element.activity?]

theorem activity?_event (header : Header) (payload : EventPayload) : (Element.event header payload).activity? = none := by
  simp only [Element.activity?]

theorem activity?_gateway (header : Header) (payload : GatewayPayload) :
    (Element.gateway header payload).activity? = none := by simp only [Element.activity?]

/-- A Call's work record names its Call, and no other work record names one: `Kernel.Laws.Work`, which owns matching
on `Work`, reads `Work.call?` by these. -/
theorem call?_call (work : CallWork) : (Work.call work).call? = some work := by simp only [Work.call?]

theorem call?_none : Work.none.call? = none := by simp only [Work.call?]

theorem call?_manual : Work.manual.call? = none := by simp only [Work.call?]

theorem call?_user (work : UserWork) : (Work.user work).call? = none := by simp only [Work.call?]

theorem call?_receive (work : ReceiveWork) : (Work.receive work).call? = none := by simp only [Work.call?]

theorem call?_service (work : ServiceWork) : (Work.service work).call? = none := by simp only [Work.call?]

theorem call?_send (work : SendWork) : (Work.send work).call? = none := by simp only [Work.call?]

theorem call?_script (work : ScriptWork) : (Work.script work).call? = none := by simp only [Work.call?]

theorem call?_rule (work : RuleWork) : (Work.rule work).call? = none := by simp only [Work.call?]

/-! ## Where a reserved identifier comes from

What a reservation's element (`State.reserve`) may be, for the records that require it of a feature's reservations
(`Kernel.Proofs.Frame.OccursAlongside`): a boundary's identifier, or a catching element's that carries no envelope, so
that no reservation `Step` begins is a throw Event's. -/

/-- `element` is the identifier of a boundary of one of `program`'s elements. -/
@[expose] def BoundaryOf (program : Program) (element : ElementId) : Prop :=
  ∃ host ∈ program.elements, ∃ envelope, host.envelope? = some envelope ∧
    ∃ boundary ∈ envelope.boundaries, boundary.id = element

/-- `element` catches: an Event whose role is a catch's (`EventPayload.catch?`), or a start. -/
@[expose] def Catches (element : Element) : Prop :=
  (element.event?.bind (·.2.catch?)).isSome = true ∨ element.start?.isSome = true

/-- What a subscription may reserve: a boundary, or a catching element of the program without an envelope, a catch
Event or a start. -/
@[expose] def Reservable (program : Program) (element : ElementId) : Prop :=
  BoundaryOf program element ∨
    ∃ found ∈ program.elements, found.header.id = element ∧ found.envelope? = none ∧ Catches found

/-- The element `Program.element?` finds is one of the program's. -/
theorem element?_mem {program : Program} {id : ElementId} {element : Element} (found : program.element? id = some element) :
    element ∈ program.elements := by
  unfold Program.element? at found
  exact List.mem_of_find?_eq_some found

/-- `Program.element?` finds an element under the identifier of each of the program's elements. -/
theorem element?_isSome {program : Program} {element : Element} (member : element ∈ program.elements) :
    (program.element? element.header.id).isSome := by
  unfold Program.element?
  exact List.find?_isSome.mpr ⟨element, member, by simp⟩

/-- `Program.element?` finds nothing under an identifier none of the program's elements carries. -/
theorem element?_none {program : Program} {id : ElementId}
    (absent : ∀ element ∈ program.elements, element.header.id ≠ id) : program.element? id = none := by
  unfold Program.element?
  exact List.find?_eq_none.mpr fun element member => by simpa using absent element member

/-- `Program.element?` finds the one element of the program that carries an identifier. -/
theorem element?_unique {program : Program} {id : ElementId} {element : Element} (member : element ∈ program.elements)
    (named : element.header.id = id) (unique : ∀ other ∈ program.elements, other.header.id = id → other = element) :
    program.element? id = some element := by
  cases found : program.element? id with
  | none =>
    unfold Program.element? at found
    simpa [named] using List.find?_eq_none.mp found element member
  | some other => rw [unique other (element?_mem found) (element?_header found)]

/-- In a program whose elements have no parent, every header lies at the top level of the called process listing its
identifier, or of the root process when none does (`Program.processOf`). -/
theorem processOf_parentless {program : Program} {header : Header}
    (parentless : ∀ element ∈ program.elements, element.header.parent = none) :
    program.processOf header = program.processes.find? (·.children.contains header.id) := by
  have top : (program.element? header.id).bind (·.header.parent) = none := by
    cases found : program.element? header.id with
    | none => rfl
    | some element => simpa using parentless element (element?_mem found)
  unfold Program.processOf
  cases program.elements.length with
  | zero => rfl
  | succ => simp only [Program.processOf.outermost, top]

/-- The authored identifier of an element `Program.element?` finds is its own origin's. -/
theorem publicId_element {program : Program} {id : ElementId} {element : Element}
    (found : program.element? id = some element) : program.publicId id = ⟨element.header.origin.sourceId⟩ := by
  simp only [Program.publicId, found]

/-- A boundary of the envelope of an element `Program.element?` finds is one of the program's. -/
theorem boundaryOf_envelope {program : Program} {id : ElementId} {envelope : Envelope} {boundary : Boundary}
    (found : (program.element? id).bind (·.envelope?) = some envelope) (member : boundary ∈ envelope.boundaries) :
    BoundaryOf program boundary.id := by
  obtain ⟨host, located, has⟩ := Option.bind_eq_some_iff.mp found
  exact ⟨host, element?_mem located, envelope, has, boundary, member, rfl⟩

/-- The boundary `Program.boundary?` finds is one of the program's, under the identifier it was asked for. -/
theorem boundary?_boundaryOf {program : Program} {id : ElementId} {host : Element} {boundary : Boundary}
    (found : program.boundary? id = some (host, boundary)) : BoundaryOf program id ∧ boundary.id = id := by
  unfold Program.boundary? at found
  obtain ⟨element, member, made⟩ := List.exists_of_findSome?_eq_some found
  obtain ⟨located, inside, same⟩ := Option.map_eq_some_iff.mp made
  obtain ⟨envelope, has, find⟩ := Option.bind_eq_some_iff.mp inside
  have named : located.id = id := by simpa using List.find?_some find
  have equal : located = boundary := congrArg Prod.snd same
  exact ⟨⟨element, member, envelope, has, located, List.mem_of_find?_eq_some find, named⟩, equal ▸ named⟩

/-- The boundary `Program.boundary?` finds is one its host's envelope declares, under the identifier it was asked for. -/
theorem boundary?_declared {program : Program} {id : ElementId} {host : Element} {boundary : Boundary}
    (found : program.boundary? id = some (host, boundary)) :
    host ∈ program.elements ∧ ∃ envelope, host.envelope? = some envelope ∧ boundary ∈ envelope.boundaries ∧
      boundary.id = id := by
  unfold Program.boundary? at found
  obtain ⟨element, member, made⟩ := List.exists_of_findSome?_eq_some found
  obtain ⟨located, inside, same⟩ := Option.map_eq_some_iff.mp made
  obtain ⟨envelope, has, find⟩ := Option.bind_eq_some_iff.mp inside
  have named : located.id = id := by simpa using List.find?_some find
  obtain ⟨hosted, equal⟩ := Prod.mk.inj same
  subst hosted equal
  exact ⟨member, envelope, has, List.mem_of_find?_eq_some find, named⟩

/-- `Program.boundary?` finds something under the identifier of every boundary an element's envelope declares. -/
theorem boundary?_isSome {program : Program} {host : Element} {envelope : Envelope} {boundary : Boundary}
    (member : host ∈ program.elements) (has : host.envelope? = some envelope) (inside : boundary ∈ envelope.boundaries) :
    (program.boundary? boundary.id).isSome := by
  unfold Program.boundary?
  rw [List.findSome?_isSome_iff]
  refine ⟨host, member, ?_⟩
  rw [has, Option.bind_some, Option.isSome_map]
  exact List.find?_isSome.mpr ⟨boundary, inside, beq_self_eq_true _⟩

/-- `Program.boundary?` resolves an identifier the first element declares as its only boundary to that element,
whatever later elements declare. -/
theorem boundary?_first {program : Program} {first : Element} {rest : List Element} {envelope : Envelope}
    {boundary : Boundary} (elements : program.elements = first :: rest) (has : first.envelope? = some envelope)
    (only : envelope.boundaries = [boundary]) : program.boundary? boundary.id = some (first, boundary) := by
  unfold Program.boundary?
  rw [elements, List.findSome?_cons, has, Option.bind_some, only]
  simp

/-- A child `Program.children` lists is one of the program's elements. -/
theorem mem_children {program : Program} {parent : Option ElementId} {element : Element}
    (member : element ∈ program.children parent) : element ∈ program.elements := by
  unfold Program.children at member
  exact (List.mem_filter.mp member).1

/-- An element of the program whose header names a parent is one of that parent's children. -/
theorem children_mem {program : Program} {parent : ElementId} {element : Element} (member : element ∈ program.elements)
    (named : element.header.parent = some parent) : element ∈ program.children (some parent) := by
  unfold Program.children
  exact List.mem_filter.mpr ⟨member, by simp [named]⟩

/-- A process-level element of a called process (`Program.processChildren`) is one of the program's elements. -/
theorem mem_processChildren {program : Program} {process : CalledProcess} {element : Element}
    (member : element ∈ program.processChildren process) : element ∈ program.elements := by
  unfold Program.processChildren at member
  obtain ⟨_, _, found⟩ := List.mem_filterMap.mp member
  exact element?_mem found

/-- An element on a level (`Program.siblings`) is one of the program's elements. -/
theorem mem_siblings {program : Program} {header : Header} {element : Element}
    (member : element ∈ program.siblings header) : element ∈ program.elements := by
  unfold Program.siblings at member
  split at member
  · exact mem_processChildren member
  · exact mem_children member

/-- An Event Sub-Process kind's start subscription is the one it carries. -/
theorem start?_eventSubProcess (start : Subscription) (interrupting : Bool) :
    (ScopeKind.eventSubProcess start interrupting).start? = some start := by
  simp only [ScopeKind.start?]

/-! ## Footprints

A footprint's name set read as a list of names, for laws that compare name lists and have no "every name": `every`
lists the names a set may name, and a set of every name lists all of them (`listed`). -/

/-- The names `names` lists: all of `every` for a set of every name, else its own. -/
def listed (every : List String) (names : NameSet) : List String := if names.all then every else names.names

/-- Two name sets meet (`NameSet.meets`) exactly when their lists (`listed`) share a name, once `every` holds both
sets' names and at least one more, `sentinel`. By the six cases: two sets of every name share `sentinel`; a set of every
name meets another set exactly when that set names one name, from either side; and two lists meet exactly when they
share one. Without `sentinel`, two sets of every name over an empty `every` would meet with no name shared. -/
theorem NameSet.meets_iff_listed {every : List String} {sentinel : String} (inhabited : sentinel ∈ every)
    {reads writes : NameSet} (readsListed : ∀ name ∈ reads.names, name ∈ every)
    (writesListed : ∀ name ∈ writes.names, name ∈ every) :
    reads.meets writes = true ↔ ∃ name ∈ listed every reads, name ∈ listed every writes := by
  unfold NameSet.meets listed
  cases readsAll : reads.all <;> cases writesAll : writes.all
  · simp only [Bool.false_and, Bool.false_or, List.any_eq_true, List.contains_iff_mem, Bool.false_eq_true, ite_false]
  · simp only [Bool.false_and, Bool.true_and, Bool.false_or, Bool.or_eq_true, Bool.not_eq_true', List.isEmpty_eq_false_iff,
      List.any_eq_true, List.contains_iff_mem, Bool.false_eq_true, ite_false, ite_true]
    constructor
    · rintro (named | ⟨name, inside, _⟩)
      · obtain ⟨name, inside⟩ := List.exists_mem_of_ne_nil _ named
        exact ⟨name, inside, readsListed name inside⟩
      · exact ⟨name, inside, readsListed name inside⟩
    · exact fun ⟨name, inside, _⟩ => .inl (List.ne_nil_of_mem inside)
  · simp only [Bool.true_and, Bool.false_and, Bool.false_or, Bool.or_false, Bool.or_eq_true, Bool.not_eq_true',
      List.isEmpty_eq_false_iff, List.any_eq_true, List.contains_iff_mem, Bool.false_eq_true, ite_false, ite_true]
    constructor
    · rintro (named | ⟨_, _, inside⟩)
      · obtain ⟨name, inside⟩ := List.exists_mem_of_ne_nil _ named
        exact ⟨name, writesListed name inside, inside⟩
      · exact ⟨_, writesListed _ inside, inside⟩
    · exact fun ⟨_, _, inside⟩ => .inl (List.ne_nil_of_mem inside)
  · simp only [Bool.true_and, Bool.true_or, ite_true, true_iff]
    exact ⟨sentinel, inhabited, inhabited⟩

/-- A flow the program does not declare has no target. -/
theorem target?_undeclared {program : Program} {flow : FlowId}
    (undeclared : ¬(program.flows.map (·.id)).contains flow = true) : program.target? flow = none := by
  unfold Program.target?
  have missing : program.flows.find? (·.id == flow) = none :=
    List.find?_eq_none.mpr fun found mem same => undeclared (by simpa using ⟨found, mem, by simpa using same⟩)
  simp [missing]

/-- A flow's source and target, looked up by its identifier, are those of one flow the program declares. -/
theorem source?_target? {program : Program} {flow : FlowId} {source target : ElementId}
    (leaves : program.source? flow = some source) (ends : program.target? flow = some target) :
    ∃ declared ∈ program.flows, declared.source = source ∧ declared.target = target := by
  unfold Program.source? at leaves
  unfold Program.target? at ends
  cases found : program.flows.find? (·.id == flow) with
  | none => simp [found] at leaves
  | some declared =>
    simp only [found, Option.map_some, Option.some.injEq] at leaves ends
    exact ⟨declared, List.mem_of_find?_eq_some found, leaves, ends⟩

/-- **`script_il_reads_all`** (probe P14's witness, restated as the account's law): a Script Task's run reads every name
in the IL's one account, as its effect opens with every visible variable (`Kernel.Feature.Work.scriptSnapshot`); P14's
`script_il_reads_nothing` showed the account reading none. -/
theorem script_il_reads_all (program : Program) (header : Header) (work : ScriptWork) (envelope : Envelope) :
    (footprint program (.activity header { work := .script work, envelope })).reads.all = true := by
  simp [footprint, beginReads, workReads, Work.reader?, NameSet.union, Element.activity?, Element.envelope?]

/-- **`rule_il_reads_inputs`** (probe P14's witness, restated): a Business Rule Task whose literal key names a decision
table reads, in the IL's one account, each variable input of that table, as its decision does
(`Kernel.Feature.Decision.readInput`); P14's `rule_il_reads_nothing` showed the account reading none. -/
theorem rule_il_reads_inputs (program : Program) (header : Header) (work : RuleWork) (envelope : Envelope)
    {key : String} {decision : Decision} {table : DecisionTable} (keyed : work.decision.literal? = some key)
    (found : program.decision? key = some decision) (logic : decision.logic = .table table) {input : DecisionInput}
    {name : String} (listed : input ∈ table.inputs) (reads : input.expression = .variable name) :
    (footprint program (.activity header { work := .rule work, envelope })).reads.all = true ∨
      name ∈ (footprint program (.activity header { work := .rule work, envelope })).reads.names := by
  have named : name ∈ table.inputs.filterMap fun input => match input.expression with
      | .variable name => some name
      | .foreign _ => none :=
    List.mem_filterMap.mpr ⟨input, listed, by simp [reads]⟩
  rcases inputs : decisionInputs program work with _ | names
  · left
    simp [footprint, beginReads, workReads, Work.reader?, Element.activity?, Element.envelope?, inputs, NameSet.union]
  · right
    have mem : name ∈ names := by
      simp only [decisionInputs, keyed, found, logic, Option.bind_eq_bind, Option.bind_some] at inputs
      split at inputs
      · cases inputs; exact named
      · cases inputs
    simp [footprint, beginReads, workReads, Work.reader?, Element.activity?, Element.envelope?, inputs, NameSet.union, mem]

/-- A subject the program does not declare reads and writes nothing. -/
theorem subjectData_missing {program : Program} {subject : ElementId} (missing : program.element? subject = none) :
    subjectData program subject = {} := by simp [subjectData, missing]

/-! ## The structural order (DC15 (c), candidate (iii))

`structuralSearch` answers exactly whether a path of `structuralNext` steps leads from a frontier node to the target
(`structuralSearch_sound`, `structuralSearch_complete`), so `structurallyFollows` is transitive and `structurallyBefore`
a strict partial order: compensation records of one closure ordered by it can form no dependency cycle among
themselves, and a later causal order can refine it where it leaves records unordered. -/

/-- A path of the structural walk's steps from `node` to `target`. -/
inductive StructuralReach (program : Program) : StructuralNode → StructuralNode → Prop where
  | here (node : StructuralNode) : StructuralReach program node node
  | step {node after target : StructuralNode} :
      after ∈ structuralNext program node → StructuralReach program after target → StructuralReach program node target

theorem StructuralReach.trans {program : Program} {first middle last : StructuralNode}
    (left : StructuralReach program first middle) (right : StructuralReach program middle last) :
    StructuralReach program first last := by
  induction left with
  | here => exact right
  | step after _ ih => exact .step after (ih right)

/-- A node of an element the program declares is one of `Program.structuralNodes`. -/
theorem structuralNode_declared {program : Program} {id : ElementId} {element : Element}
    (found : program.element? id = some element) :
    StructuralNode.enters id ∈ program.structuralNodes ∧ StructuralNode.completes id ∈ program.structuralNodes := by
  have member := element?_mem found
  have named := element?_header found
  constructor <;> exact List.mem_flatMap.mpr ⟨element, member, by simp [named]⟩

/-- A node outside `Program.structuralNodes` leads nowhere. -/
theorem structuralNext_undeclared {program : Program} {node : StructuralNode}
    (undeclared : ¬program.structuralNodes.contains node = true) : structuralNext program node = [] := by
  cases node with
  | enters id =>
    cases found : program.element? id with
    | none => simp [structuralNext, found]
    | some element => exact absurd (by simpa using (structuralNode_declared found).1) undeclared
  | completes id =>
    cases found : program.element? id with
    | none => simp [structuralNext, found]
    | some element => exact absurd (by simpa using (structuralNode_declared found).2) undeclared

/-- What the search answers "follows" for is reachable from a frontier node. -/
theorem structuralSearch_sound {program : Program} {target : StructuralNode} {seen frontier : List StructuralNode}
    (found : structuralSearch program target seen frontier = true) :
    ∃ start ∈ frontier, StructuralReach program start target := by
  fun_induction structuralSearch program target seen frontier with
  | case1 => simp at found
  | case2 _ node rest hit => exact ⟨node, by simp, by simp at hit; exact hit ▸ .here node⟩
  | case3 _ node rest _ _ ih =>
    obtain ⟨start, mem, path⟩ := ih found
    exact ⟨start, List.mem_cons_of_mem _ mem, path⟩
  | case4 _ node rest _ _ _ ih =>
    obtain ⟨start, mem, path⟩ := ih found
    rcases List.mem_append.mp mem with inRest | after
    · exact ⟨start, List.mem_cons_of_mem _ inRest, path⟩
    · exact ⟨node, by simp, .step after path⟩
  | case5 _ node rest _ _ _ ih =>
    obtain ⟨start, mem, path⟩ := ih found
    exact ⟨start, List.mem_cons_of_mem _ mem, path⟩

/-- What the search answers "does not follow" for is unreachable from every seen or frontier node, given that no seen
node is the target and every step out of a seen node lands on a seen node, a frontier node or a non-target node that
leads nowhere. -/
theorem structuralSearch_complete {program : Program} {target : StructuralNode} {seen frontier : List StructuralNode}
    (missed : structuralSearch program target seen frontier = false)
    (seenFree : ∀ node ∈ seen, node ≠ target)
    (closed : ∀ node ∈ seen, ∀ after ∈ structuralNext program node,
      after ∈ seen ∨ after ∈ frontier ∨ (structuralNext program after = [] ∧ after ≠ target)) :
    ∀ start, (start ∈ seen ∨ start ∈ frontier) → ∀ last, StructuralReach program start last → last ≠ target := by
  fun_induction structuralSearch program target seen frontier with
  | case1 seen =>
    have safe : ∀ start last, StructuralReach program start last →
        start ∈ seen ∨ (structuralNext program start = [] ∧ start ≠ target) → last ≠ target := by
      intro start last path
      induction path with
      | here node =>
        rintro (mem | ⟨_, free⟩)
        · exact seenFree node mem
        · exact free
      | step after _ ih =>
        rintro (mem | ⟨dead, _⟩)
        · rcases closed _ mem _ after with seenAfter | none | dead
          · exact ih (.inl seenAfter)
          · simp at none
          · exact ih (.inr dead)
        · simp [dead] at after
    intro start inSome last path
    exact safe start last path (.inl (by simpa using inSome))
  | case2 => simp at missed
  | case3 seen node rest _ old ih =>
    have inSeen : node ∈ seen := by simpa using old
    intro start inSome
    refine ih missed seenFree (fun x mem after step => ?_) start ?_
    · rcases closed x mem after step with s | f | d
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact .inl (same ▸ inSeen)
        · exact .inr (.inl r)
      · exact .inr (.inr d)
    · rcases inSome with s | f
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact .inl (same ▸ inSeen)
        · exact .inr r
  | case4 seen node rest hit _ _ ih =>
    have free : node ≠ target := by simpa using hit
    intro start inSome
    refine ih missed ?_ (fun x mem after step => ?_) start ?_
    · intro x mem
      rcases List.mem_cons.mp mem with same | s
      · exact same ▸ free
      · exact seenFree x s
    · rcases List.mem_cons.mp mem with same | s
      · subst same
        exact .inr (.inl (List.mem_append_right _ step))
      · rcases closed x s after step with s' | f | d
        · exact .inl (List.mem_cons_of_mem _ s')
        · rcases List.mem_cons.mp f with same | r
          · exact .inl (same ▸ List.mem_cons_self)
          · exact .inr (.inl (List.mem_append_left _ r))
        · exact .inr (.inr d)
    · rcases inSome with s | f
      · exact .inl (List.mem_cons_of_mem _ s)
      · rcases List.mem_cons.mp f with same | r
        · exact .inl (same ▸ List.mem_cons_self)
        · exact .inr (List.mem_append_left _ r)
  | case5 seen node rest hit _ undeclared ih =>
    have free : node ≠ target := by simpa using hit
    have dead : structuralNext program node = [] := structuralNext_undeclared undeclared
    intro start inSome last path
    have fromDead : start = node → last ≠ target := by
      rintro rfl
      cases path with
      | here => exact free
      | step after _ => simp [dead] at after
    refine (Classical.em (start = node)).elim fromDead fun other => ?_
    refine ih missed seenFree (fun x mem after step => ?_) start ?_ last path
    · rcases closed x mem after step with s | f | d
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact .inr (.inr (same ▸ ⟨dead, free⟩))
        · exact .inr (.inl r)
      · exact .inr (.inr d)
    · rcases inSome with s | f
      · exact .inl s
      · rcases List.mem_cons.mp f with same | r
        · exact absurd same other
        · exact .inr r

/-- `structurallyFollows` answers exactly whether a path of at least one step leads from `earlier`'s completion to
`later`'s. -/
theorem structurallyFollows_iff {program : Program} {earlier later : ElementId} :
    structurallyFollows program earlier later = true ↔
      ∃ next ∈ structuralNext program (.completes earlier), StructuralReach program next (.completes later) := by
  constructor
  · exact structuralSearch_sound
  · rintro ⟨next, mem, path⟩
    cases answer : structurallyFollows program earlier later with
    | true => rfl
    | false =>
      exact absurd rfl (structuralSearch_complete answer (by simp) (by simp) next (.inr mem) _ path)

theorem structurallyFollows_trans {program : Program} {first middle last : ElementId}
    (left : structurallyFollows program first middle = true) (right : structurallyFollows program middle last = true) :
    structurallyFollows program first last = true := by
  obtain ⟨next, mem, path⟩ := structurallyFollows_iff.mp left
  obtain ⟨next', mem', path'⟩ := structurallyFollows_iff.mp right
  exact structurallyFollows_iff.mpr ⟨next, mem, path.trans (.step mem' path')⟩

/-- **The structural order is a strict partial order**: irreflexive, … -/
theorem structurallyBefore_irrefl (program : Program) (subject : ElementId) :
    structurallyBefore program subject subject = false := by
  simp [structurallyBefore]

/-- … asymmetric, … -/
theorem structurallyBefore_asymm {program : Program} {earlier later : ElementId}
    (before : structurallyBefore program earlier later = true) : structurallyBefore program later earlier = false := by
  simp_all [structurallyBefore]

/-- … and transitive. -/
theorem structurallyBefore_trans {program : Program} {first middle last : ElementId}
    (left : structurallyBefore program first middle = true) (right : structurallyBefore program middle last = true) :
    structurallyBefore program first last = true := by
  simp only [structurallyBefore, Bool.and_eq_true, Bool.not_eq_true'] at left right ⊢
  refine ⟨structurallyFollows_trans left.1 right.1, ?_⟩
  cases back : structurallyFollows program last first with
  | false => rfl
  | true =>
    have := structurallyFollows_trans back left.1
    simp [this] at right

end Kernel.Laws.IL
