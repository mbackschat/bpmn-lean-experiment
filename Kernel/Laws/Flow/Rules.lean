module

public import Kernel.State

/-! # Laws of flow: the rules of splits, joins and reach

The rules of the [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) over the IL's flows, the parked
arrivals of `State` and the condition values, stated without reading `Kernel.Feature.Flow`, so that what reads them
alone, the witnesses (`Kernel.Laws.Flow.Witnesses`), stays outside the feature's rebuild cone (guard 15): which flows an
Exclusive, an Inclusive and an Activity's own split take for given condition values, when a Parallel and an Inclusive
join may fire, which arrivals a firing consumes and how the joined occurrences leave. The Inclusive join's reach is
Table 13.3's upstream-token rule as an inductive path relation over Sequence Flows; the continuations a profile's reach
adds beyond an element's outgoing flows (a host's Boundary Events, an Event-Based Gateway's arms, a throwing Link's
catch) are the parameter `extra`, since stating them needs the element kinds, whose matching `Kernel.Step` owns.

The rules take a gateway's candidates and default as lists, not its `GatewayKind`, whose matching `Kernel.Feature.Flow`
owns (guard 1); the proof wave relates them to the gateway's payload. Condition values are a function `holds`, so every
candidate is evaluated against one state (Table 13.3) and an unconditioned candidate is one that `holds` always takes.
Nothing executable imports this module.
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
def LeavesOnce (consumed : List Parked) (taken : List FlowId) (leaving : List (OccurrenceId × List FlowId)) : Prop :=
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

/-! ## Link Events -/

/-- A Link Event passes its token on within the micro-step that began it: no state between micro-steps holds an
occurrence of an element whose occurrences are unpublished, `unpublished` standing for the negation of
`Program.publishesOccurrences`. So the publication boundary, which leaves out such an occurrence's start and end and a
transition acting on its element, drops no fact of an occurrence that lives on (the observation contract's Link
exception, [flow, Link Events](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#link-events)). -/
def LinkPassesThrough (unpublished : ElementId → Bool) (between : State) : Prop :=
  ∀ occurrence ∈ between.occurrences, unpublished occurrence.element = false

end Kernel.Laws.Flow
