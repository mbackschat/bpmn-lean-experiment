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
open Kernel.Laws.MultiInstance (LoopOf IdsUnique OccurPending NumberedInOrder InstancesPlaced BeginsQueued
  QueuedFor Owned BodyOwns InstancesUnowned RunsKeyed)

/-! ## The relation -/

/-- The numbering of every running body's instances, their identity, and the order of the instance begins still
queued. -/
def Numbered (program : Program) (s : State) : Prop :=
  (∀ run ∈ s.slots.multiInstances, NumberedInOrder s run ∧ InstancesPlaced s run) ∧ BeginsQueued program s

/-! ## Taking away -/

/-- A request queued in `t` was queued in `s` when `t`'s queued begins are among `s`'s. -/
theorem queued_of_sublist {s t : State} (begins : (Laws.Step.beginsOf t.signals).Sublist (Laws.Step.beginsOf s.signals))
    (deferred : (Laws.Step.deferredOf t.tokens).Sublist (Laws.Step.deferredOf s.tokens)) {request : BeginRequest}
    (queued : Laws.State.Queued t request) : Laws.State.Queued s request := by
  rcases queued with signal | token
  · exact .inl (Laws.Step.mem_beginsOf.mp (begins.subset (Laws.Step.mem_beginsOf.mpr signal)))
  · exact .inr (Laws.Step.mem_deferredOf.mp (deferred.subset (Laws.Step.mem_deferredOf.mpr token)))

/-- Begin requests queued as signals of a sublist lie among the queued begins in the same order. -/
theorem beginsOf_sublist {small large : List Signal} (sub : small.Sublist large) :
    (Laws.Step.beginsOf small).Sublist (Laws.Step.beginsOf large) :=
  Laws.Step.sublist_beginsOf.mp ((Laws.Step.sublist_beginsOf.mpr (.refl _)).trans sub)

/-- Deferred begins of a sublist lie among the deferred begins in the same order. -/
theorem deferredOf_sublist {small large : List Token} (sub : small.Sublist large) :
    (Laws.Step.deferredOf small).Sublist (Laws.Step.deferredOf large) :=
  Laws.Step.sublist_deferredOf.mp ((Laws.Step.sublist_deferredOf.mpr (.refl _)).trans sub)

/-- A reservation pending in a state whose queued signals are among `s`'s, with `s`'s compensation runs, is pending in
`s`. -/
theorem pending_of_sublist {s t : State} (signals : t.signals.Sublist s.signals)
    (runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs) {element : ElementId}
    (pending : OccurPending t element) : OccurPending s element := by
  rcases pending with occur | compensate | resumed
  · obtain ⟨scope, rest⟩ := occur
    obtain ⟨leave, writes, rule, member⟩ := rest
    exact .inl ⟨scope, leave, writes, rule, signals.subset member⟩
  · obtain ⟨scope, activity, trigger, rest⟩ := compensate
    obtain ⟨leave, at_, resumed, member⟩ := rest
    exact .inr (.inl ⟨scope, activity, trigger, leave, at_, resumed, signals.subset member⟩)
  · obtain ⟨run, member, rest⟩ := resumed
    exact .inr (.inr ⟨run, runs run member, rest⟩)

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
  begins : (Laws.Step.beginsOf t.signals).Sublist (Laws.Step.beginsOf s.signals)
  deferred : (Laws.Step.deferredOf t.tokens).Sublist (Laws.Step.deferredOf s.tokens)
  pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop

/-- What `Shrinks` keeps. -/
theorem Numbered.shrink {program : Program} {s t : State} (held : Numbered program s) (shrinks : Shrinks program s t) :
    Numbered program t := by
  obtain ⟨each, queued⟩ := held
  have runIn : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances := fun _ member =>
    shrinks.runs.subset member
  have queuedIn : ∀ request, Laws.State.Queued t request → Laws.State.Queued s request := fun _ inQueue =>
    queued_of_sublist shrinks.begins shrinks.deferred inQueue
  have signalsIn : ∀ first second, Laws.State.Precedes t.signals (.begin first) (.begin second) →
      Laws.State.Precedes s.signals (.begin first) (.begin second) := fun _ _ precedes =>
    Laws.Step.precedes_beginsOf.mpr ((Laws.Step.precedes_beginsOf.mp precedes).trans shrinks.begins)
  have tokensIn : ∀ first second, Laws.State.Precedes t.tokens (.begin first) (.begin second) →
      Laws.State.Precedes s.tokens (.begin first) (.begin second) := fun _ _ precedes =>
    Laws.Step.precedes_deferredOf.mpr ((Laws.Step.precedes_deferredOf.mp precedes).trans shrinks.deferred)
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
    signalsOrdered := fun run member first second first' second' precedes =>
      queued.signalsOrdered run (runIn run member) first second first' second' (signalsIn first second precedes)
    tokensOrdered := fun run member first second first' second' precedes =>
      queued.tokensOrdered run (runIn run member) first second first' second' (tokensIn first second precedes)
    queuesOrdered := fun run member first second first' second' signal token =>
      queued.queuesOrdered run (runIn run member) first second first' second'
        (Laws.Step.mem_beginsOf.mp (shrinks.begins.subset (Laws.Step.mem_beginsOf.mpr signal)))
        (Laws.Step.mem_deferredOf.mp (shrinks.deferred.subset (Laws.Step.mem_deferredOf.mpr token)))
    deferred := fun schedule request token => queued.deferred schedule request
      (Laws.Step.mem_deferredOf.mp (shrinks.deferred.subset (Laws.Step.mem_deferredOf.mpr token)))
    above := fun run member request index queued' scope inQueue for_ slot begun => by
      obtain ⟨o, inside, rest⟩ := begun
      exact queued.above run (runIn run member) request index queued' scope (queuedIn request inQueue) for_ slot
        ⟨o, shrinks.occurrences o inside, rest⟩ }

