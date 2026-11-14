module

public import Kernel.Hooks
public import Kernel.Feature.Flow
import all Kernel.Feature.Flow

/-! # Laws of flow: splits, joins and reach

The rules of the [flow semantics](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) over the IL's flows, the parked
arrivals of `State` and the condition values, independent of `Kernel.Feature.Flow`'s code: which flows an Exclusive, an
Inclusive and an Activity's own split take for given condition values, when a Parallel and an Inclusive join may fire,
which arrivals a firing consumes and how the joined occurrences leave. The Inclusive join's reach is Table 13.3's
upstream-token rule as an inductive path relation over Sequence Flows; the continuations a profile's reach adds beyond
an element's outgoing flows (a host's Boundary Events, an Event-Based Gateway's arms, a throwing Link's catch) are the
parameter `extra`, since stating them needs the element kinds, whose matching `Kernel.Step` owns.

The laws take a gateway's candidates and default as lists, not its `GatewayKind`, whose matching `Kernel.Feature.Flow`
owns (guard 1); the proof wave relates them to the gateway's payload. Condition values are a function `holds`, so every
candidate is evaluated against one state (Table 13.3) and an unconditioned candidate is one that `holds` always takes.
Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Flow

open Kernel

/-! ## Splits -/

/-- An Exclusive Gateway's outcome: the first candidate in declaration order whose condition holds, the conditions
evaluated exactly up to it; the default exactly when every candidate is false; `none`, the command rolled back, when no
candidate holds and there is no default (§13.4.2, Table 13.2,
[flow, Exclusive Gateway](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#exclusive-gateway)). -/
def ExclusiveTakes (candidates : List FlowId) (default : Option FlowId) (holds : FlowId → Bool)
    (evaluated : List FlowId) : Option (List FlowId) → Prop
  | some taken =>
    (∃ earlier chosen later, candidates = earlier ++ chosen :: later ∧ (∀ flow ∈ earlier, holds flow = false) ∧
      holds chosen = true ∧ evaluated = earlier ++ [chosen] ∧ taken = [chosen]) ∨
    ((∀ flow ∈ candidates, holds flow = false) ∧ evaluated = candidates ∧ ∃ fallback, default = some fallback ∧
      taken = [fallback])
  | none => (∀ flow ∈ candidates, holds flow = false) ∧ evaluated = candidates ∧ default = none

/-- An Inclusive Gateway's outcome: every candidate whose condition holds; the default alone when none holds; every
outgoing flow for a pure join, which lists no candidates and no default; `none`, the command rolled back, when
candidates exist but none holds and there is no default (§10.6.3, Table 13.3, CIB-INT-0005, CIB-INT-0012). The order of
the taken flows is the branch schedule's, so only their multiset is the construct's. -/
def InclusiveTakes (candidates : List FlowId) (default : Option FlowId) (outgoing : List FlowId)
    (holds : FlowId → Bool) : Option (List FlowId) → Prop
  | some taken =>
    (candidates = [] ∧ default = none ∧ taken.Perm outgoing) ∨
    (candidates.filter holds ≠ [] ∧ taken.Perm (candidates.filter holds)) ∨
    (candidates.filter holds = [] ∧ ∃ fallback, default = some fallback ∧ taken = [fallback])
  | none => candidates ≠ [] ∧ candidates.filter holds = [] ∧ default = none

/-- An Activity's or Scope's own selection over its outgoing flows: every non-default flow whose condition holds or that
has none, the default only when it takes no other, nothing when it has no outgoing flow, and `none`, the command rolled
back, when it has outgoing flows but takes none (§13.3.1, §10.3.1 `default`, Table 13.3, CIB-INT-0012). -/
def OwnTakes (outgoing : List FlowId) (default : Option FlowId) (holds : FlowId → Bool) : Option (List FlowId) → Prop
  | some taken =>
    (outgoing = [] ∧ taken = []) ∨
    (((outgoing.filter (default != some ·)).filter holds ≠ [] ∧
      taken.Perm ((outgoing.filter (default != some ·)).filter holds))) ∨
    ((outgoing.filter (default != some ·)).filter holds = [] ∧ ∃ fallback, default = some fallback ∧
      fallback ∈ outgoing ∧ taken = [fallback])
  | none => outgoing ≠ [] ∧ (outgoing.filter (default != some ·)).filter holds = [] ∧ default = none

/-- A Parallel fork puts one token on every outgoing flow (§10.6.4, §13.4.1). -/
def ForkTakes (outgoing taken : List FlowId) : Prop :=
  taken.Perm outgoing

/-! ## Joins -/

/-- An arrival on `flow` is parked in the scope occurrence `scope`. -/
def Filled (parked : List Parked) (scope : ScopeOccurrenceId) (flow : FlowId) : Prop :=
  ∃ arrival ∈ parked, arrival.scope = scope ∧ arrival.flow = flow

/-- A Parallel join is ready only when every incoming flow holds an arrival in the same scope occurrence: incoming-flow
provenance, never a count of arrivals (§13.4.1, [flow, Parallel Gateway](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#parallel-gateway)). -/
def ParallelReady (incoming : List FlowId) (parked : List Parked) (scope : ScopeOccurrenceId) : Prop :=
  ∀ flow ∈ incoming, Filled parked scope flow

/-- A firing join consumes exactly one arrival from each filled incoming flow of its scope occurrence and nothing else:
every other arrival, an excess one on a filled flow and those of other scope occurrences included, stays parked. -/
structure Consumes (incoming : List FlowId) (scope : ScopeOccurrenceId) (before after consumed : List Parked) :
    Prop where
  kept : before.Perm (consumed ++ after)
  inScope : ∀ arrival ∈ consumed, arrival.scope = scope
  onIncoming : ∀ arrival ∈ consumed, arrival.flow ∈ incoming
  oneEach : (consumed.map (·.flow)).Nodup
  everyFilled : ∀ flow ∈ incoming, Filled before scope flow → flow ∈ consumed.map (·.flow)

/-- The joined occurrences leave once: exactly one of them leaves on the join's outgoing selection `taken`, every other
ends with no flow, as one activity instance ends per joined execution. -/
def LeavesOnce (consumed : List Parked) (taken : List FlowId) (leaving : List (Nat × List FlowId)) : Prop :=
  ∃ winner others, (winner :: others).Perm (consumed.map (·.occurrence)) ∧
    leaving.Perm ((winner, taken) :: others.map (·, []))

/-- A path of Sequence Flows from `start` to `target` that passes no occurrence of `gateway`: each step leaves the
target of the flow before on one of its outgoing flows, or on a continuation the profile's reach adds (`extra`). -/
inductive Leads (flows : List Flow) (extra : ElementId → FlowId → Prop) (gateway : ElementId) :
    FlowId → FlowId → Prop where
  | here (flow : FlowId) : Leads flows extra gateway flow flow
  | step (first : Flow) (next target : FlowId) : first ∈ flows → first.target ≠ gateway →
      ((∃ out ∈ flows, out.source = first.target ∧ out.id = next) ∨ extra first.target next) →
      Leads flows extra gateway next target → Leads flows extra gateway first.id target

/-- The flows a position held by `element` continues on: its outgoing flows, or a continuation of the profile's reach. -/
def Continues (flows : List Flow) (extra : ElementId → FlowId → Prop) (element : ElementId) (flow : FlowId) : Prop :=
  (∃ out ∈ flows, out.source = element ∧ out.id = flow) ∨ extra element flow

/-- An element holding remaining work of `scope` other than the arrivals parked at `gateway`: a begun occurrence, which
also stands for the open items it waits on and the subscriptions hanging on it; a child scope occurrence, which
continues after its host; a deferred begin. A subscription's reservation counts only through its host's continuation,
so the profile's reach alone decides whether a Boundary Event's path counts. -/
def Holds (s : State) (scope : ScopeOccurrenceId) (gateway element : ElementId) : Prop :=
  element ≠ gateway ∧
    ((∃ occurrence ∈ s.occurrences, occurrence.scope = scope ∧ occurrence.begun = true ∧ occurrence.element = element) ∨
      (∃ child ∈ s.scopes, child.parent = some scope ∧ child.element = some element) ∨
      ∃ request, Token.begin request ∈ s.tokens ∧ request.scope = scope ∧ request.element = element)

/-- Some remaining work of `scope` can still reach `target` without passing `gateway`: a flow token of the scope
occurrence, or an element holding work there, with a path to it (Table 13.3, CIB-INT-0016,
[flow, Inclusive Gateway](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#inclusive-gateway)). -/
def CanReach (flows : List Flow) (extra : ElementId → FlowId → Prop) (s : State) (gateway : ElementId)
    (scope : ScopeOccurrenceId) (target : FlowId) : Prop :=
  (∃ start, Token.flow start scope ∈ s.tokens ∧ Leads flows extra gateway start target) ∨
    ∃ element next, Holds s scope gateway element ∧ Continues flows extra element next ∧
      Leads flows extra gateway next target

/-- An Inclusive join is ready when at least one incoming flow holds an arrival and no remaining work of its scope
occurrence can reach an incoming flow that holds none. -/
def InclusiveReady (flows : List Flow) (extra : ElementId → FlowId → Prop) (incoming : List FlowId) (s : State)
    (gateway : ElementId) (scope : ScopeOccurrenceId) : Prop :=
  (∃ flow ∈ incoming, Filled s.slots.parked scope flow) ∧
    ∀ flow ∈ incoming, ¬ Filled s.slots.parked scope flow → ¬ CanReach flows extra s gateway scope flow

/-- A Parallel join fires only when ready, consuming one arrival per incoming flow. -/
structure ParallelFires (incoming : List FlowId) (scope : ScopeOccurrenceId) (before after consumed : List Parked) :
    Prop where
  ready : ParallelReady incoming before scope
  consumes : Consumes incoming scope before after consumed

/-- An Inclusive join fires only when ready in the state `s` it is offered in, consuming one arrival per filled flow. -/
structure InclusiveFires (flows : List Flow) (extra : ElementId → FlowId → Prop) (incoming : List FlowId) (s : State)
    (gateway : ElementId) (scope : ScopeOccurrenceId) (after consumed : List Parked) : Prop where
  ready : InclusiveReady flows extra incoming s gateway scope
  consumes : Consumes incoming scope s.slots.parked after consumed

theorem ParallelFires.consumesAll {incoming : List FlowId} {scope : ScopeOccurrenceId} {before after consumed : List Parked}
    (fires : ParallelFires incoming scope before after consumed) : ∀ flow ∈ incoming, flow ∈ consumed.map (·.flow) :=
  fun flow member => fires.consumes.everyFilled flow member (fires.ready flow member)

/-! ## Flow's hooks against the laws

What `Kernel.Feature.Flow`'s hooks do, stated by the laws above, for `Kernel.Proofs` to compose with `Step`. -/

/-- Whether a candidate's condition holds in `context`, as `Kernel.Feature.Flow` reads it: a failing evaluation
holds for no candidate, since it rolls the command back before any flow is taken. -/
def candidateHolds (ctx : Ctx) (context : EvalContext) (candidate : FlowId) : Bool :=
  match Feature.Flow.condition ctx context candidate with
  | .ok value => value
  | .error _ => false

theorem firstTrue_spec {ctx : Ctx} {context : EvalContext} :
    ∀ {candidates : List FlowId} {chosen : Option FlowId},
      Feature.Flow.firstTrue ctx context candidates = .ok chosen →
      (∀ flow, chosen = some flow → ∃ earlier later, candidates = earlier ++ flow :: later ∧
        (∀ other ∈ earlier, candidateHolds ctx context other = false) ∧ candidateHolds ctx context flow = true) ∧
      (chosen = none → ∀ other ∈ candidates, candidateHolds ctx context other = false)
  | [], chosen, ran => by
    simp only [Feature.Flow.firstTrue] at ran
    cases ran
    exact ⟨fun _ found => by simp at found, fun _ _ member => by simp at member⟩
  | candidate :: rest, chosen, ran => by
    simp only [Feature.Flow.firstTrue] at ran
    cases holds : Feature.Flow.condition ctx context candidate with
    | error failure => simp [holds, bind, Except.bind] at ran
    | ok value =>
      simp only [holds, bind, Except.bind] at ran
      cases value with
      | true =>
        simp only [ite_true] at ran
        cases ran
        refine ⟨fun flow found => ?_, fun absent => by simp at absent⟩
        cases found
        exact ⟨[], rest, by simp, by simp, by simp [candidateHolds, holds]⟩
      | false =>
        simp only [Bool.false_eq_true, ite_false] at ran
        have false_ : candidateHolds ctx context candidate = false := by simp [candidateHolds, holds]
        obtain ⟨found, absent⟩ := firstTrue_spec ran
        refine ⟨fun flow chosen_ => ?_, fun none_ other member => ?_⟩
        · obtain ⟨earlier, later, split_, ⟨before, here⟩⟩ := found flow chosen_
          refine ⟨candidate :: earlier, later, by simp [split_], ?_, here⟩
          intro other member
          rcases List.mem_cons.mp member with same | inner
          · subst same; exact false_
          · exact before other inner
        · rcases List.mem_cons.mp member with same | inner
          · subst same; exact false_
          · exact absent none_ other inner

/-- `Hooks.arriveGateway` of Flow on an Exclusive Gateway enqueues the completion of the gateway's occurrence on the
flows `ExclusiveTakes` allows, its conditions read in the state it arrived in; the conditions evaluated are exactly
those up to the first true one. -/
theorem arriveGateway_exclusive {ctx : Ctx} {header : Header} {payload : GatewayPayload} {occurrence : Occurrence}
    {state after : State} {candidates : List FlowId} {default : Option FlowId}
    (kind : payload.kind = .exclusive candidates default)
    (ran : Feature.Flow.arriveGateway ctx header payload occurrence state = .ok after) :
    ∃ taken evaluated, after = state.signal (.complete occurrence.id (.flows taken) [] .outward) ∧
      ExclusiveTakes candidates default (candidateHolds ctx (state.evalContext ctx.program occurrence.scope)) evaluated
        (some taken) := by
  simp only [Feature.Flow.arriveGateway, kind, Feature.Flow.exclusive] at ran
  cases first : Feature.Flow.firstTrue ctx (state.evalContext ctx.program occurrence.scope) candidates with
  | error failure => simp [first, bind, Except.bind] at ran
  | ok chosen =>
    simp only [first, bind, Except.bind] at ran
    obtain ⟨found, absent⟩ := firstTrue_spec first
    cases chosen with
    | some flow =>
      simp only [HOrElse.hOrElse, OrElse.orElse, Option.orElse, Except.ok.injEq] at ran
      subst ran
      obtain ⟨earlier, later, split_, ⟨before, here⟩⟩ := found flow (by simp)
      exact ⟨[flow], earlier ++ [flow], by simp [Feature.Flow.signalComplete],
        .inl ⟨earlier, flow, later, split_, before, here, by simp, by simp⟩⟩
    | none =>
      cases default with
      | none => simp [HOrElse.hOrElse, OrElse.orElse, Option.orElse] at ran
      | some fallback =>
        simp only [HOrElse.hOrElse, OrElse.orElse, Option.orElse, Except.ok.injEq] at ran
        subst ran
        exact ⟨[fallback], candidates, by simp [Feature.Flow.signalComplete],
          .inr ⟨absent (by simp), by simp, fallback, by simp, by simp⟩⟩

/-! ## Non-vacuity

A gateway `J` with incoming flows `a` (from `A`) and `b` (from `B`) and outgoing `out`; `B` is fed by `c` from `C`. -/

def flowA : FlowId := ⟨"a"⟩
def flowB : FlowId := ⟨"b"⟩
def flowC : FlowId := ⟨"c"⟩
def flowOut : FlowId := ⟨"out"⟩
def joinGateway : ElementId := ⟨"J"⟩

def edgeA : Flow := { id := flowA, source := ⟨"A"⟩, target := joinGateway }
def edgeB : Flow := { id := flowB, source := ⟨"B"⟩, target := joinGateway }
def edgeC : Flow := { id := flowC, source := ⟨"C"⟩, target := ⟨"B"⟩ }
def edgeOut : Flow := { id := flowOut, source := joinGateway, target := ⟨"D"⟩ }
def diagram : List Flow := [edgeA, edgeB, edgeC, edgeOut]

def root : ScopeOccurrenceId := ⟨0⟩
def arrivedA : Parked := { occurrence := 1, flow := flowA, scope := root }
def arrivedB : Parked := { occurrence := 2, flow := flowB, scope := root }
def againA : Parked := { occurrence := 3, flow := flowA, scope := root }

/-- `true` for `a` only. -/
def onlyA (flow : FlowId) : Bool := flow == flowA

theorem first_true_taken : ExclusiveTakes [flowB, flowA, flowC] none onlyA [flowB, flowA] (some [flowA]) :=
  .inl ⟨[flowB], flowA, [flowC], rfl, by simp [onlyA, flowA, flowB], by simp [onlyA], rfl, rfl⟩

theorem later_true_rejected : ¬ ExclusiveTakes [flowA, flowB] none (fun _ => true) [flowA, flowB] (some [flowB]) := by
  rintro (⟨earlier, chosen, later, facts⟩ | ⟨_, _, fallback⟩)
  · obtain ⟨_, before, rest⟩ := facts
    obtain ⟨_, evaluated, _⟩ := rest
    cases earlier with
    | nil => simp at evaluated
    | cons head tail => exact absurd (before head (by simp)) (by simp)
  · obtain ⟨_, none, _⟩ := fallback
    simp at none

theorem default_taken : ExclusiveTakes [flowA] (some flowC) (fun _ => false) [flowA] (some [flowC]) :=
  .inr ⟨by simp, rfl, flowC, rfl, rfl⟩

theorem no_default_rolls_back : ExclusiveTakes [flowA] none (fun _ => false) [flowA] none :=
  ⟨by simp, rfl, rfl⟩

theorem every_true_taken :
    InclusiveTakes [flowA, flowB] (some flowC) [flowA, flowB, flowC] (fun flow => flow != flowC) (some [flowB, flowA]) := by
  have chosen : [flowA, flowB].filter (fun flow => flow != flowC) = [flowA, flowB] := by
    simp [flowA, flowB, flowC]
  exact .inr (.inl ⟨by simp [chosen], by rw [chosen]; exact List.Perm.swap _ _ []⟩)

theorem default_beside_true_rejected :
    ¬ InclusiveTakes [flowA, flowB] (some flowC) [flowA, flowB, flowC] onlyA (some [flowC]) := by
  have chosen : [flowA, flowB].filter onlyA = [flowA] := by simp [onlyA, flowA, flowB]
  rintro (⟨empty, _⟩ | ⟨_, taken⟩ | ⟨none, _⟩)
  · simp at empty
  · rw [chosen] at taken
    simpa [flowA, flowC] using taken.mem_iff.mp (List.mem_singleton_self flowC)
  · simp [chosen] at none

theorem pure_join_takes_all : InclusiveTakes [] none [flowOut] onlyA (some [flowOut]) :=
  .inl ⟨rfl, rfl, List.Perm.refl _⟩

theorem own_default_when_none : OwnTakes [flowA, flowB] (some flowB) (fun _ => false) (some [flowB]) :=
  .inr (.inr ⟨by simp, flowB, rfl, by simp, rfl⟩)

theorem own_rollback : OwnTakes [flowA] none (fun _ => false) none :=
  ⟨by simp, by simp, rfl⟩

theorem own_sink : OwnTakes [] none onlyA (some []) := .inl ⟨rfl, rfl⟩

theorem fork_all : ForkTakes [flowA, flowB] [flowB, flowA] := List.Perm.swap _ _ []

theorem parallel_fires :
    ParallelFires [flowA, flowB] root [arrivedA, againA, arrivedB] [againA] [arrivedA, arrivedB] where
  ready := by simp [ParallelReady, Filled, arrivedA, arrivedB, againA]
  consumes := {
    kept := List.Perm.cons _ (List.Perm.swap _ _ [])
    inScope := by simp [arrivedA, arrivedB]
    onIncoming := by simp [arrivedA, arrivedB]
    oneEach := by simp [arrivedA, arrivedB, flowA, flowB]
    everyFilled := by simp [arrivedA, arrivedB] }

/-- One flow's arrivals twice over are no Parallel join: provenance, not count. -/
theorem count_without_provenance_rejected : ¬ ParallelReady [flowA, flowB] [arrivedA, againA] root := by
  intro ready
  obtain ⟨arrival, member, _, flow⟩ := ready flowB (by simp)
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [arrivedA, againA, flowA, flowB] at flow

/-- Consuming the excess arrival too consumes more than one per flow. -/
theorem excess_consumed_rejected :
    ¬ Consumes [flowA, flowB] root [arrivedA, againA, arrivedB] [] [arrivedA, againA, arrivedB] := fun consumes => by
  have := consumes.oneEach
  simp [arrivedA, againA, arrivedB] at this

theorem leaves_once : LeavesOnce [arrivedA, arrivedB] [flowOut] [(2, []), (1, [flowOut])] :=
  ⟨1, [2], List.Perm.refl _, List.Perm.swap _ _ []⟩

/-- Both joined occurrences leaving on the outgoing flow is two leavings, not one. -/
theorem both_leave_rejected : ¬ LeavesOnce [arrivedA, arrivedB] [flowOut] [(1, [flowOut]), (2, [flowOut])] := by
  rintro ⟨winner, others, _, leaving⟩
  have first := leaving.mem_iff.mp (List.mem_cons_self (a := ((1 : Nat), [flowOut])))
  have second := leaving.mem_iff.mp (List.mem_cons_of_mem _ (List.mem_singleton_self ((2 : Nat), [flowOut])))
  simp at first second
  omega

def atJoin : Occurrence := { id := 1, element := joinGateway, scope := root, activation := 1 }
def atC : Occurrence := { id := 4, element := ⟨"C"⟩, scope := root, activation := 1 }

/-- `A` arrived; `C` still works upstream of `b`, so the Inclusive join waits. -/
def waitingAtC : State :=
  { instanceId := "p", scopes := [{ id := root, element := none, parent := none }], occurrences := [atJoin, atC],
    slots := { parked := [arrivedA] } }

/-- `C` is gone: nothing can reach `b` any more, so the join is ready without an arrival on `b`. -/
def doneAtC : State := { waitingAtC with occurrences := [atJoin] }

theorem c_reaches_b : CanReach diagram (fun _ _ => False) waitingAtC joinGateway root flowB :=
  .inr ⟨⟨"C"⟩, flowC, ⟨by simp [joinGateway], .inl ⟨atC, by simp [waitingAtC], rfl, rfl, rfl⟩⟩,
    .inl ⟨edgeC, by simp [diagram], rfl, rfl⟩,
    .step edgeC flowB flowB (by simp [diagram]) (by simp [edgeC, joinGateway])
      (.inl ⟨edgeB, by simp [diagram], rfl, rfl⟩) (.here _)⟩

theorem upstream_blocks : ¬ InclusiveReady diagram (fun _ _ => False) [flowA, flowB] waitingAtC joinGateway root := by
  rintro ⟨_, quiet⟩
  refine quiet flowB (by simp) ?_ c_reaches_b
  rintro ⟨arrival, member, _, flow⟩
  simp only [waitingAtC, List.mem_singleton] at member
  subst member
  simp [arrivedA, flowA, flowB] at flow

/-- The parked arrival at `J` is no position, and `J`'s own outgoing flow passes `J`, so nothing blocks the join. -/
theorem nothing_upstream_ready : InclusiveReady diagram (fun _ _ => False) [flowA, flowB] doneAtC joinGateway root := by
  refine ⟨⟨flowA, by simp, arrivedA, by simp [doneAtC, waitingAtC], rfl, rfl⟩, ?_⟩
  intro flow _ _ reach
  rcases reach with ⟨_, token, _⟩ | ⟨element, _, position⟩
  · simp [doneAtC, waitingAtC] at token
  obtain ⟨⟨other, holds⟩, _, _⟩ := position
  rcases holds with ⟨occurrence, member, facts⟩ | ⟨child, member, parent, _⟩ | ⟨_, token, _⟩
  · obtain ⟨_, _, same⟩ := facts
    simp only [doneAtC, List.mem_singleton] at member
    subst member
    exact other same.symm
  · simp only [doneAtC, waitingAtC, List.mem_singleton] at member
    subst member
    simp at parent
  · simp [doneAtC, waitingAtC] at token

/-! ## Link Events -/

/-- A Link Event passes its token on within the micro-step that began it: no state between micro-steps holds an
occurrence of an element whose occurrences are unpublished, `unpublished` standing for the negation of
`Program.publishesOccurrences`. So the publication boundary, which leaves out such an occurrence's start and end and a
transition acting on its element, drops no fact of an occurrence that lives on (the observation contract's Link
exception, [flow, Link Events](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#link-events)). -/
def LinkPassesThrough (unpublished : ElementId → Bool) (between : State) : Prop :=
  ∀ occurrence ∈ between.occurrences, unpublished occurrence.element = false

theorem no_link_held : LinkPassesThrough (· == ⟨"L"⟩) waitingAtC := by
  intro occurrence member
  simp only [waitingAtC, List.mem_cons, List.mem_singleton, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [atJoin, atC, joinGateway]

/-- A state still holding the occurrence of an unpublished element breaks the rule. -/
theorem held_link_rejected : ¬ LinkPassesThrough (· == ⟨"C"⟩) waitingAtC := fun passes => by
  have := passes atC (by simp [waitingAtC])
  simp [atC] at this

end Kernel.Laws.Flow
