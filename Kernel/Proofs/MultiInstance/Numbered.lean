module

public import Kernel.Laws.Step.Ends
public import Kernel.Laws.State.Claim
public import Kernel.Laws.Step.Signals
public import Kernel.Proofs.MultiInstance.Occurs

/-! # Proofs: the numbering of Multi-Instance instances beside `WellFormed`

What the numbering lane carries beside `WellFormed` and the slot invariant's ownership (`SlotsOwned`): every running body numbers its instances in item
order (`NumberedInOrder`), each instance is the one occurrence of the Activity under the element role in its scope
occurrence (`InstancesPlaced`), and the instance begins still queued are in slot order (`BeginsQueued`), together
`Numbered`. A program whose identifiers are unique (`IdsUnique`) is the model premise: a reservation is an occurrence
under the element role, so one of a looping element in an instance's scope occurrence would be no instance.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed scopeIds)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique NumberedInOrder InstancesPlaced BeginsQueued BeginsOrdered
  QueuedFor Owned BodyOwns InstancesUnowned RunsKeyed)
open Kernel.Laws.Step (OccurPending)

/-! ## The relation -/

/-- `NumberedInOrder` under the relation `below` of the earlier and the later instance's activations: the law's
`CommittedBelow`, or with it, under `declarationDepthFirst`, the run order the commit numbers pending ones in
(`Kernel.Proofs.MultiInstance.RunOrder`). -/
def InOrderBy (below : Issue → Issue → Prop) (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ (first second : Nat) (firstScope secondScope : ScopeOccurrenceId), first < second →
    run.instances[first]? = some (.active firstScope) → run.instances[second]? = some (.active secondScope) →
    ∀ earlier ∈ s.occurrences, ∀ later ∈ s.occurrences, earlier.scope = firstScope → later.scope = secondScope →
      earlier.continuation = .multiInstance run.occurrence → later.continuation = .multiInstance run.occurrence →
      below earlier.activation later.activation

theorem inOrderBy_committed {s : State} {run : MultiInstanceRun} :
    InOrderBy Laws.MultiInstance.CommittedBelow s run ↔ NumberedInOrder s run := Iff.rfl

/-- Every activation is `CommittedBelow` a pending one. -/
theorem committedBelow_fresh (a : Issue) (unit : UnitKey) (index : Nat) :
    Laws.MultiInstance.CommittedBelow a (.fresh unit index) := fun _ committed => by cases committed

/-- The numbering of every running body's instances, their identity, and the order of the instance begins still
queued. -/
def NumberedBy (below : Issue → Issue → Prop) (program : Program) (s : State) : Prop :=
  (∀ run ∈ s.slots.multiInstances, InOrderBy below s run ∧ InstancesPlaced s run) ∧ BeginsQueued program s

/-- `NumberedBy` under `Laws.MultiInstance.CommittedBelow`, the law's relation: what holds of every state. -/
abbrev Numbered (program : Program) (s : State) : Prop := NumberedBy Laws.MultiInstance.CommittedBelow program s

/-- `NumberedBy` under a relation that holds wherever `below` does between the activations of the state's
occurrences. -/
theorem NumberedBy.imp {below below' : Issue → Issue → Prop} {program : Program} {s : State}
    (weaker : ∀ earlier ∈ s.occurrences, ∀ later ∈ s.occurrences, below earlier.activation later.activation →
      below' earlier.activation later.activation)
    (held : NumberedBy below program s) : NumberedBy below' program s :=
  ⟨fun run member => ⟨fun first second firstScope secondScope lower firstAt secondAt earlier present later present'
      firstIn secondIn firstBody secondBody => weaker earlier present later present' ((held.1 run member).1 first second
        firstScope secondScope lower firstAt secondAt earlier present later present' firstIn secondIn firstBody
        secondBody), (held.1 run member).2⟩, held.2⟩

/-! ## Taking away -/

/-- Begin requests queued as signals of a sublist lie among the queued begins in the same order. -/
theorem beginsOf_sublist {small large : List Signal} (sub : small.Sublist large) :
    (Laws.Step.beginsOf small).Sublist (Laws.Step.beginsOf large) :=
  Laws.Step.sublist_beginsOf.mp ((Laws.Step.sublist_beginsOf.mpr (.refl _)).trans sub)

/-- Deferred begins of a sublist lie among the deferred begins in the same order. -/
theorem deferredOf_sublist {small large : List Token} (sub : small.Sublist large) :
    (Laws.Step.deferredOf small).Sublist (Laws.Step.deferredOf large) :=
  Laws.Step.sublist_deferredOf.mp ((Laws.Step.sublist_deferredOf.mpr (.refl _)).trans sub)

/-- `t` queues at most the begins `s` queues, each queue as it holds them: the running batch's begins and deferred
begins in their order, and each keyed begin under its key. -/
structure BeginsFewer (s t : State) : Prop where
  begins : (Laws.Step.beginsOf t.batchSignals).Sublist (Laws.Step.beginsOf s.batchSignals)
  deferred : (Laws.Step.deferredOf t.batchTokens).Sublist (Laws.Step.deferredOf s.batchTokens)
  queuedSignals : ∀ (unit : UnitKey) request, t.queuedSignals[unit]? = some (Signal.begin request) →
    s.queuedSignals[unit]? = some (Signal.begin request)
  queuedTokens : ∀ (unit : UnitKey) request, t.queuedTokens[unit]? = some (Token.begin request) →
    s.queuedTokens[unit]? = some (Token.begin request)

theorem BeginsFewer.of_kept {s t : State} (kept : Laws.State.QueuesKept s t) : BeginsFewer s t :=
  ⟨beginsOf_sublist kept.signals, deferredOf_sublist kept.tokens, fun unit _ found => kept.queuedSignals unit _ found,
    fun unit _ found => kept.queuedTokens unit _ found⟩

theorem BeginsFewer.same {s t : State} (begins : Laws.Step.beginsOf t.batchSignals = Laws.Step.beginsOf s.batchSignals)
    (deferred : Laws.Step.deferredOf t.batchTokens = Laws.Step.deferredOf s.batchTokens)
    (queuedSignals : t.queuedSignals = s.queuedSignals) (queuedTokens : t.queuedTokens = s.queuedTokens) :
    BeginsFewer s t :=
  ⟨begins ▸ .refl _, deferred ▸ .refl _, fun _ _ found => queuedSignals ▸ found, fun _ _ found => queuedTokens ▸ found⟩

/-- A begin queued in `t` was queued in `s`, in the same queue. -/
theorem BeginsFewer.signal_mem {s t : State} (fewer : BeginsFewer s t) {request : BeginRequest}
    (signal : Signal.begin request ∈ Laws.State.allSignals t) : Signal.begin request ∈ Laws.State.allSignals s := by
  rcases List.mem_append.mp signal with keyed | batch
  · obtain ⟨unit, found⟩ := Laws.State.mem_values.mp keyed
    exact Laws.State.mem_allSignals_of (fewer.queuedSignals unit request found)
  · exact List.mem_append_right _ (Laws.Step.mem_beginsOf.mp (fewer.begins.subset (Laws.Step.mem_beginsOf.mpr batch)))

theorem BeginsFewer.token_mem {s t : State} (fewer : BeginsFewer s t) {request : BeginRequest}
    (token : Token.begin request ∈ Laws.State.allQueuedTokens t) :
    Token.begin request ∈ Laws.State.allQueuedTokens s := by
  rcases List.mem_append.mp token with keyed | batch
  · obtain ⟨unit, found⟩ := Laws.State.mem_values.mp keyed
    exact Laws.State.mem_allQueuedTokens_of (fewer.queuedTokens unit request found)
  · exact List.mem_append_right _
      (Laws.Step.mem_deferredOf.mp (fewer.deferred.subset (Laws.Step.mem_deferredOf.mpr batch)))

/-- A request queued in `t` was queued in `s`. -/
theorem BeginsFewer.queued {s t : State} (fewer : BeginsFewer s t) {request : BeginRequest}
    (queued : Laws.State.Queued t request) : Laws.State.Queued s request :=
  queued.imp fewer.signal_mem fewer.token_mem

/-- The order of a body's queued begins holds of fewer begins, and of another body whose queued begins are its own. -/
theorem ordered_fewer {s t : State} {run other : MultiInstanceRun} (ordered : BeginsOrdered s other)
    (fewer : BeginsFewer s t) (same : ∀ index request, QueuedFor run index request → QueuedFor other index request) :
    BeginsOrdered t run where
  signals first second first' second' precedes one two := ordered.signals first second first' second'
    (Laws.Step.precedes_beginsOf.mpr ((Laws.Step.precedes_beginsOf.mp precedes).trans fewer.begins))
    (same _ _ one) (same _ _ two)
  tokens first second first' second' precedes one two := ordered.tokens first second first' second'
    (Laws.Step.precedes_deferredOf.mpr ((Laws.Step.precedes_deferredOf.mp precedes).trans fewer.deferred))
    (same _ _ one) (same _ _ two)
  queues first second first' second' signal token one two := ordered.queues first second first' second'
    (Laws.Step.mem_beginsOf.mp (fewer.begins.subset (Laws.Step.mem_beginsOf.mpr signal)))
    (Laws.Step.mem_deferredOf.mp (fewer.deferred.subset (Laws.Step.mem_deferredOf.mpr token))) (same _ _ one)
    (same _ _ two)
  apart first second first' second' batch one unit keyed two := ordered.apart first second first' second'
    (batch.imp (fun signal => Laws.Step.mem_beginsOf.mp (fewer.begins.subset (Laws.Step.mem_beginsOf.mpr signal)))
      fun token => Laws.Step.mem_deferredOf.mp (fewer.deferred.subset (Laws.Step.mem_deferredOf.mpr token)))
    (same _ _ one) unit (keyed.imp (fewer.queuedSignals unit second) (fewer.queuedTokens unit second)) (same _ _ two)
  keyedSignals one two first second first' second' found found' a b := ordered.keyedSignals one two first second
    first' second' (fewer.queuedSignals _ _ found) (fewer.queuedSignals _ _ found') (same _ _ a) (same _ _ b)
  keyedTokens one two first second first' second' found found' a b := ordered.keyedTokens one two first second
    first' second' (fewer.queuedTokens _ _ found) (fewer.queuedTokens _ _ found') (same _ _ a) (same _ _ b)
  keyedQueues one two first second first' second' found found' a b := ordered.keyedQueues one two first second
    first' second' (fewer.queuedSignals _ _ found) (fewer.queuedTokens _ _ found') (same _ _ a) (same _ _ b)

/-- What `t` keeps of what `Numbered` reads of `s` when it only takes away: fewer runs and occurrences, scope
occurrences of `s` or fresh ones no instance and no queued begin names, a body that goes takes its instances' scope
occurrences with it, the queued begins a sublist in queue order, and a reservation newly pending only of an element
that does not loop. -/
structure Shrinks (program : Program) (s t : State) : Prop where
  runs : t.slots.multiInstances.Sublist s.slots.multiInstances
  occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences
  scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ (∀ run ∈ s.slots.multiInstances,
    Iteration.active entry.id ∉ run.instances) ∧ ∀ request, Laws.State.Queued s request → request.scope ≠ entry.id
  gone : ∀ run ∈ s.slots.multiInstances, run ∉ t.slots.multiInstances → ∀ scope,
    Iteration.active scope ∈ run.instances → scope ∉ scopeIds t
  fewer : BeginsFewer s t
  pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop

/-- What `Shrinks` keeps. -/
theorem NumberedBy.shrink {below : Issue → Issue → Prop} {program : Program} {s t : State} (held : NumberedBy below program s) (shrinks : Shrinks program s t) :
    NumberedBy below program t := by
  obtain ⟨each, queued⟩ := held
  have runIn : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances := fun _ member =>
    shrinks.runs.subset member
  have queuedIn : ∀ request, Laws.State.Queued t request → Laws.State.Queued s request := fun _ inQueue =>
    shrinks.fewer.queued inQueue
  refine ⟨fun run member => ⟨fun first second firstScope secondScope lower one two earlier earlierIn later laterIn =>
      (each run (runIn run member)).1 first second firstScope secondScope lower one two earlier
        (shrinks.occurrences earlier earlierIn) later (shrinks.occurrences later laterIn),
    fun scope active o inside => (each run (runIn run member)).2 scope active o (shrinks.occurrences o inside)⟩, ?_⟩
  exact {
    looped := fun run member => queued.looped run (runIn run member)
    uncalled := fun run member scope active entry inside named => by
      rcases shrinks.scopes entry inside with old | fresh
      · exact queued.uncalled run (runIn run member) scope active entry old named
      · exact absurd (named ▸ active) (fresh.1 run (runIn run member))
    continued := fun run member o inside => queued.continued run (runIn run member) o (shrinks.occurrences o inside)
    targets := fun request inQueue body continued stands => by
      obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
      have old := (shrinks.scopes entry inside).resolve_right fun fresh =>
        fresh.2 request (queuedIn request inQueue) named.symm
      obtain ⟨run, member, rest⟩ := queued.targets request (queuedIn request inQueue) body continued
        (List.mem_map.mpr ⟨entry, old, named⟩)
      refine ⟨run, Classical.byContradiction fun outside => ?_, rest⟩
      exact shrinks.gone run member outside request.scope rest.2.2.2 stands
    reserved := fun request inQueue run member active id named o inside =>
      queued.reserved request (queuedIn request inQueue) run (runIn run member) active id named o
        (shrinks.occurrences o inside)
    reservations := fun o inside => queued.reservations o (shrinks.occurrences o inside)
    occurs := fun element pending => (shrinks.pending element pending).elim (queued.occurs element) id
    ordered := fun run member => ordered_fewer (queued.ordered run (runIn run member)) shrinks.fewer fun _ _ queued => queued
    deferred := fun schedule request token => queued.deferred schedule request (shrinks.fewer.token_mem token)
    above := fun run member request index queued' scope inQueue for_ slot begun => by
      obtain ⟨o, inside, rest⟩ := begun
      exact queued.above run (runIn run member) request index queued' scope (queuedIn request inQueue) for_ slot
        ⟨o, shrinks.occurrences o inside, rest⟩ }

/-- What `t` keeps of what `Numbered` reads of `s` when it relabels occurrences: each occurrence of `t` has one in `s`
of its identity, element, scope occurrence, activation, role and continuation, unbegun only if that one is, and nothing
else `Numbered` reads moves. -/
structure Relabels (s t : State) : Prop where
  occurrences : ∀ x ∈ t.occurrences, ∃ y ∈ s.occurrences, x.id = y.id ∧ x.element = y.element ∧ x.scope = y.scope ∧
    x.activation = y.activation ∧ x.role = y.role ∧ x.continuation = y.continuation ∧ (x.begun = false → y.begun = false)
  scopes : t.scopes = s.scopes
  runs : t.slots.multiInstances = s.slots.multiInstances
  queues : Laws.State.QueuesKept s t
  compensation : t.slots.compensation.runs = s.slots.compensation.runs

/-- What `Relabels` keeps. -/
theorem NumberedBy.relabel {below : Issue → Issue → Prop} {program : Program} {s t : State} (held : NumberedBy below program s) (relabels : Relabels s t) :
    NumberedBy below program t := by
  obtain ⟨each, queued⟩ := held
  have runIn : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances := fun _ member => relabels.runs ▸ member
  have queuedIn : ∀ request, Laws.State.Queued t request → Laws.State.Queued s request := fun _ inQueue =>
    (BeginsFewer.of_kept relabels.queues).queued inQueue
  refine ⟨fun run member => ⟨fun first second firstScope secondScope lower one two earlier earlierIn later laterIn
      earlierAt laterAt earlierOn laterOn => ?_, fun scope active x inside at_ named role => ?_⟩, ?_⟩
  · obtain ⟨y, yIn, same⟩ := relabels.occurrences earlier earlierIn
    obtain ⟨z, zIn, other⟩ := relabels.occurrences later laterIn
    rw [same.2.2.2.1, other.2.2.2.1]
    exact (each run (runIn run member)).1 first second firstScope secondScope lower one two y yIn z zIn
      (same.2.2.1 ▸ earlierAt) (other.2.2.1 ▸ laterAt) (same.2.2.2.2.2.1 ▸ earlierOn) (other.2.2.2.2.2.1 ▸ laterOn)
  · obtain ⟨y, yIn, same⟩ := relabels.occurrences x inside
    rw [same.2.2.2.2.2.1]
    exact (each run (runIn run member)).2 scope active y yIn (same.2.2.1 ▸ at_) (same.2.1 ▸ named)
      (same.2.2.2.2.1 ▸ role)
  exact {
    looped := fun run member => queued.looped run (runIn run member)
    uncalled := fun run member scope active entry inside =>
      queued.uncalled run (runIn run member) scope active entry (relabels.scopes ▸ inside)
    continued := fun run member x inside on active => by
      obtain ⟨y, yIn, same⟩ := relabels.occurrences x inside
      rw [same.2.1, same.2.2.2.2.1]
      exact queued.continued run (runIn run member) y yIn (same.2.2.2.2.2.1 ▸ on) (same.2.2.1 ▸ active)
    targets := fun request inQueue body on stands => by
      obtain ⟨run, member, rest⟩ := queued.targets request (queuedIn request inQueue) body on
        (by rw [Laws.State.scopeIds, ← relabels.scopes]; exact stands)
      exact ⟨run, relabels.runs ▸ member, rest⟩
    reserved := fun request inQueue run member active id named x inside xid xelement xrole => by
      obtain ⟨y, yIn, same⟩ := relabels.occurrences x inside
      exact queued.reserved request (queuedIn request inQueue) run (runIn run member) active id named y yIn
        (same.1 ▸ xid) (same.2.1 ▸ xelement) (same.2.2.2.2.1 ▸ xrole)
    reservations := fun x inside unbegun => by
      obtain ⟨y, yIn, same⟩ := relabels.occurrences x inside
      rw [same.2.2.2.2.2.1]
      exact queued.reservations y yIn (same.2.2.2.2.2.2 unbegun)
    occurs := fun element pending =>
      queued.occurs element (pending_kept relabels.queues relabels.compensation pending)
    ordered := fun run member => ordered_fewer (queued.ordered run (runIn run member)) (.of_kept relabels.queues)
      fun _ _ queued => queued
    deferred := fun schedule request token => queued.deferred schedule request (relabels.queues.token_mem _ token)
    above := fun run member request index queued' scope inQueue for_ slot begun => by
      obtain ⟨x, inside, at_, on⟩ := begun
      obtain ⟨y, yIn, same⟩ := relabels.occurrences x inside
      exact queued.above run (runIn run member) request index queued' scope (queuedIn request inQueue) for_ slot
        ⟨y, yIn, same.2.2.1 ▸ at_, same.2.2.2.2.2.1 ▸ on⟩ }

/-! ## Adding an occurrence that is no instance -/

/-- What `t` keeps of what `Numbered` reads of `s` when it adds `o`, which is no instance: the scope occurrences, the
runs, the queues and the compensation runs stay; `o` is no element-role occurrence of a body's element in one of its
instances' scope occurrences, continues by its flows while unbegun, and no queued begin into an instance's scope
occurrence names it as a reservation of the body's element under the element role. -/
structure AddsOne (s t : State) (o : Occurrence) : Prop where
  occurrences : ∀ x ∈ t.occurrences, x ∈ s.occurrences ∨ x = o
  scopes : t.scopes = s.scopes
  runs : t.slots.multiInstances = s.slots.multiInstances
  queues : Laws.State.QueuesKept s t
  compensation : t.slots.compensation.runs = s.slots.compensation.runs
  continued : ∀ body, o.continuation ≠ .multiInstance body
  placed : ∀ run ∈ s.slots.multiInstances, Iteration.active o.scope ∈ run.instances → o.element = run.element →
    o.role ≠ .element
  reservation : o.begun = false → o.continuation = .flow
  unnamed : ∀ request, Laws.State.Queued s request → request.reserved = some o.id → ∀ run ∈ s.slots.multiInstances,
    Iteration.active request.scope ∈ run.instances → o.element = run.element → o.role = .element → False

/-- What `AddsOne` keeps. -/
theorem NumberedBy.addOne {below : Issue → Issue → Prop} {program : Program} {s t : State} {o : Occurrence} (held : NumberedBy below program s)
    (adds : AddsOne s t o) : NumberedBy below program t := by
  obtain ⟨each, queued⟩ := held
  have runIn : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances := fun _ member => adds.runs ▸ member
  have queuedIn : ∀ request, Laws.State.Queued t request → Laws.State.Queued s request := fun _ inQueue =>
    (BeginsFewer.of_kept adds.queues).queued inQueue
  have instanceIn : ∀ x ∈ t.occurrences, ∀ body, x.continuation = .multiInstance body → x ∈ s.occurrences :=
    fun x inside body on => (adds.occurrences x inside).resolve_right fun same => adds.continued body (same ▸ on)
  refine ⟨fun run member => ⟨fun first second firstScope secondScope lower one two earlier earlierIn later laterIn
      earlierAt laterAt earlierOn laterOn => (each run (runIn run member)).1 first second firstScope secondScope lower
      one two earlier (instanceIn earlier earlierIn _ earlierOn) later (instanceIn later laterIn _ laterOn) earlierAt
      laterAt earlierOn laterOn, fun scope active x inside at_ named role => ?_⟩, ?_⟩
  · rcases adds.occurrences x inside with old | rfl
    · exact (each run (runIn run member)).2 scope active x old at_ named role
    · exact absurd role (adds.placed run (runIn run member) (at_ ▸ active) named)
  exact {
    looped := fun run member => queued.looped run (runIn run member)
    uncalled := fun run member scope active entry inside =>
      queued.uncalled run (runIn run member) scope active entry (adds.scopes ▸ inside)
    continued := fun run member x inside on =>
      queued.continued run (runIn run member) x (instanceIn x inside _ on) on
    targets := fun request inQueue body on stands => by
      obtain ⟨run, member, rest⟩ := queued.targets request (queuedIn request inQueue) body on
        (by rw [Laws.State.scopeIds, ← adds.scopes]; exact stands)
      exact ⟨run, adds.runs ▸ member, rest⟩
    reserved := fun request inQueue run member active id named x inside xid xelement xrole => by
      rcases adds.occurrences x inside with old | rfl
      · exact queued.reserved request (queuedIn request inQueue) run (runIn run member) active id named x old xid
          xelement xrole
      · exact adds.unnamed request (queuedIn request inQueue) (by rw [named, xid]) run (runIn run member) active
          xelement xrole
    reservations := fun x inside unbegun => by
      rcases adds.occurrences x inside with old | rfl
      · exact queued.reservations x old unbegun
      · exact adds.reservation unbegun
    occurs := fun element pending =>
      queued.occurs element (pending_kept adds.queues adds.compensation pending)
    ordered := fun run member => ordered_fewer (queued.ordered run (runIn run member)) (.of_kept adds.queues)
      fun _ _ queued => queued
    deferred := fun schedule request token => queued.deferred schedule request (adds.queues.token_mem _ token)
    above := fun run member request index queued' scope inQueue for_ slot begun => by
      obtain ⟨x, inside, at_, on⟩ := begun
      exact queued.above run (runIn run member) request index queued' scope (queuedIn request inQueue) for_ slot
        ⟨x, instanceIn x inside _ on, at_, on⟩ }

/-- A reservation of an element that does not loop keeps `Numbered`: it is issued at the counter, above every name a
queued begin holds. -/
theorem NumberedBy.reserve {below : Issue → Issue → Prop} {program other : Program} {s : State} {element : ElementId} {scope : ScopeOccurrenceId}
    (formed : WellFormed other s) (unlooped : ∀ loop, ¬ LoopOf program element loop) (stands : scope ∈ scopeIds s)
    (held : NumberedBy below program s) : NumberedBy below program (s.reserve element scope).1 := by
  have reserves := Laws.State.reserve_reserves s element scope
  have unnamed : ∀ request, Laws.State.Queued s request → (s.reserve element scope).2.id ∉ Laws.State.names request :=
    fun request queued named => by
      exact reserves.fresh formed.issuer (by rw [reserves.placed]; exact stands)
        ((formed.claimed.named request queued).2 _ named).1
  refine held.addOne (o := (s.reserve element scope).2) ⟨fun x inside => ?_, reserves.scopes,
    congrArg (·.multiInstances) reserves.slots, reserves.queues,
    congrArg (·.compensation.runs) reserves.slots, fun body same => ?_, fun run member _ named _ => ?_,
    fun _ => reserves.continued, fun request inQueue named _ _ _ _ _ => ?_⟩
  · exact reserves.mem_occurrences inside
  · rw [reserves.continued] at same
    exact Laws.Step.flow_ne_multiInstance body same
  · obtain ⟨loop, looped⟩ := held.2.looped run member
    rw [reserves.kind] at named
    exact unlooped loop (named ▸ looped)
  · exact unnamed request inQueue (by simp [Laws.State.names, named])

/-- Starting a reservation in place keeps `Numbered`. -/
theorem NumberedBy.startReserved {below : Issue → Issue → Prop} {program : Program} {s : State} {occurrence : Occurrence} (sourceType : String)
    (held : NumberedBy below program s) (member : occurrence ∈ s.occurrences) :
    NumberedBy below program (s.startReserved occurrence sourceType).1 := by
  cases begun : occurrence.begun
  · have starts := Laws.State.startReserved_starts s sourceType begun
    refine held.relabel ⟨fun x inside => ?_, starts.scopes, congrArg (·.multiInstances) starts.slots, starts.queues,
      congrArg (·.compensation.runs) starts.slots⟩
    rcases starts.mem_occurrences inside with old | made
    · exact ⟨x, old, rfl, rfl, rfl, rfl, rfl, rfl, id⟩
    · subst made
      exact ⟨occurrence, member, rfl, rfl, rfl, rfl, rfl, rfl, fun none => by simp at none⟩
  · rw [Laws.State.startReserved_begun s sourceType begun]
    exact held

/-! ## Beginning -/

/-- What the numbering reads of the slot invariant: one running body per body occurrence, each owning its instances'
scope occurrences, which lie directly below the body's, which its body occurrence owns. It reads no feature, so the
numbering's lemmas stay outside every feature's rebuild cone (guard 15). -/
structure SlotsOwned (s : State) : Prop where
  keyed : RunsKeyed s
  owned : ∀ run ∈ s.slots.multiInstances, Owned s run
  bodyOwns : ∀ run ∈ s.slots.multiInstances, BodyOwns s run
  unowned : ∀ run ∈ s.slots.multiInstances, InstancesUnowned s run

/-- A role that is no body's is the element role. -/
theorem role_element : ∀ role : ActivationRole, role ≠ .multiInstanceBody → role = .element
  | .element, _ => rfl
  | .multiInstanceBody, other => absurd rfl other

/-- Two running bodies with one active instance scope occurrence are one: the scope occurrence lies directly below each
body's own, which its body occurrence owns, and bodies are keyed by their occurrence. -/
theorem slot_run {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    {first second : MultiInstanceRun} (one : first ∈ s.slots.multiInstances) (two : second ∈ s.slots.multiInstances)
    {scope : ScopeOccurrenceId} (inFirst : Iteration.active scope ∈ first.instances)
    (inSecond : Iteration.active scope ∈ second.instances) : first = second := by
  obtain ⟨i, slotFirst⟩ := List.mem_iff_getElem?.mp inFirst
  obtain ⟨j, slotSecond⟩ := List.mem_iff_getElem?.mp inSecond
  obtain ⟨e, eIn, eNamed, eLink⟩ := (owns.owned first one).instanceScopes i scope slotFirst
  obtain ⟨f, fIn, fNamed, fLink⟩ := (owns.owned second two).instanceScopes j scope slotSecond
  obtain rfl := Laws.State.scope_unique formed.distinct eIn fIn (eNamed.trans fNamed.symm)
  have scopes : first.scope = second.scope := Option.some.inj (eLink.symm.trans fLink)
  obtain ⟨b, bIn, bNamed⟩ := List.mem_map.mp (owns.owned second two).bodyScope
  have owner := owns.bodyOwns first one b bIn (bNamed.trans scopes.symm)
  rw [owns.bodyOwns second two b bIn bNamed] at owner
  exact Laws.State.nodup_map_eq owns.keyed one two (Option.some.inj owner).symm

/-- An active instance's scope occurrence lies in its body's process instance. -/
theorem slot_instance {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    (queued : BeginsQueued program s) {run : MultiInstanceRun} (member : run ∈ s.slots.multiInstances)
    {index : Nat} {scope : ScopeOccurrenceId} (slot : run.instances[index]? = some (.active scope)) :
    s.instanceOf scope = s.instanceOf run.scope := by
  obtain ⟨e, eIn, eNamed, eLink⟩ := (owns.owned run member).instanceScopes index scope slot
  have := Laws.State.instanceOf_child formed eIn
    (queued.uncalled run member scope (List.mem_of_getElem? slot) e eIn eNamed) eLink
    (owns.owned run member).bodyScope
  rwa [eNamed] at this

/-- An instance begun from a queue: its role is the element role. -/
theorem roleOf_instance {program : Program} {request : BeginRequest} {body : OccurrenceId}
    (on : request.continuation = .multiInstance body) : Step.roleOf program request = .element :=
  role_element _ fun roled => absurd on ((Laws.Step.roleOf_body.mp roled).2 body)

/-- A begin that begins no instance, of an element with a Multi-Instance envelope, numbers apart as a body. -/
theorem roleOf_other {program : Program} {request : BeginRequest}
    (other : ∀ body, request.continuation ≠ .multiInstance body)
    (looping : (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true) :
    Step.roleOf program request = .multiInstanceBody :=
  Laws.Step.roleOf_body.mpr ⟨looping, other⟩

/-- A begin `request` that names a reservation of `s` is no element-role begin of a body's element into an instance's
scope occurrence. -/
def ReservedApart (s : State) (request : BeginRequest) : Prop :=
  ∀ reserved ∈ s.occurrences, request.reserved = some reserved.id → ∀ run ∈ s.slots.multiInstances,
    Iteration.active request.scope ∈ run.instances → reserved.element = run.element → reserved.role = .element → False

/-- A begin that begins no instance keeps `Numbered`: a fresh one of a body's element is a body, numbered apart, and a
reserved one is `ReservedApart` and claimed by nothing else queued. -/
theorem NumberedBy.beginOther {below : Issue → Issue → Prop} {program : Program} {s : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} (formed : WellFormed program s) (stands : request.scope ∈ scopeIds s)
    (admitted : Laws.Step.Admitted s request) (bodied : (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true →
      role = .multiInstanceBody) (other : ∀ body, request.continuation ≠ .multiInstance body)
    (apart : ReservedApart s request) (held : NumberedBy below program s) :
    NumberedBy below program (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  refine held.addOne (o := (s.beginOccurrence request role sourceType).2) ⟨fun x inside => ?_, begins.scopes,
    congrArg (·.multiInstances) begins.slots, begins.queues,
    congrArg (·.compensation.runs) begins.slots, fun body => begins.continued ▸ other body,
    fun run member active named role' => ?_, fun unbegun => (by rw [begins.isBegun] at unbegun; cases unbegun),
    fun request' inQueue named _ _ _ _ _ => ?_⟩
  · exact begins.mem_occurrences inside
  · rcases begins.source with ⟨reserved, source⟩ | ⟨reserved, source⟩ | fresh
    · exact apart reserved source.member source.named run member (begins.scope ▸ active)
        (source.element ▸ named) (source.role ▸ role')
    · exact apart reserved source.member source.named run member (begins.scope ▸ active)
        (source.element ▸ named) (source.role ▸ role')
    · obtain ⟨loop, looped⟩ := held.2.looped run member
      have body : role = .multiInstanceBody := bodied (by rw [← fresh.element, named, looped]; exact Option.isSome_some)
      rw [fresh.roled, body] at role'
      cases role'
  · have below : Laws.State.OccurrenceIssued s (s.beginOccurrence request role sourceType).2.id → False := fun issued =>
      by
      rcases begins.source with ⟨reserved, source⟩ | ⟨_, source⟩ | fresh
      · exact (admitted.2.1 reserved.id (by simp [Laws.State.names, source.named])).2.1 request' inQueue
          (by simp [Laws.State.names, named, source.id])
      · exact source.fresh formed.issuer stands issued
      · exact fresh.fresh formed.issuer stands issued
    exact below ((formed.claimed.named request' inQueue).2 (s.beginOccurrence request role sourceType).2.id
      (by simp [Laws.State.names, named])).1


/-- The begin of an instance taken off a queue that kept `Numbered` keeps it: the begin targets an active slot of its
body, its occurrence is fresh and numbered above every counted activation of its key, which every instance of the body
shares, every instance begun before it lies in a lower slot, and every begin still queued after it in a higher one, as
the closure takes begin signals first in, first out and deferred begins last in, first out. `nextAbove` relates every
standing activation to the running unit's next issues, which the begun one is. -/
theorem NumberedBy.beginInstance {below : Issue → Issue → Prop} {program : Program} {queue s : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {body : OccurrenceId} (formed : WellFormed program s) (owns : SlotsOwned s)
    (stands : request.scope ∈ scopeIds s) (roled : role = .element)
    (on : request.continuation = .multiInstance body) (held : NumberedBy below program queue)
    (nextAbove : ∀ o ∈ s.occurrences, ∀ index, s.issueNext ≤ index → below o.activation (.fresh s.issuing index))
    (dequeued : Laws.Step.Dequeued program queue request s) :
    NumberedBy below program (s.beginOccurrence request role sourceType).1 := by
  -- The closure took the begin off one queue under one key, leaving the other entries.
  obtain ⟨unit, found⟩ : ∃ unit, (queue.queuedSignals[unit]? = some (.begin request) ∧
      s = { queue with queuedSignals := queue.queuedSignals.erase unit }) ∨
      (queue.queuedTokens[unit]? = some (.begin request) ∧
        s = { queue with queuedTokens := queue.queuedTokens.erase unit }) := by
    rcases dequeued.queued with ⟨unit, found, same⟩ | ⟨unit, found, same⟩
    · exact ⟨unit, .inl ⟨found, same⟩⟩
    · exact ⟨unit, .inr ⟨found, same⟩⟩
  have kept : s.occurrences = queue.occurrences ∧ s.scopes = queue.scopes ∧ s.slots = queue.slots := by
    rcases found with ⟨_, same⟩ | ⟨_, same⟩ <;> subst same <;> exact ⟨rfl, rfl, rfl⟩
  have fewer : BeginsFewer queue s := by
    rcases found with ⟨_, same⟩ | ⟨_, same⟩ <;> subst same
    · exact ⟨.refl _, .refl _, fun _ _ found => (Laws.State.getElem?_of_erase found).1, fun _ _ found => found⟩
    · exact ⟨.refl _, .refl _, fun _ _ found => found, fun _ _ found => (Laws.State.getElem?_of_erase found).1⟩
  have queuedHere : Laws.State.Queued queue request := by
    rcases found with ⟨found, _⟩ | ⟨found, _⟩
    · exact .inl (Laws.State.mem_allSignals_of found)
    · exact .inr (Laws.State.mem_allQueuedTokens_of found)
  have runsSame : s.slots.multiInstances = queue.slots.multiInstances := congrArg (·.multiInstances) kept.2.2
  have heldS : NumberedBy below program s := held.shrink ⟨runsSame ▸ .refl _, fun o inside => kept.1 ▸ inside,
    fun e inside => .inl (kept.2.1 ▸ inside), fun run member outside => absurd (runsSame ▸ member) outside, fewer,
    fun _ pending => .inl (pending_of_sublist (fun signal inside => by
      rcases found with ⟨_, same⟩ | ⟨_, same⟩ <;> subst same
      · exact Laws.State.allSignals_unqueue signal inside
      · exact inside) (fun _ member => kept.2.2 ▸ member) pending)⟩
  obtain ⟨each, qs⟩ := heldS
  obtain ⟨run, runQ, owner, rest⟩ :=
    held.2.targets request queuedHere body on (by rw [Laws.State.scopeIds, ← kept.2.1]; exact stands)
  obtain ⟨element, unreserved, active⟩ := rest
  have runS : run ∈ s.slots.multiInstances := runsSame ▸ runQ
  obtain ⟨j, slotj⟩ := List.mem_iff_getElem?.mp active
  have forJ : QueuedFor run j request := ⟨on.trans (congrArg _ owner.symm), slotj⟩
  have ordered := held.2.ordered run runQ
  -- every begin still queued begins a higher slot: the closure took the first in the key order of the begins queued
  have next : ∀ request', Laws.State.Queued s request' → ∀ q, QueuedFor run q request' → j < q := by
    intro request' inQueue q for_
    rcases dequeued with ⟨unit', first, same⟩ | taken
    · -- a begin signal, the first in breadth-first order
      have here : queue.queuedSignals[unit']? = some (.begin request) := Laws.Step.firstBreadth_mem first
      subst same
      rcases inQueue with signal | token
      · rcases List.mem_append.mp signal with keyed | batch
        · obtain ⟨other, found'⟩ := Laws.State.mem_values.mp keyed
          obtain ⟨found', apart⟩ := Laws.State.getElem?_of_erase found'
          exact ordered.keyedSignals unit' other request request' j q here found' forJ for_
            (Laws.Step.firstBreadth_least first found' apart)
        · exact (ordered.apart request' request q j (.inl batch) for_ unit' (.inl here) forJ).elim
      · rcases List.mem_append.mp token with keyed | batch
        · obtain ⟨other, found'⟩ := Laws.State.mem_values.mp keyed
          exact ordered.keyedQueues unit' other request request' j q here found' forJ for_
        · exact (ordered.apart request' request q j (.inr batch) for_ unit' (.inl here) forJ).elim
    · -- a deferred begin, the last queued
      obtain ⟨none, unit', log, rest₁⟩ := taken
      obtain ⟨chosen, same⟩ := rest₁
      have here : queue.queuedTokens[unit']? = some (.begin request) := by
        rcases chosen with ⟨_, first⟩ | last
        · exact Laws.Step.earliest_mem first
        · exact Laws.Step.latest_mem last
      have last := chosen.resolve_left fun ⟨schedule, _⟩ =>
        absurd (Laws.State.mem_allQueuedTokens_of here) (held.2.deferred schedule request)
      subst same
      rcases inQueue with signal | token
      · rcases List.mem_append.mp signal with keyed | batch
        · obtain ⟨other, found'⟩ := Laws.State.mem_values.mp keyed
          have empty := Laws.Step.firstBreadth_eq_none.mp none
          have := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr found'
          rw [empty] at this
          cases this
        · exact (ordered.apart request' request q j (.inl batch) for_ unit' (.inr here) forJ).elim
      · rcases List.mem_append.mp token with keyed | batch
        · obtain ⟨other, found'⟩ := Laws.State.mem_values.mp keyed
          obtain ⟨found', apart⟩ := Laws.State.getElem?_of_erase found'
          obtain ⟨parent, a, b, rest₁⟩ :=
            ordered.keyedTokens other unit' request' request q j found' here for_ forJ
          obtain ⟨oneKey, twoKey, order⟩ := rest₁
          have before := Laws.Step.latest_greatest last found' apart
          rw [oneKey, twoKey] at before
          exact order (Laws.Step.tokenBefore_siblings before fun same => apart (by rw [oneKey, twoKey, same]))
        · exact (ordered.apart request' request q j (.inr batch) for_ unit' (.inr here) forJ).elim
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  obtain fresh : Laws.State.Issued s (s.beginOccurrence request role sourceType).1 request role
      (s.beginOccurrence request role sourceType).2 := by
    rcases begins.source with ⟨_, source⟩ | ⟨_, source⟩ | fresh
    · have named := source.named
      rw [unreserved] at named
      cases named
    · have named := source.named
      rw [unreserved] at named
      cases named
    · exact fresh
  have oOn : (s.beginOccurrence request role sourceType).2.continuation = .multiInstance run.occurrence :=
    begins.continued.trans forJ.1
  have oRole : (s.beginOccurrence request role sourceType).2.role = .element :=
    fresh.roled.trans roled
  have runOf : ∀ r ∈ s.slots.multiInstances,
      (s.beginOccurrence request role sourceType).2.continuation = .multiInstance r.occurrence → r = run :=
    fun r member same => Laws.State.nodup_map_eq owns.keyed member runS
      (Laws.Step.multiInstance_inj (same.symm.trans oOn))
  have slotOf : ∀ index, run.instances[index]? = some (.active request.scope) → index = j := fun index slot =>
    (owns.owned run runS).ownScopes index j request.scope slot slotj
  have occIn : ∀ x ∈ (s.beginOccurrence request role sourceType).1.occurrences, x ∈ s.occurrences ∨
      x = (s.beginOccurrence request role sourceType).2 := fun x inside => by
    exact begins.mem_occurrences inside
  have runsAfter : (s.beginOccurrence request role sourceType).1.slots.multiInstances = s.slots.multiInstances :=
    congrArg (·.multiInstances) begins.slots
  have queuedAfter : ∀ request', Laws.State.Queued (s.beginOccurrence request role sourceType).1 request' →
      Laws.State.Queued s request' := fun _ inQueue => (BeginsFewer.of_kept begins.queues).queued inQueue
  refine ⟨fun r member => ?_, ?_⟩
  · have rS : r ∈ s.slots.multiInstances := runsAfter ▸ member
    refine ⟨fun first second firstScope secondScope lower one two earlier earlierIn later laterIn earlierAt laterAt
      earlierOn laterOn => ?_, fun scope active' x inside at_ named role' => ?_⟩
    · rcases occIn earlier earlierIn with eOld | rfl <;> rcases occIn later laterIn with lOld | rfl
      · exact (each r rS).1 first second firstScope secondScope lower one two earlier eOld later lOld earlierAt
          laterAt earlierOn laterOn
      · -- the begun instance is the running unit's next issue
        obtain ⟨index, above, pending⟩ := fresh.activated.pending
        rw [pending]
        exact nextAbove earlier eOld index above
      · obtain rfl := runOf r rS earlierOn
        have atJ : first = j := slotOf first (by rw [one, ← earlierAt, begins.scope])
        have below := held.2.above r runQ request second j secondScope queuedHere forJ two
          ⟨later, kept.1 ▸ lOld, laterAt, laterOn⟩
        omega
      · obtain rfl := runOf r rS earlierOn
        have one' : first = j := slotOf first (by rw [one, ← earlierAt, begins.scope])
        have two' : second = j := slotOf second (by rw [two, ← laterAt, begins.scope])
        omega
    · rcases occIn x inside with old | rfl
      · exact (each r rS).2 scope active' x old at_ named role'
      · have here : Iteration.active request.scope ∈ r.instances := by rw [← begins.scope, at_]; exact active'
        obtain rfl := slot_run formed owns rS runS here active
        exact oOn
  exact {
    looped := fun r member => qs.looped r (runsAfter ▸ member)
    uncalled := fun r member scope active' entry inside =>
      qs.uncalled r (runsAfter ▸ member) scope active' entry (begins.scopes ▸ inside)
    continued := fun r member x inside xOn active' => by
      rcases occIn x inside with old | rfl
      · exact qs.continued r (runsAfter ▸ member) x old xOn active'
      · obtain rfl := runOf r (runsAfter ▸ member) xOn
        exact ⟨fresh.element.trans element, oRole⟩
    targets := fun request' inQueue body' on' stands' => by
      obtain ⟨r, member, rest⟩ := qs.targets request' (queuedAfter request' inQueue) body' on'
        (by rw [Laws.State.scopeIds, ← begins.scopes]; exact stands')
      exact ⟨r, runsAfter ▸ member, rest⟩
    reserved := fun request' inQueue r member active' id named x inside xid xelement xrole => by
      rcases occIn x inside with old | rfl
      · exact qs.reserved request' (queuedAfter request' inQueue) r (runsAfter ▸ member) active' id named x old xid
          xelement xrole
      · have below := ((formed.claimed.named request' (queuedAfter request' inQueue)).2 id
          (by simp [Laws.State.names, named])).1
        rw [← xid] at below
        exact fresh.fresh formed.issuer stands below
    reservations := fun x inside unbegun => by
      rcases occIn x inside with old | rfl
      · exact qs.reservations x old unbegun
      · rw [begins.isBegun] at unbegun
        cases unbegun
    occurs := fun element' pending =>
      qs.occurs element' (pending_kept begins.queues (congrArg (·.compensation.runs) begins.slots) pending)
    ordered := fun r member => ordered_fewer (qs.ordered r (runsAfter ▸ member)) (.of_kept begins.queues) fun _ _ queued => queued
    deferred := fun schedule request' token => qs.deferred schedule request' (begins.queues.token_mem _ token)
    above := fun r member request' index q scope inQueue for_ slot begun => by
      obtain ⟨x, inside, at_, xOn⟩ := begun
      rcases occIn x inside with old | rfl
      · exact qs.above r (runsAfter ▸ member) request' index q scope (queuedAfter request' inQueue) for_ slot
          ⟨x, old, at_, xOn⟩
      · obtain rfl := runOf r (runsAfter ▸ member) xOn
        rw [slotOf index (by rw [slot, ← at_, begins.scope])]
        exact next request' (queuedAfter request' inQueue) q for_ }

end Kernel.Proofs.MultiInstance