/-- `Laws.State.Queued` reads only the queued signals and the work stack. -/
theorem queued_congr {s t : State} (signals : t.signals = s.signals) (tokens : t.tokens = s.tokens)
    {request : BeginRequest} : Laws.State.Queued t request ↔ Laws.State.Queued s request := by
  unfold Laws.State.Queued
  rw [signals, tokens]

/-- `OccurPending` reads only the queued signals and the compensation runs. -/
theorem pending_congr {s t : State} (signals : t.signals = s.signals)
    (runs : t.slots.compensation.runs = s.slots.compensation.runs) {element : ElementId} :
    OccurPending t element ↔ OccurPending s element := by
  unfold OccurPending
  rw [signals, runs]

/-- What `t` keeps of what `Numbered` reads of `s` when it relabels occurrences: each occurrence of `t` has one in `s`
of its identity, element, scope occurrence, activation, role and continuation, unbegun only if that one is, and nothing
else `Numbered` reads moves. -/
structure Relabels (s t : State) : Prop where
  occurrences : ∀ x ∈ t.occurrences, ∃ y ∈ s.occurrences, x.id = y.id ∧ x.element = y.element ∧ x.scope = y.scope ∧
    x.activation = y.activation ∧ x.role = y.role ∧ x.continuation = y.continuation ∧ (x.begun = false → y.begun = false)
  scopes : t.scopes = s.scopes
  runs : t.slots.multiInstances = s.slots.multiInstances
  signals : t.signals = s.signals
  tokens : t.tokens = s.tokens
  compensation : t.slots.compensation.runs = s.slots.compensation.runs

/-- What `Relabels` keeps. -/
theorem Numbered.relabel {program : Program} {s t : State} (held : Numbered program s) (relabels : Relabels s t) :
    Numbered program t := by
  obtain ⟨each, queued⟩ := held
  have runIn : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances := fun _ member => relabels.runs ▸ member
  have queuedIn : ∀ request, Laws.State.Queued t request → Laws.State.Queued s request := fun _ inQueue =>
    (queued_congr relabels.signals relabels.tokens).mp inQueue
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
      queued.occurs element ((pending_congr relabels.signals relabels.compensation).mp pending)
    signalsOrdered := fun run member first second first' second' precedes =>
      queued.signalsOrdered run (runIn run member) first second first' second' (relabels.signals ▸ precedes)
    tokensOrdered := fun run member first second first' second' precedes =>
      queued.tokensOrdered run (runIn run member) first second first' second' (relabels.tokens ▸ precedes)
    queuesOrdered := fun run member first second first' second' signal token =>
      queued.queuesOrdered run (runIn run member) first second first' second' (relabels.signals ▸ signal)
        (relabels.tokens ▸ token)
    deferred := fun schedule request token => queued.deferred schedule request (relabels.tokens ▸ token)
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
  signals : t.signals = s.signals
  tokens : t.tokens = s.tokens
  compensation : t.slots.compensation.runs = s.slots.compensation.runs
  continued : ∀ body, o.continuation ≠ .multiInstance body
  placed : ∀ run ∈ s.slots.multiInstances, Iteration.active o.scope ∈ run.instances → o.element = run.element →
    o.role ≠ .element
  reservation : o.begun = false → o.continuation = .flow
  unnamed : ∀ request, Laws.State.Queued s request → request.reserved = some o.id → ∀ run ∈ s.slots.multiInstances,
    Iteration.active request.scope ∈ run.instances → o.element = run.element → o.role = .element → False

/-- What `AddsOne` keeps. -/
theorem Numbered.addOne {program : Program} {s t : State} {o : Occurrence} (held : Numbered program s)
    (adds : AddsOne s t o) : Numbered program t := by
  obtain ⟨each, queued⟩ := held
  have runIn : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances := fun _ member => adds.runs ▸ member
  have queuedIn : ∀ request, Laws.State.Queued t request → Laws.State.Queued s request := fun _ inQueue =>
    (queued_congr adds.signals adds.tokens).mp inQueue
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
      queued.occurs element ((pending_congr adds.signals adds.compensation).mp pending)
    signalsOrdered := fun run member first second first' second' precedes =>
      queued.signalsOrdered run (runIn run member) first second first' second' (adds.signals ▸ precedes)
    tokensOrdered := fun run member first second first' second' precedes =>
      queued.tokensOrdered run (runIn run member) first second first' second' (adds.tokens ▸ precedes)
    queuesOrdered := fun run member first second first' second' signal token =>
      queued.queuesOrdered run (runIn run member) first second first' second' (adds.signals ▸ signal)
        (adds.tokens ▸ token)
    deferred := fun schedule request token => queued.deferred schedule request (adds.tokens ▸ token)
    above := fun run member request index queued' scope inQueue for_ slot begun => by
      obtain ⟨x, inside, at_, on⟩ := begun
      exact queued.above run (runIn run member) request index queued' scope (queuedIn request inQueue) for_ slot
        ⟨x, instanceIn x inside _ on, at_, on⟩ }

