module

public import Kernel.Laws.Step
public import Kernel.Laws.Flow
public import Kernel.Laws.Data
public import Kernel.IL.Footprint

/-! # Proofs: concurrency (P6)

The statement of the proof wave's concurrency lane ([PLAN, P6](../../docs/PLAN.md#proof-wave)): under
`BranchSchedule.orderInvariant` and the order-invariance premise, two schedules of a closure's enabled tokens and
waking items commit results equal up to a bijection of issued identities, with journal and outbox compared at the
canonical-result observation boundary: `Step.settle`'s fixed order is immaterial. A Conditional contest is not covered:
the input's ranking decides it by design. Stated over a hooks parameter; the lane closes when `Kernel.Proofs.Step`
proves it of `Registry.hooks`.

Model premises: the profile option `branchSchedule = .orderInvariant`, and `apart`, the order-invariance condition
that admission enforces with `flow.concurrentWrite`, `flow.concurrentInterference` and
`multiInstance.concurrentInstances` (and the refusal P1 adds for #81), over the read and write account of
`Kernel.IL.Footprint`. `apart` is a draft parameter: P1's fix of #81 settles it, since today's admission admits
schedules that wake races and item-dependent exits tell apart, and the fixed refusal fixes what `apart` compares, the
footprints of concurrent branch closures that stop where a branch waits or joins. That admission enforces it stays
scenario evidence. Nothing executable imports this module.
-/

public section

namespace Kernel.Proofs.Concurrency

open Kernel
open Kernel.Laws.State (WellFormed)

/-- `after` is reached from `before` by closure micro-steps (`Laws.Step.ClosureStep`). -/
inductive Reaches (hooks : Hooks) (ctx : Ctx) : State → State → Prop where
  | refl (state : State) : Reaches hooks ctx state state
  | step {before middle after : State} : Laws.Step.ClosureStep hooks ctx before middle → Reaches hooks ctx middle after →
      Reaches hooks ctx before after

/-- Two schedules of one closure state: the same state with its queued tokens in another order and, when its queue
holds only firings (the items one Signal broadcast wakes), those firings in another order. -/
structure Reordered (left right : State) : Prop where
  tokens : right.tokens.Perm left.tokens
  signals : right.signals.Perm left.signals
  firings : left.signals ≠ right.signals → ∀ queued ∈ left.signals, ∃ item fired, queued = .fire item fired
  rest : { right with tokens := left.tokens, signals := left.signals } = left

/-- A bijection of the identities issued at or above `from`, fixing every identity below it. -/
structure Issued (rename : Nat → Nat) (from_ : Nat) : Prop where
  injective : ∀ first second, rename first = rename second → first = second
  surjective : ∀ target, ∃ source, rename source = target
  fixed : ∀ id, id < from_ → rename id = id

/-- A bijection of activations: it keeps an occurrence key's instance, element and role. -/
structure Activations (rename : OccurrenceKey → OccurrenceKey) : Prop where
  injective : ∀ first second, rename first = rename second → first = second
  surjective : ∀ target, ∃ source, rename source = target
  keeps : ∀ key, (rename key).processInstanceId = key.processInstanceId ∧ (rename key).element = key.element ∧
    (rename key).role = key.role

/-- The open items of a state at the observation boundary: the public key of the occurrence each waits for, and its
kind. -/
def openKeys (state : State) : List (OccurrenceKey × OpenKind) :=
  state.openItems.filterMap fun item => (state.occurrence? item.occurrence).map fun occurrence => (state.keyOf occurrence, item.kind)

/-- Equal at the canonical-result observation boundary up to `ids` and `keys`: status and failure, the variable sets
by renamed scope occurrence, the journal's start and end facts and the open waits by renamed key, and the outbox, each
as a multiset. -/
structure Alike (ids : Nat → Nat) (keys : OccurrenceKey → OccurrenceKey) (left right : State) : Prop where
  status : left.status = right.status
  failure : left.failure = right.failure
  variables : (left.variables.map fun frame => { frame with scope := ⟨ids frame.scope.value⟩ }).Perm right.variables
  started : ((left.journal.flatMap (·.started)).map fun fact => keys fact.occurrence).Perm
    ((right.journal.flatMap (·.started)).map (·.occurrence))
  ended : ((left.journal.flatMap (·.ended)).map fun fact => (keys fact.1, fact.2)).Perm (right.journal.flatMap (·.ended))
  waits : ((openKeys left).map fun entry => (keys entry.1, entry.2)).Perm (openKeys right)
  outbox : (left.outbox.map fun intent => (intent.address, intent.variables, intent.businessKey)).Perm
    (right.outbox.map fun intent => (intent.address, intent.variables, intent.businessKey))

/-- P6: from a closure state reached from a well-formed state, any two schedules of its enabled work that both settle
commit results alike up to a bijection of the identities and activations issued from that state on. `apart` is a draft
that P1's fix of #81 settles; with today's admission as `apart` the statement is false (#81). -/
def SchedulesAgree (hooks : Hooks) (apart : Program → Prop) : Prop :=
  ∀ (ctx : Ctx) (start state reordered left right : State) (fuel work fuel' work' : Nat),
    ctx.program.options.branchSchedule = .orderInvariant → apart ctx.program →
    WellFormed start → Reaches hooks ctx start state → Reordered state reordered →
    Step.settle hooks ctx fuel work state = .ok left → Step.settle hooks ctx fuel' work' reordered = .ok right →
    ∃ ids keys, Issued ids state.nextIssue ∧ Activations keys ∧ Alike ids keys left right

end Kernel.Proofs.Concurrency
