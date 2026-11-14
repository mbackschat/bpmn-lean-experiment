module

public import Kernel.Laws.Step
public import Kernel.Laws.Data
public import Kernel.Laws.Flow.Concurrent

/-! # Proofs: concurrency (P6)

The statement of the proof wave's concurrency lane ([PLAN, P6](../../docs/PLAN.md#proof-wave)): under
`BranchSchedule.orderInvariant` and the order-invariance premise, two schedules of a closure's enabled tokens and
waking items commit results equal up to a bijection of issued identities, with journal and outbox compared at the
canonical-result observation boundary: `Step.settle`'s fixed order is immaterial. A Conditional contest is not covered:
the input's ranking decides it by design. Stated over a hooks parameter; the lane closes when `Kernel.Proofs.Step`
proves it of `Registry.hooks`.

Model premises: the profile option `branchSchedule = .orderInvariant`, and `Laws.Flow.Apart`, the order-invariance
condition admission enforces with `flow.concurrentWrite`, `flow.concurrentInterference` and
`multiInstance.concurrentInstances` (#81): two units of work one closure may hold together (`Laws.Flow.Concurrent`)
neither race on a name, by the read and write account of `Kernel.IL.Footprint`, nor act on each other's work, by
removing a region that holds it, resuming a subscription it opens or compensating a record it leaves. The units are
those of the mechanisms that queue more than one work item, one case each: a split's emission (BPMN 2.0.2 §13.3.1,
Table 13.1), a parallel body's instances (§13.3.7), a Signal throw's firings beside its continuation (§10.5.1: a Signal
reaches every catcher), a non-interrupting catch beside its thrower, which goes on (§10.5.1), the Conditional firings
one write offers (`Feature.Subscriptions.offerWrites`), the handlers one Compensation throw begins (§13.5.5), the
children a Scope's entry begins without a start Event (§13.3.4), the Conditional items one arming finds true beside the
entry's begun work (§13.4.4), and the continuations of Inclusive joins a quiescent closure offers again (Table 13.3); an
Error no catcher takes ends every unit (Table 10.88). `Laws.Flow.Concurrent`'s cases are exactly the cases of P6's
provenance lemma, that two items queued together at a reachable closure state lie in distinct units of one case, and
they must match the mechanisms `Admission.Flow.Concurrency.concurrentLevel` counts as making a level concurrent. That
admission enforces `Apart` stays scenario evidence (`scenarios/open-rows/split-branch-order`,
`scenarios/open-rows/branch-fan-out-order`), since a law may not name the admission evaluator. `Laws.Data` is this
module's path to `Laws.State`, whose importers are all feature `Laws` modules. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Concurrency

open Kernel
open Kernel.Laws.State (WellFormed)

/-- `after` is reached from `before` by closure micro-steps (`Laws.Step.ClosureStep`). -/
inductive Reaches (hooks : Hooks) (ctx : Ctx) : State → State → Prop where
  | refl (state : State) : Reaches hooks ctx state state
  | step {before middle after : State} : Laws.Step.ClosureStep hooks ctx before middle → Reaches hooks ctx middle after →
      Reaches hooks ctx before after

/-- Two schedules of one closure state: the same state with its queued tokens, a split's branches, in another order,
and one contiguous block of Signal firings, the receivers one Signal throw queues, in another order, every other queued
signal in place, the ones before the block included.

It does not vary the `begin` signals of a parallel body's instances (under `orderInvariant` no begin is deferred onto
the tokens), of a Scope's implicitly begun children, whose tokens `tokens` reorders, the begins of the handlers one
Compensation throw starts, the order of idle scope completions, or the parking order in which `Step.reoffer?` offers
Inclusive joins again, which `Step.settle` fixes: that those orders are immaterial rests on admission alone
(`multiInstance.concurrentInstances`, which counts an instance completing where the instances begin or where a broadcast
resumes them, the compensation pairs of `flow.concurrentWrite` and `flow.concurrentInterference`, a Scope's completion
followed as its thrower's continuation, the joins' continuations of `flow.concurrentWrite` and
`flow.concurrentInterference`), restated in `Laws.Flow.Concurrent`'s `instances`, `compensating`, `rejoined` and
`continuationOf`. The Conditional firings one write or one arming offers stay in place too: admission refuses a write
whose firings race a sibling unit, and an uncontested firing's effects reach the other units only through the tokens it
emits, which `tokens` reorders. -/
structure Reordered (left right : State) : Prop where
  tokens : right.tokens.Perm left.tokens
  firings : ∃ before block block' after, left.signals = before ++ block ++ after ∧
    right.signals = before ++ block' ++ after ∧ block'.Perm block ∧
    ∀ queued ∈ block, ∃ item delivery, queued = .fire item (.signal delivery)
  rest : { right with tokens := left.tokens, signals := left.signals } = left

