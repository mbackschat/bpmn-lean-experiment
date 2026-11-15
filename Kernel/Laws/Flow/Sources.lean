module

public import Kernel.State

/-! # Laws of flow: where queued work comes from

What the placement lane (`Kernel.Proofs.Former.PlacedLane`) reads of a completion's named flows and of the work a
feature queues, stated over the IL and the state only, so every feature's laws can establish it: the flows an element
lists (`Lists`), a completion queued by flows offered in its scope occurrence (`LeaveOffered`), the source a
continuation that queues flow tokens comes from (`LeavesFrom`), and the anchor work queued for an element in a scope
occurrence comes from (`Anchored`). They read no feature's code, so the hook contract states them outside Flow's
rebuild cone (guard 15); `Kernel.Laws.Flow` proves what Flow's hooks queue of them. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Laws.Flow

/-- `flow` is one `element` lists: an outgoing flow, its default flow, or an outgoing flow, a candidate or the default
of its gateway. -/
def Listed (element : Element) (flow : FlowId) : Prop :=
  flow ∈ element.outgoing ∨ element.envelope?.bind (·.defaultFlow) = some flow ∨
    ∃ header payload, element.gateway? = some (header, payload) ∧ (flow ∈ payload.outgoing ∨
      ∃ candidates default, (payload.kind = .exclusive candidates default ∨ payload.kind = .inclusive candidates default) ∧
        (flow ∈ candidates ∨ default = some flow))