/-- A reservation of an element that does not loop, in a scope occurrence that stands, keeps `Numbered`. -/
theorem Numbered.reserve {program : Program} {s : State} {element : ElementId} {scope : ScopeOccurrenceId}
    (formed : WellFormed program s) (stands : scope ∈ scopeIds s) (unlooped : ∀ loop, ¬ LoopOf program element loop)
    (held : Numbered program s) : Numbered program (s.reserve element scope).1 := by
  have reserves := Laws.State.reserve_reserves s element scope
  have unnamed := (reserves.wellFormed formed stands).2
  refine held.addOne (o := (s.reserve element scope).2) ⟨fun x inside => ?_, reserves.scopes,
    congrArg (·.multiInstances) reserves.slots, reserves.signals, reserves.tokens,
    congrArg (·.compensation.runs) reserves.slots, fun body same => ?_, fun run member _ named _ => ?_,
    fun _ => reserves.continued, fun request inQueue named _ _ _ _ _ => ?_⟩
  · rw [reserves.occurrences] at inside
    rcases List.mem_append.mp inside with old | new
    · exact .inl old
    · exact .inr (List.mem_singleton.mp new)
  · rw [reserves.continued] at same
    exact Laws.Step.flow_ne_multiInstance body same
  · obtain ⟨loop, looped⟩ := held.2.looped run member
    rw [reserves.kind] at named
    exact unlooped loop (named ▸ looped)
  · exact unnamed request ((queued_congr reserves.signals reserves.tokens).mpr inQueue)
      (by simp [Laws.State.names, named])

