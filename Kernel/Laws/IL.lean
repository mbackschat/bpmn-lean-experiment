module

public import Kernel.IL.Types
public import Kernel.IL.Footprint
import all Kernel.IL.Types
import all Kernel.IL.Types.Options
import all Kernel.IL.Types.Work
import all Kernel.IL.Footprint

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

end Kernel.Laws.IL