/-- `flow` is one the element or boundary `id` lists (`Listed`, or a boundary's outgoing flow). -/
def Lists (program : Program) (id : ElementId) (flow : FlowId) : Prop :=
  (∃ element, program.element? id = some element ∧ Listed element flow) ∨
    ∃ host boundary, program.boundary? id = some (host, boundary) ∧ flow ∈ boundary.outgoing

/-- `flow` is offered in the scope occurrence `scope` of `state`: an occurrence there lists it, a catching Link on its
level does (`Feature.Flow.linkCatches`), or the gateway a join wait of it was parked for does. -/
def Offered (program : Program) (state : State) (scope : ScopeOccurrenceId) (flow : FlowId) : Prop :=
  ∃ occurrence ∈ state.occurrences, occurrence.scope = scope ∧ (Lists program occurrence.element flow ∨
    (∃ element, program.element? occurrence.element = some element ∧ ∃ link ∈ program.siblings element.header,
      ∃ header payload, link.event? = some (header, payload) ∧ flow ∈ payload.outgoing) ∨
    ∃ waiting ∈ state.slots.parked, waiting.occurrence = occurrence.id ∧ ∃ element,
      (program.target? waiting.flow).bind program.element? = some element ∧ Listed element flow)

/-- A completion of the occurrence `id` by `leave`, queued in `state`, names only flows offered where the occurrence
lies, as a state `held` that kept `inv` and whose occurrences of that identity, scope occurrences and instance entries
include `state`'s records: in the occurrence's scope occurrence, or, for a join firing an occurrence it parked, in its join wait's. -/
def LeaveOffered (inv : State → Prop) (program : Program) (state : State) (id : Nat) (leave : Leave) : Prop :=
  ∀ selected, leave = .flows selected → ∀ flow ∈ selected, ∃ held, inv held ∧
    (∀ occurrence ∈ state.occurrences, occurrence.id = id → occurrence ∈ held.occurrences) ∧
    (∀ entry ∈ state.scopes, entry ∈ held.scopes) ∧
    (∀ entry ∈ state.slots.instances, entry ∈ held.slots.instances) ∧
    ((∃ occurrence ∈ held.occurrences, occurrence.id = id ∧ Offered program held occurrence.scope flow) ∨
      ∃ waiting ∈ held.slots.parked, waiting.occurrence = id ∧ Offered program held waiting.scope flow)

/-- The gateway `header` an arrival of `occurrence` in `state` runs: its element's, or the one a join wait of it was
parked for (`Step.reoffer?`). -/
def GatewayOf (program : Program) (state : State) (occurrence : Occurrence) (header : Header)
    (payload : GatewayPayload) : Prop :=
  ∃ element, element.gateway? = some (header, payload) ∧ (program.element? occurrence.element = some element ∨
    ∃ waiting ∈ state.slots.parked, waiting.occurrence = occurrence.id ∧
      (program.target? waiting.flow).bind program.element? = some element)

/-- Where the continuation of `occurrence` by `leave` in `state` comes from: a state `held` that kept `inv`, whose
instance entries and scope occurrences include `state`'s, held the occurrence or queued the `Signal.occur` that
reserves it, and listed or queued every named flow the continuation leaves by. `Step.complete` continues after it
removed the occurrence, so its source is read off the state the completion was taken from. -/
def LeavesFrom (inv : State → Prop) (program : Program) (state : State) (occurrence : Occurrence) (leave : Leave) :
    Prop :=
  ∃ held, inv held ∧ (∀ entry ∈ state.slots.instances, entry ∈ held.slots.instances) ∧
    (∀ entry ∈ state.scopes, entry ∈ held.scopes) ∧
    ((∃ kept ∈ held.occurrences, kept.id = occurrence.id ∧ kept.element = occurrence.element ∧
        kept.scope = occurrence.scope) ∨
      ∃ named writes rule, Signal.occur occurrence.element occurrence.scope named writes rule ∈ held.signals) ∧
    ∀ selected, leave = .flows selected → ∀ flow ∈ selected, Lists program occurrence.element flow ∨
      ∃ named writes rule, flow ∈ named ∧ (Signal.complete occurrence.id (.flows named) writes rule ∈ held.signals ∨
        Signal.occur occurrence.element occurrence.scope (.flows named) writes rule ∈ held.signals)

/-- One IL reference that keeps `element` in the process `anchor` belongs to (what `Proofs.Former.ReferencesPlaced`
states of admitted programs): `element` is `anchor`, a child or the parent of it, a boundary attached to it, the target
of a flow that leaves it, or one of its compensation handlers. -/
def Linked (program : Program) (anchor element : ElementId) : Prop :=
  element = anchor ∨ (∃ child ∈ program.children (some anchor), child.header.id = element) ∨
    (∃ child ∈ program.children (some element), child.header.id = anchor) ∨
    (∃ host boundary, program.boundary? element = some (host, boundary) ∧ host.header.id = anchor) ∨
    (∃ flow, program.source? flow = some anchor ∧ program.target? flow = some element) ∨
    ∃ found envelope, program.element? anchor = some found ∧ found.envelope? = some envelope ∧
      element ∈ envelope.compensationHandlers

/-- `anchor` lies at the top level of the process the called root `scope` of `state` runs: `scope` calls an instance,
and an instance entry of it records the definition of a process that lists `anchor` among its own elements
(`Program.processChildren`), as `State.enterCalled` records the process a Call binds. -/
def CalledAnchor (program : Program) (state : State) (anchor : ElementId) (scope : ScopeOccurrenceId) : Prop :=
  (∃ root ∈ state.scopes, root.id = scope ∧ root.calledInstance.isSome) ∧
    ∃ entry ∈ state.slots.instances, entry.root = scope ∧ ∃ process ∈ program.processes,
      entry.definition = some process.definition ∧ ∃ child ∈ program.processChildren process, child.header.id = anchor

/-- What `state` holds that places `anchor` where the scope occurrence `scope` lies: an occurrence of it there, a scope
occurrence of it entered there or, calling no instance, `scope` itself, an element the scope occurrence declares
(`State.childrenOf`), or a top-level element of the process the called root `scope` runs (`CalledAnchor`). -/
def AnchoredBy (program : Program) (state : State) (anchor : ElementId) (scope : ScopeOccurrenceId) : Prop :=
  (∃ occurrence ∈ state.occurrences, occurrence.scope = scope ∧ occurrence.element = anchor) ∨
    (∃ entry ∈ state.scopes, entry.element = some anchor ∧
      (entry.parent = some scope ∨ entry.id = scope ∧ entry.calledInstance = none)) ∨
    (∃ child ∈ state.childrenOf program scope, child.header.id = anchor) ∨ CalledAnchor program state anchor scope

/-- Where work queued for `element` in the scope occurrence `scope` of `state` comes from: one reference (`Linked`) from
an anchor that `state` places there (`AnchoredBy`), or that a state `held` that kept `inv`, and whose scope occurrences
and instance entries include `state`'s, placed there or queued an arming for there. -/
def Anchored (inv : State → Prop) (program : Program) (state : State) (element : ElementId)
    (scope : ScopeOccurrenceId) : Prop :=
  ∃ anchor, Linked program anchor element ∧ (AnchoredBy program state anchor scope ∨
    ∃ held, inv held ∧ (∀ entry ∈ state.scopes, entry ∈ held.scopes) ∧
      (∀ entry ∈ state.slots.instances, entry ∈ held.slots.instances) ∧ (AnchoredBy program held anchor scope ∨
        (∃ host, Signal.arm host anchor scope ∈ held.signals) ∨
        ∃ occurrence, Signal.armGateway occurrence anchor scope ∈ held.signals))

/-- An anchor read under `inv` is one read under anything `inv` implies. -/
theorem Anchored.mono {inv weaker : State → Prop} {program : Program} {state : State} {element : ElementId}
    {scope : ScopeOccurrenceId} (anchored : Anchored inv program state element scope) (implies : ∀ s, inv s → weaker s) :
    Anchored weaker program state element scope := by
  obtain ⟨anchor, linked, source⟩ := anchored
  refine ⟨anchor, linked, source.imp id fun ⟨held, holds, rest⟩ => ⟨held, implies held holds, rest⟩⟩

/-- An element an occurrence there runs is anchored where it lies. -/
theorem Anchored.occurrence {inv : State → Prop} {program : Program} {state : State} {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) : Anchored inv program state occurrence.element occurrence.scope :=
  ⟨occurrence.element, .inl rfl, .inl (.inl ⟨occurrence, member, rfl, rfl⟩)⟩

/-- A continuation by flows that come from a source continues by any reordering of them. -/
theorem LeavesFrom.flows {inv : State → Prop} {program : Program} {state : State} {occurrence : Occurrence}
    {selected flows : List FlowId} (continues : LeavesFrom inv program state occurrence (.flows selected))
    (among : ∀ flow ∈ flows, flow ∈ selected) : LeavesFrom inv program state occurrence (.flows flows) := by
  obtain ⟨held, holds, kept⟩ := continues
  obtain ⟨instances, scopes, source, named⟩ := kept
  exact ⟨held, holds, instances, scopes, source, fun _ same flow member => by
    cases same
    exact named selected rfl flow (among flow member)⟩

/-- A continuation whose flows its element lists comes from where its occurrence did. -/
theorem LeavesFrom.listed {inv : State → Prop} {program : Program} {state : State} {occurrence : Occurrence}
    {leave : Leave} {flows : List FlowId} (continues : LeavesFrom inv program state occurrence leave)
    (listed : ∀ flow ∈ flows, Lists program occurrence.element flow) :
    LeavesFrom inv program state occurrence (.flows flows) := by
  obtain ⟨held, holds, kept⟩ := continues
  obtain ⟨instances, scopes, source, _⟩ := kept
  exact ⟨held, holds, instances, scopes, source, fun _ same flow member => by
    cases same
    exact .inl (listed flow member)⟩

/-- A source covers a later state whose instance entries and scope occurrences are among the state's, and an
occurrence with the same number, element and scope occurrence. -/
theorem LeavesFrom.shrink {inv : State → Prop} {program : Program} {state : State} {occurrence : Occurrence}
    {leave : Leave} (continues : LeavesFrom inv program state occurrence leave) {later : State} {moved : Occurrence}
    (instances : ∀ entry ∈ later.slots.instances, entry ∈ state.slots.instances)
    (scopes : ∀ entry ∈ later.scopes, entry ∈ state.scopes) (id : moved.id = occurrence.id)
    (element : moved.element = occurrence.element) (scope : moved.scope = occurrence.scope) :
    LeavesFrom inv program later moved leave := by
  obtain ⟨held, holds, kept⟩ := continues
  obtain ⟨heldInstances, heldScopes, source, named⟩ := kept
  unfold LeavesFrom
  rw [id, element, scope]
  exact ⟨held, holds, fun entry member => heldInstances entry (instances entry member),
    fun entry member => heldScopes entry (scopes entry member), source, named⟩

/-- A source read under `inv` is one read under anything `inv` implies. -/
theorem LeavesFrom.mono {inv weaker : State → Prop} {program : Program} {state : State} {occurrence : Occurrence}
    {leave : Leave} (continues : LeavesFrom inv program state occurrence leave) (implies : ∀ s, inv s → weaker s) :
    LeavesFrom weaker program state occurrence leave := by
  obtain ⟨held, holds, kept⟩ := continues
  exact ⟨held, implies held holds, kept⟩

/-- A completion offered under `inv` is one offered under anything `inv` implies. -/
theorem LeaveOffered.mono {inv weaker : State → Prop} {program : Program} {state : State} {id : Nat} {leave : Leave}
    (offered : LeaveOffered inv program state id leave) (implies : ∀ s, inv s → weaker s) :
    LeaveOffered weaker program state id leave := fun selected same flow inside => by
  obtain ⟨held, holds, kept⟩ := offered selected same flow inside
  exact ⟨held, implies held holds, kept⟩

/-- A completion's source covers the leave `Hooks.select` chose: the same, or flows its element lists. -/
theorem LeavesFrom.chosen {inv : State → Prop} {program : Program} {state : State} {occurrence : Occurrence}
    {leave chosen : Leave} (continues : LeavesFrom inv program state occurrence leave)
    (picked : chosen = leave ∨ ∃ flows, chosen = .flows flows ∧ ∀ flow ∈ flows, Lists program occurrence.element flow) :
    LeavesFrom inv program state occurrence chosen := by
  rcases picked with same | ⟨flows, rfl, listed⟩
  · exact same ▸ continues
  · exact continues.listed listed

end Kernel.Laws.Flow