/-- Starting a reservation in place keeps `Numbered`. -/
theorem Numbered.startReserved {program : Program} {s : State} {occurrence : Occurrence} (sourceType : String)
    (held : Numbered program s) (member : occurrence ∈ s.occurrences) :
    Numbered program (s.startReserved occurrence sourceType).1 := by
  cases begun : occurrence.begun
  · have starts := Laws.State.startReserved_starts s sourceType begun
    refine held.relabel ⟨fun x inside => ?_, starts.scopes, congrArg (·.multiInstances) starts.slots, starts.signals,
      starts.tokens, congrArg (·.compensation.runs) starts.slots⟩
    rw [starts.occurrences] at inside
    obtain ⟨y, yIn, made⟩ := List.mem_map.mp inside
    by_cases same : y.id = occurrence.id
    · simp only [same, ↓reduceIte] at made
      subst made
      exact ⟨occurrence, member, rfl, rfl, rfl, rfl, rfl, rfl, fun none => by simp at none⟩
    · simp only [same, ↓reduceIte] at made
      subst made
      exact ⟨y, yIn, rfl, rfl, rfl, rfl, rfl, rfl, id⟩
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
theorem roleOf_instance {program : Program} {request : BeginRequest} {body : Nat}
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
theorem Numbered.beginOther {program : Program} {s : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} (formed : WellFormed program s) (admitted : Laws.Step.Admitted s request)
    (bodied : (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true →
      role = .multiInstanceBody) (other : ∀ body, request.continuation ≠ .multiInstance body)
    (apart : ReservedApart s request) (held : Numbered program s) :
    Numbered program (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  refine held.addOne (o := (s.beginOccurrence request role sourceType).2) ⟨fun x inside => ?_, begins.scopes,
    congrArg (·.multiInstances) begins.slots, begins.signals, begins.tokens,
    congrArg (·.compensation.runs) begins.slots, fun body => begins.continued ▸ other body,
    fun run member active named role' => ?_, fun unbegun => (by rw [begins.isBegun] at unbegun; cases unbegun),
    fun request' inQueue named _ _ _ _ _ => ?_⟩
  · rw [begins.occurrences] at inside
    rcases List.mem_append.mp inside with old | new
    · exact .inl (List.mem_filter.mp old).1
    · exact .inr (List.mem_singleton.mp new)
  · rcases begins.source with ⟨reserved, source⟩ | fresh
    · exact apart reserved source.member source.named run member (begins.scope ▸ active)
        (source.element ▸ named) (source.role ▸ role')
    · obtain ⟨loop, looped⟩ := held.2.looped run member
      have body : role = .multiInstanceBody := bodied (by rw [← fresh.element, named, looped]; exact Option.isSome_some)
      rw [fresh.roled, body] at role'
      cases role'
  · rcases begins.source with ⟨reserved, source⟩ | fresh
    · exact (admitted.2.1 reserved.id (by simp [Laws.State.names, source.named])).2.1 request' inQueue
        (by simp [Laws.State.names, named, source.id])
    · have below := ((formed.claimed.named request' inQueue).2 (s.beginOccurrence request role sourceType).2.id
        (by simp [Laws.State.names, named])).1
      rw [fresh.id] at below
      exact Nat.lt_irrefl _ below


/-- The begin of an instance taken off a queue that kept `Numbered` keeps it: the begin targets an active slot of its
body, its occurrence is fresh and numbered above every counted activation of its key, which every instance of the body
shares, every instance begun before it lies in a lower slot, and every begin still queued after it in a higher one, as
the closure takes begin signals first in, first out and deferred begins last in, first out. -/
theorem Numbered.beginInstance {program : Program} {queue s : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} {body : Nat} (formed : WellFormed program s) (owns : SlotsOwned s)
    (stands : request.scope ∈ scopeIds s) (roled : role = .element)
    (on : request.continuation = .multiInstance body) (held : Numbered program queue)
    (dequeued : Laws.Step.Dequeued program queue request s) :
    Numbered program (s.beginOccurrence request role sourceType).1 := by
  have kept : s.occurrences = queue.occurrences ∧ s.scopes = queue.scopes ∧ s.slots = queue.slots := by
    rcases dequeued with ⟨_, _, popped⟩ | ⟨_, _, _, popped⟩ <;> subst popped <;> exact ⟨.refl _, .refl _, .refl _⟩
  have queues : s.signals.Sublist queue.signals ∧ s.tokens.Sublist queue.tokens := by
    rcases dequeued with ⟨rest, head, popped⟩ | ⟨_, rest, shape, popped⟩ <;> subst popped
    · exact ⟨head ▸ List.sublist_cons_self _ _, .refl _⟩
    · refine ⟨.refl _, ?_⟩
      rcases shape with ⟨_, tokens⟩ | tokens
      · exact tokens ▸ List.sublist_cons_self _ _
      · exact tokens ▸ List.sublist_append_left _ _
  have queuedHere : Laws.State.Queued queue request := by
    rcases dequeued with ⟨_, head, _⟩ | ⟨_, _, shape, _⟩
    · exact .inl (head ▸ List.mem_cons_self ..)
    · rcases shape with ⟨_, tokens⟩ | tokens
      · exact .inr (tokens ▸ List.mem_cons_self ..)
      · exact .inr (tokens ▸ List.mem_append_right _ (List.mem_singleton_self _))
  have runsSame : s.slots.multiInstances = queue.slots.multiInstances := congrArg (·.multiInstances) kept.2.2
  have heldS : Numbered program s := held.shrink ⟨runsSame ▸ .refl _, fun o inside => kept.1 ▸ inside,
    fun e inside => .inl (kept.2.1 ▸ inside), fun run member outside => absurd (runsSame ▸ member) outside,
    beginsOf_sublist queues.1, deferredOf_sublist queues.2,
    fun _ pending => .inl (pending_of_sublist queues.1 (fun _ member => kept.2.2 ▸ member) pending)⟩
  obtain ⟨each, qs⟩ := heldS
  obtain ⟨run, runQ, owner, rest⟩ :=
    held.2.targets request queuedHere body on (by rw [Laws.State.scopeIds, ← kept.2.1]; exact stands)
  obtain ⟨element, unreserved, active⟩ := rest
  have runS : run ∈ s.slots.multiInstances := runsSame ▸ runQ
  obtain ⟨j, slotj⟩ := List.mem_iff_getElem?.mp active
  have forJ : QueuedFor run j request := ⟨on.trans (congrArg _ owner.symm), slotj⟩
  -- every begin still queued begins a higher slot
  have next : ∀ request', Laws.State.Queued s request' → ∀ q, QueuedFor run q request' → j < q := by
    intro request' inQueue q for_
    rcases dequeued with ⟨rest, head, popped⟩ | ⟨empty, rest, shape, popped⟩ <;> subst popped
    · rcases inQueue with signal | token
      · exact held.2.signalsOrdered run runQ request request' j q
          (by rw [head]; exact List.Sublist.cons_cons _ (List.singleton_sublist.mpr signal)) forJ for_
      · exact held.2.queuesOrdered run runQ request request' j q (by rw [head]; exact List.mem_cons_self ..) token
          forJ for_
    · rcases inQueue with signal | token
      · rw [empty] at signal
        cases signal
      · rcases shape with ⟨schedule, tokens⟩ | tokens
        · exact absurd (by rw [tokens]; exact List.mem_cons_self ..) (held.2.deferred schedule request)
        · exact held.2.tokensOrdered run runQ request' request q j
            (by rw [tokens]; exact (List.singleton_sublist.mpr token).append (List.Sublist.refl [_])) for_ forJ
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  obtain fresh : Laws.State.Issued s (s.beginOccurrence request role sourceType).1 request role
      (s.beginOccurrence request role sourceType).2 := by
    rcases begins.source with ⟨_, source⟩ | fresh
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
    rw [begins.occurrences] at inside
    rcases List.mem_append.mp inside with old | new
    · exact .inl (List.mem_filter.mp old).1
    · exact .inr (List.mem_singleton.mp new)
  have runsAfter : (s.beginOccurrence request role sourceType).1.slots.multiInstances = s.slots.multiInstances :=
    congrArg (·.multiInstances) begins.slots
  have queuedAfter : ∀ request', Laws.State.Queued (s.beginOccurrence request role sourceType).1 request' →
      Laws.State.Queued s request' := fun _ inQueue => (queued_congr begins.signals begins.tokens).mp inQueue
  refine ⟨fun r member => ?_, ?_⟩
  · have rS : r ∈ s.slots.multiInstances := runsAfter ▸ member
    refine ⟨fun first second firstScope secondScope lower one two earlier earlierIn later laterIn earlierAt laterAt
      earlierOn laterOn => ?_, fun scope active' x inside at_ named role' => ?_⟩
    · rcases occIn earlier earlierIn with eOld | rfl <;> rcases occIn later laterIn with lOld | rfl
      · exact (each r rS).1 first second firstScope secondScope lower one two earlier eOld later lOld earlierAt
          laterAt earlierOn laterOn
      · obtain rfl := runOf r rS laterOn
        have atJ : second = j := slotOf second (by rw [two, ← laterAt, begins.scope])
        obtain ⟨count, counted, inst, rest⟩ := formed.occurrencesCounted earlier eOld
        obtain ⟨named', roled', below⟩ := rest
        have continued := qs.continued r rS earlier eOld earlierOn (earlierAt ▸ List.mem_of_getElem? one)
        refine Nat.lt_of_le_of_lt below (fresh.activated.above count counted ?_ ?_ ?_)
        · rw [inst]
          change s.instanceOf earlier.scope = s.instanceOf request.scope
          rw [earlierAt, slot_instance formed owns qs rS one, slot_instance formed owns qs rS slotj]
        · exact named'.trans (continued.1.trans element.symm)
        · exact roled'.trans (continued.2.trans roled.symm)
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
        rw [← xid, fresh.id] at below
        exact Nat.lt_irrefl _ below
    reservations := fun x inside unbegun => by
      rcases occIn x inside with old | rfl
      · exact qs.reservations x old unbegun
      · rw [begins.isBegun] at unbegun
        cases unbegun
    occurs := fun element' pending =>
      qs.occurs element' ((pending_congr begins.signals (congrArg (·.compensation.runs) begins.slots)).mp pending)
    signalsOrdered := fun r member first second first' second' precedes =>
      qs.signalsOrdered r (runsAfter ▸ member) first second first' second' (begins.signals ▸ precedes)
    tokensOrdered := fun r member first second first' second' precedes =>
      qs.tokensOrdered r (runsAfter ▸ member) first second first' second' (begins.tokens ▸ precedes)
    queuesOrdered := fun r member first second first' second' signal token =>
      qs.queuesOrdered r (runsAfter ▸ member) first second first' second' (begins.signals ▸ signal)
        (begins.tokens ▸ token)
    deferred := fun schedule request' token => qs.deferred schedule request' (begins.tokens ▸ token)
    above := fun r member request' index q scope inQueue for_ slot begun => by
      obtain ⟨x, inside, at_, xOn⟩ := begun
      rcases occIn x inside with old | rfl
      · exact qs.above r (runsAfter ▸ member) request' index q scope (queuedAfter request' inQueue) for_ slot
          ⟨x, old, at_, xOn⟩
      · obtain rfl := runOf r (runsAfter ▸ member) xOn
        rw [slotOf index (by rw [slot, ← at_, begins.scope])]
        exact next request' (queuedAfter request' inQueue) q for_ }

/-! ## The frame -/

/-- A change that keeps everything `Numbered` reads but the scope occurrences, which it only takes away from, and the
pending reservations, which it adds to only with elements that do not loop, `Shrinks`. -/
theorem Shrinks.same {program : Program} {s t : State} (occurrences : t.occurrences = s.occurrences)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes) (runs : t.slots.multiInstances = s.slots.multiInstances)
    (signals : t.signals = s.signals) (tokens : t.tokens = s.tokens)
    (pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop) :
    Shrinks program s t :=
  ⟨runs ▸ .refl _, fun _ inside => occurrences ▸ inside, fun entry inside => .inl (scopes entry inside), fun _ member outside => absurd (runs ▸ member) outside,
    signals ▸ .refl _, tokens ▸ .refl _, pending⟩