/-- A bijection of the identities issued at or above `from`, fixing every identity below it. -/
structure Issued (rename : Nat → Nat) (from_ : Nat) : Prop where
  injective : ∀ first second, rename first = rename second → first = second
  surjective : ∀ target, ∃ source, rename source = target
  fixed : ∀ id, id < from_ → rename id = id

/-- A bijection of activations: it keeps an occurrence key's instance, element and role, and fixes every activation
`state` had already counted, so only those numbered from `state` on are renamed. -/
structure Activations (state : State) (rename : OccurrenceKey → OccurrenceKey) : Prop where
  injective : ∀ first second, rename first = rename second → first = second
  surjective : ∀ target, ∃ source, rename source = target
  keeps : ∀ key, (rename key).processInstanceId = key.processInstanceId ∧ (rename key).element = key.element ∧
    (rename key).role = key.role
  fixed : ∀ key, (∃ count ∈ state.activations, count.processInstance = key.processInstanceId ∧
    count.element = key.element ∧ count.role = key.role ∧ key.activation ≤ count.count) → rename key = key

/-- The open items of a state at the observation boundary: the public key of the occurrence each waits for, and its
kind. -/
def openKeys (state : State) : List (OccurrenceKey × OpenKind) :=
  state.openItems.filterMap fun item => (state.occurrence? item.occurrence).map fun occurrence => (state.keyOf occurrence, item.kind)

/-- Equal at the canonical-result observation boundary up to `ids` and `keys`: status and failure, the variable sets
by renamed scope occurrence, each set's bindings as a multiset, the journal's start and end facts and the open waits by
renamed key, and the outbox, each as a multiset. -/
structure Alike (ids : Nat → Nat) (keys : OccurrenceKey → OccurrenceKey) (left right : State) : Prop where
  status : left.status = right.status
  failure : left.failure = right.failure
  variables : ∃ matched : List ScopeVariables, matched.Perm right.variables ∧ matched.length = left.variables.length ∧
    ∀ pair ∈ left.variables.zip matched, pair.2.scope = ⟨ids pair.1.scope.value⟩ ∧ pair.1.entries.Perm pair.2.entries
  started : ((left.journal.flatMap (·.started)).map fun fact => keys fact.occurrence).Perm
    ((right.journal.flatMap (·.started)).map (·.occurrence))
  ended : ((left.journal.flatMap (·.ended)).map fun fact => (keys fact.1, fact.2)).Perm (right.journal.flatMap (·.ended))
  waits : ((openKeys left).map fun entry => (keys entry.1, entry.2)).Perm (openKeys right)
  outbox : (left.outbox.map fun intent => (intent.address, intent.variables, intent.businessKey)).Perm
    (right.outbox.map fun intent => (intent.address, intent.variables, intent.businessKey))

/-- P6: from a closure state reached from a well-formed state, any two schedules of its enabled work that both settle
commit results alike up to a bijection of the identities and activations issued from that state on. -/
def SchedulesAgree (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (start state reordered left right : State) (fuel work fuel' work' : Nat),
    ctx.program.options.branchSchedule = .orderInvariant → Laws.Flow.Apart ctx.program →
    WellFormed start → Reaches hooks ctx start state → Reordered state reordered →
    Step.settle hooks ctx fuel work state = .ok left → Step.settle hooks ctx fuel' work' reordered = .ok right →
    ∃ ids keys, Issued ids state.nextIssue ∧ Activations state keys ∧ Alike ids keys left right

end Kernel.Proofs.Concurrency