/-- An active instance's scope occurrence of a body whose scope occurrence lies within `scope` lies strictly within it:
it lies directly below the body's, which no scope occurrence below it holds. -/
theorem slot_strictly {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    {run : MultiInstanceRun} (member : run ∈ s.slots.multiInstances) {scope : ScopeOccurrenceId}
    (within : Laws.State.Within s run.scope scope) {inner : ScopeOccurrenceId} (active : Iteration.active inner ∈ run.instances) :
    Laws.State.StrictlyWithin s inner scope := by
  obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
  obtain ⟨e, eIn, eNamed, eLink⟩ := (owns.owned run member).instanceScopes index inner slot
  subst eNamed
  exact ⟨.parent e run.scope scope eIn eLink within, fun same =>
    Laws.State.parent_not_within formed eIn eLink (same ▸ within)⟩

/-- Clearing a scope occurrence that stands keeps `Numbered`: a body that goes lies within it, so its instances' scope
occurrences go too. -/
theorem Numbered.clearInside {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (keep : List Nat) (held : Numbered program s) :
    Numbered program (s.clearInside scope keep) := by
  have cleared := Laws.State.clearInside_cleared formed present keep
  refine held.shrink ⟨by rw [cleared.bodies]; exact List.filter_sublist,
    fun o inside => ((cleared.occurrences o).mp inside).1, fun e inside => .inl ((cleared.scopes e).mp inside).1,
    fun run member outside inner active stands => ?_, by rw [cleared.signals]; exact .refl _, deferredOf_sublist cleared.tokensSublist,
    fun _ pending => .inl (pending_of_sublist (by rw [cleared.signals]; exact .refl _) cleared.slots.runs pending)⟩
  obtain ⟨e, eIn, eNamed⟩ := List.mem_map.mp stands
  obtain ⟨_, notWithin⟩ := (cleared.scopes e).mp eIn
  have within : Laws.State.Within s run.scope scope := by
    rw [cleared.bodies] at outside
    have contained : (s.subtree scope).contains run.scope = true := Classical.byContradiction fun other =>
      outside (List.mem_filter.mpr ⟨member, by simpa using other⟩)
    exact (Laws.State.subtree_iff formed present _).mp (by simpa using contained)
  exact notWithin (eNamed ▸ slot_strictly formed owns member within active)

/-- Leaving a scope occurrence that stands keeps `Numbered`, as clearing it does. -/
theorem Numbered.leaveScope {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (held : Numbered program s) :
    Numbered program (s.leaveScope scope) := by
  have left := Laws.State.leaveScope_left formed present
  have cleared := Laws.State.clearInside_cleared formed present []
  obtain ⟨_, bodies, _⟩ := Laws.State.leaveScope_slots s scope
  refine held.shrink ⟨by rw [bodies, cleared.bodies]; exact List.filter_sublist,
    fun o inside => ((left.occurrences o).mp inside).1, fun e inside => .inl ((left.scopes e).mp inside).1,
    fun run member outside inner active stands => ?_, by rw [left.signals]; exact .refl _, deferredOf_sublist left.tokensSublist,
    fun _ pending => .inl (pending_of_sublist (by rw [left.signals]; exact .refl _) left.slots.runs pending)⟩
  obtain ⟨e, eIn, eNamed⟩ := List.mem_map.mp stands
  obtain ⟨_, notWithin⟩ := (left.scopes e).mp eIn
  have within : Laws.State.Within s run.scope scope := by
    rw [bodies, cleared.bodies] at outside
    have contained : (s.subtree scope).contains run.scope = true := Classical.byContradiction fun other =>
      outside (List.mem_filter.mpr ⟨member, by simpa using other⟩)
    exact (Laws.State.subtree_iff formed present _).mp (by simpa using contained)
  exact notWithin (eNamed ▸ (slot_strictly formed owns member within active).1)

/-- Disarming a host keeps `Numbered`: it drops only reservations. -/
theorem Numbered.disarm {program : Program} {s : State} (host : Nat) (held : Numbered program s) :
    Numbered program (s.disarm host) := by
  rw [Laws.State.disarm_eq]
  exact held.shrink ⟨.refl _, fun _ inside => (List.mem_filter.mp inside).1, fun _ inside => .inl inside,
    fun _ _ outside => absurd ‹_› outside, .refl _, .refl _, fun _ pending => .inl pending⟩

/-- Dropping an occurrence's record keeps `Numbered`. -/
theorem Numbered.withoutRecord {program : Program} {s : State} (id : Nat) (held : Numbered program s) :
    Numbered program (Laws.State.withoutRecord s id) :=
  held.shrink ⟨.refl _, fun _ inside => (List.mem_filter.mp inside).1, fun _ inside => .inl inside,
    fun _ _ outside => absurd ‹_› outside, .refl _, .refl _, fun _ pending => .inl pending⟩

/-- A variable write keeps `Numbered`. -/
theorem Numbered.setVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (value : Value) (held : Numbered program s) : Numbered program (s.setVariable target name value) :=
  have same := Laws.State.setVariable_same s target name value
  held.shrink (.same same.occurrences (fun _ inside => same.scopes ▸ inside) (congrArg (·.multiInstances) same.slots)
    same.signals same.tokens fun _ pending => .inl ((pending_congr same.signals
      (congrArg (·.compensation.runs) same.slots)).mp pending))

/-- A variable removal keeps `Numbered`. -/
theorem Numbered.removeVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (held : Numbered program s) : Numbered program (s.removeVariable target name) :=
  have same := Laws.State.removeVariable_same s target name
  held.shrink (.same same.occurrences (fun _ inside => same.scopes ▸ inside) (congrArg (·.multiInstances) same.slots)
    same.signals same.tokens fun _ pending => .inl ((pending_congr same.signals
      (congrArg (·.compensation.runs) same.slots)).mp pending))

/-- Issuing an identity keeps `Numbered`. -/
theorem Numbered.issue {program : Program} {s : State} (held : Numbered program s) : Numbered program s.issue.1 := by
  rw [Laws.State.issue_eq]
  exact held.shrink (.same (.refl _) (fun _ inside => inside) (.refl _) (.refl _) (.refl _)
    fun _ pending => .inl pending)

/-- A change that moves nothing `Numbered` reads but the queued signals and tokens, keeping the begins among them, and
adds only reservations pending of elements that do not loop keeps `Numbered`. -/
theorem Numbered.unmoved {program : Program} {s t : State} (held : Numbered program s)
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences)
    (runs : t.slots.multiInstances = s.slots.multiInstances)
    (begins : Laws.Step.beginsOf t.signals = Laws.Step.beginsOf s.signals)
    (deferred : Laws.Step.deferredOf t.tokens = Laws.Step.deferredOf s.tokens)
    (pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop) :
    Numbered program t :=
  held.shrink ⟨runs ▸ .refl _, fun _ inside => occurrences ▸ inside, fun _ inside => .inl (scopes ▸ inside),
    fun _ _ outside => absurd (runs ▸ ‹_›) outside, begins ▸ .refl _, deferred ▸ .refl _, pending⟩

/-- Entering a scope occurrence under the identity counter keeps `Numbered`: no active instance and no queued begin
names the fresh identity, each issued below the counter. -/
theorem Numbered.enter {program : Program} {s t : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    (held : Numbered program s) (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ entry.id = ⟨s.nextIssue⟩)
    (occurrences : t.occurrences = s.occurrences) (runs : t.slots.multiInstances = s.slots.multiInstances)
    (signals : t.signals = s.signals) (tokens : t.tokens = s.tokens)
    (compensation : t.slots.compensation.runs = s.slots.compensation.runs) : Numbered program t := by
  refine held.shrink ⟨runs ▸ .refl _, fun _ inside => occurrences ▸ inside, fun entry inside => ?_,
    fun _ _ outside => absurd (runs ▸ ‹_›) outside, signals ▸ .refl _, tokens ▸ .refl _,
    fun _ pending => .inl ((pending_congr signals compensation).mp pending)⟩
  refine (scopes entry inside).imp_right fun fresh => ⟨fun run member active => ?_, fun request inQueue named => ?_⟩
  · obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
    obtain ⟨placed, placedIn, placedNamed, _⟩ := (owns.owned run member).instanceScopes index entry.id slot
    have below := formed.issued.scopes placed placedIn
    rw [placedNamed, fresh] at below
    exact Nat.lt_irrefl _ below
  · have below := formed.claimed.scopesIssued request inQueue
    rw [named, fresh] at below
    exact Nat.lt_irrefl _ below

/-- Entering a scope occurrence keeps `Numbered`. -/
theorem Numbered.enterScope {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    (element : ElementId) (parent : ScopeOccurrenceId) (locals : List (String × Value)) (owner : Option Nat)
    (held : Numbered program s) : Numbered program (s.enterScope element parent locals owner).1 := by
  rw [Laws.State.enterScope_eq]
  exact held.enter formed owns (fun entry inside => (List.mem_append.mp inside).imp_right fun new => by
    rw [List.mem_singleton.mp new]) rfl rfl rfl rfl rfl

/-- Entering a Call's called root keeps `Numbered`. -/
theorem Numbered.enterCalled {program : Program} {s : State} (formed : WellFormed program s) (owns : SlotsOwned s)
    (called : Program) (call : Occurrence) (variables : List (String × Value)) (definition : DefinitionRef)
    (held : Numbered program s) : Numbered program (s.enterCalled called call variables definition).1 := by
  have fresh : ∀ entry ∈ s.scopes, entry.id ≠ ⟨s.nextIssue⟩ := fun entry inside same => by
    have below := formed.issued.scopes entry inside
    rw [same] at below
    exact Nat.lt_irrefl _ below
  rw [Laws.State.enterCalled_eq _ _ _ _ _ fresh]
  exact held.enter formed owns (fun entry inside => (List.mem_append.mp inside).imp_right fun new => by
    rw [List.mem_singleton.mp new]) rfl rfl rfl rfl rfl

/-- A pair in order in a list with `last` appended was in order before, or ends at `last`. -/
theorem precedes_append {α : Type} {l : List α} {last first second : α}
    (precedes : Laws.State.Precedes (l ++ [last]) first second) :
    Laws.State.Precedes l first second ∨ second = last := by
  obtain ⟨front, back, rest⟩ := List.sublist_append_iff.mp precedes
  obtain ⟨split, frontIn, backIn⟩ := rest
  rcases List.sublist_cons_iff.mp backIn with empty | ⟨rest, rfl, restIn⟩
  · rw [List.sublist_nil.mp empty, List.append_nil] at split
    exact .inl (by rw [Laws.State.Precedes, split]; exact frontIn)
  · rw [List.sublist_nil.mp restIn] at split
    have reversed := congrArg List.reverse split
    simp only [List.reverse_cons, List.reverse_nil, List.nil_append, List.reverse_append, List.cons_append]
      at reversed
    exact .inr (List.cons.inj reversed).1

/-- Queuing the begin of a request that begins no instance keeps `Numbered` when a reservation it names lies in a
scope occurrence some occurrence owns, which no active instance's is (`InstancesUnowned`). -/
theorem Numbered.signalBegin {program : Program} {s : State} {request : BeginRequest} (owns : SlotsOwned s)
    (other : ∀ body, request.continuation ≠ .multiInstance body)
    (owned : ∀ id, request.reserved = some id → ∃ entry ∈ s.scopes, entry.id = request.scope ∧ entry.occurrence.isSome)
    (held : Numbered program s) : Numbered program (s.signal (.begin request)) := by
  obtain ⟨each, queued⟩ := held
  rw [Laws.State.signal_eq]
  have queuedIn : ∀ next, Laws.State.Queued { s with signals := s.signals ++ [.begin request] } next →
      Laws.State.Queued s next ∨ next = request := fun next named => by
    rcases named with signal | token
    · rcases List.mem_append.mp signal with old | new
      · exact .inl (.inl old)
      · exact .inr (Laws.Step.begin_inj (List.mem_singleton.mp new))
    · exact .inl (.inr token)
  have instanceIn : ∀ next, Laws.State.Queued { s with signals := s.signals ++ [.begin request] } next → ∀ body,
      next.continuation = .multiInstance body → Laws.State.Queued s next := fun next named body on =>
    (queuedIn next named).resolve_right fun same => other body (same ▸ on)
  refine ⟨each, { queued with
    targets := fun next inQueue body on stands => queued.targets next (instanceIn next inQueue body on) body on stands
    reserved := fun next inQueue run member active id named o inside xid xelement xrole => ?_
    occurs := fun element pending => queued.occurs element ?_
    signalsOrdered := fun run member first second first' second' precedes one two => ?_
    queuesOrdered := fun run member first second first' second' signal token one two => ?_
    above := fun run member next index queued' scope inQueue for_ slot begun =>
      queued.above run member next index queued' scope (instanceIn next inQueue _ for_.1) for_ slot begun }⟩
  · rcases queuedIn next inQueue with old | rfl
    · exact queued.reserved next old run member active id named o inside xid xelement xrole
    · obtain ⟨entry, entryIn, entryNamed, some⟩ := owned id named
      have none := owns.unowned run member next.scope active entry entryIn entryNamed
      rw [none] at some
      exact Bool.false_ne_true some
  · rcases pending with occur | compensate | resumed
    · obtain ⟨scope, rest⟩ := occur
      obtain ⟨leave, writes, rule, member⟩ := rest
      refine .inl ⟨scope, leave, writes, rule, (List.mem_append.mp member).resolve_right fun new => ?_⟩
      exact Laws.Step.occur_ne_begin (List.mem_singleton.mp new)
    · obtain ⟨scope, activity, trigger, rest⟩ := compensate
      obtain ⟨leave, at_, resumed, member⟩ := rest
      refine .inr (.inl ⟨scope, activity, trigger, leave, at_, resumed,
        (List.mem_append.mp member).resolve_right fun new => ?_⟩)
      exact Laws.Step.compensate_ne_begin (List.mem_singleton.mp new)
    · exact .inr (.inr resumed)
  · rcases precedes_append precedes with old | new
    · exact queued.signalsOrdered run member first second first' second' old one two
    · exact absurd (Laws.Step.begin_inj new ▸ two.1) (other _)
  · rcases List.mem_append.mp signal with old | new
    · exact queued.queuesOrdered run member first second first' second' old token one two
    · exact absurd (Laws.Step.begin_inj (List.mem_singleton.mp new) ▸ one.1) (other _)

/-- Storing compensation runs keeps `Numbered` when each reservation they resume is pending already or of an element
that does not loop. -/
theorem Numbered.storeRuns {program : Program} {s : State} (compensation : Compensations)
    (resumes : ∀ run ∈ compensation.runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
      OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop)
    (held : Numbered program s) : Numbered program { s with slots := { s.slots with compensation } } :=
  held.shrink (.same rfl (fun _ inside => inside) rfl rfl rfl fun element pending => by
    rcases pending with occur | compensate | resumed
    · exact .inl (.inl occur)
    · exact .inl (.inr (.inl compensate))
    · obtain ⟨run, member, rest⟩ := resumed
      obtain ⟨at_, leave, resume⟩ := rest
      exact resumes run member element at_ leave resume)

/-- Taking queued signals or tokens off keeps `Numbered`. -/
theorem Numbered.dequeue {program : Program} {s : State} {signals : List Signal} {tokens : List Token}
    (fewer : signals.Sublist s.signals) (fewerTokens : tokens.Sublist s.tokens) (held : Numbered program s) :
    Numbered program { s with signals, tokens } :=
  held.shrink ⟨.refl _, fun _ inside => inside, fun _ inside => .inl inside, fun _ _ outside => absurd ‹_› outside,
    beginsOf_sublist fewer, deferredOf_sublist fewerTokens,
    fun _ pending => .inl (pending_of_sublist (t := { s with signals, tokens }) fewer (fun _ member => member)
      pending)⟩

end Kernel.Proofs.MultiInstance
