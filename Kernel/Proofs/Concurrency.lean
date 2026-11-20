module

public import Kernel.Laws.Step
public import Kernel.Laws.Step.Inputs
public import Kernel.Laws.Data
public import Kernel.Laws.Flow.Concurrent

/-! # Proofs: concurrency (P6)

The statement of the proof wave's concurrency lane ([PLAN, P6](../../docs/PLAN.md#proof-wave)): under
`BranchSchedule.orderInvariant` and the order-invariance premise, two schedules of the enabled tokens and waking items
of the closure an attempted input runs commit results equal up to a bijection of issued identities, with journal and outbox
compared at the canonical-result observation boundary, or fail alike, with one outcome class: `Step.settle`'s fixed
order is immaterial. A Conditional contest is not covered:
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

/-- `after` under the run log `log'` is reached from `before` under `log` by closure micro-steps
(`Laws.Step.ClosureStep`), the log recording each unit as it runs. -/
inductive Reaches (hooks : Hooks) (ctx : Ctx) : Step.RunLog → State → Step.RunLog → State → Prop where
  | refl (log : Step.RunLog) (state : State) : Reaches hooks ctx log state log state
  | step {log log' : Step.RunLog} {unit : UnitKey} {before middle after : State} :
      Laws.Step.ClosureStep hooks ctx log unit before middle → Reaches hooks ctx (log.record unit) middle log' after →
      Reaches hooks ctx log before log' after

/-- `right` records the units `left` records, in another order: a run log of the same closure run in another schedule. -/
structure LogReordered (left right : Step.RunLog) : Prop where
  units : ∀ unit, unit ∈ right.positions ↔ unit ∈ left.positions
  size : right.positions.size = left.positions.size
  distinct : ∀ first second, first ∈ right.positions → second ∈ right.positions →
    right.runPosition first = right.runPosition second → first = second
  below : ∀ unit, unit ∈ right.positions → right.runPosition unit < right.positions.size

/-- Two schedules of one closure state, each with its closure record (DC4): the same state with the units its run log
records in another order (`log`), its queued tokens moved among their keys by any bijection of the key set (`tokens`),
and one interval, in breadth order, of its queued signals that are all Signal firings, the receivers one Signal throw
queues, moved among their keys by any bijection of the interval, every other queued signal in place (`firings`).

DC4 restates P0's form, the queued token list in any order and one contiguous block of the signal list in any order, over
the unit-keyed queues, without weakening it: a queue lists no order of its own, its keys order it (`Step.orderKey`,
`UnitKey.breadth`). Over a fixed key set, moving the contents by any bijection of the keys lets the closure's order read
any permutation of them, so `tokens` is P0's token permutation, cross-batch interleavings included; a contiguous block
of the signal list is an interval of the queued signal keys in breadth order, the order the closure runs signals in, so
`firings` is P0's block. Statement only: open (#163).

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
structure Reordered (left right : Step.RunLog × State) : Prop where
  log : LogReordered left.1 right.1
  tokens : ∃ σ : UnitKey → UnitKey,
    (∀ first second, first ∈ left.2.queuedTokens → second ∈ left.2.queuedTokens → σ first = σ second → first = second) ∧
    (∀ key, key ∈ left.2.queuedTokens → σ key ∈ left.2.queuedTokens) ∧
    (∀ key, key ∈ left.2.queuedTokens → ∃ source, source ∈ left.2.queuedTokens ∧ σ source = key) ∧
    (∀ key, key ∈ right.2.queuedTokens ↔ key ∈ left.2.queuedTokens) ∧
    ∀ key, key ∈ left.2.queuedTokens → right.2.queuedTokens[σ key]? = left.2.queuedTokens[key]?
  firings : ∃ (block : UnitKey → Prop) (σ : UnitKey → UnitKey),
    (∀ key, block key → ∃ item delivery, left.2.queuedSignals[key]? = some (.fire item (.signal delivery))) ∧
    (∀ first middle last, block first → block last → middle ∈ left.2.queuedSignals →
      UnitKey.breadth.val first middle = .lt → UnitKey.breadth.val middle last = .lt → block middle) ∧
    (∀ first second, block first → block second → σ first = σ second → first = second) ∧
    (∀ key, block key → block (σ key)) ∧ (∀ key, block key → ∃ source, block source ∧ σ source = key) ∧
    (∀ key, block key → right.2.queuedSignals[σ key]? = left.2.queuedSignals[key]?) ∧
    ∀ key, ¬ block key → right.2.queuedSignals[key]? = left.2.queuedSignals[key]?
  rest : { right.2 with queuedTokens := left.2.queuedTokens, queuedSignals := left.2.queuedSignals } = left.2

/-- A bijection of scope keys fixing every key `state` issued (`Laws.State.ScopeIssued`), so only the scope occurrences
entered from `state` on are renamed. -/
structure ScopesRenamed (state : State) (rename : ScopeOccurrenceId → ScopeOccurrenceId) : Prop where
  injective : ∀ first second, rename first = rename second → first = second
  surjective : ∀ target, ∃ source, rename source = target
  fixed : ∀ x, Laws.State.ScopeIssued state x → rename x = x

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
  (itemList state.openItems).filterMap fun item => (state.occurrence? item.id.occurrence).map fun occurrence => (state.keyOf occurrence, item.kind)

/-- Equal at the canonical-result observation boundary up to `ids` and `keys`: status and failure, the variable sets
by renamed scope occurrence, each set's bindings as a multiset, the journal's start and end facts and the open waits by
renamed key, and the outbox, each as a multiset. -/
structure Alike (ids : ScopeOccurrenceId → ScopeOccurrenceId) (keys : OccurrenceKey → OccurrenceKey) (left right : State) : Prop where
  status : left.status = right.status
  failure : left.failure = right.failure
  variables : ∃ matched : List ScopeVariables, matched.Perm right.variables ∧ matched.length = left.variables.length ∧
    ∀ pair ∈ left.variables.zip matched, pair.2.scope = ids pair.1.scope ∧ pair.1.entries.Perm pair.2.entries
  started : ((left.journal.flatMap (·.started)).map fun fact => keys fact.occurrence).Perm
    ((right.journal.flatMap (·.started)).map (·.occurrence))
  ended : ((left.journal.flatMap (·.ended)).map fun fact => (keys fact.1, fact.2)).Perm (right.journal.flatMap (·.ended))
  waits : ((openKeys left).map fun entry => (keys entry.1, entry.2)).Perm (openKeys right)
  outbox : (left.outbox.map fun intent => (intent.address, intent.variables, intent.businessKey)).Perm
    (right.outbox.map fun intent => (intent.address, intent.variables, intent.businessKey))

/-- A committed state of a run of `program`: what a committed start leaves, or what a committed input leaves on a
committed state of a run. -/
inductive Committed (hooks : Hooks) (program : Program) : State → Prop where
  | start {input : Input} {after : State} : Step.step hooks program none input = .ok after → Committed hooks program after
  | step {before after : State} {input : Input} : Committed hooks program before →
      Step.step hooks program (some before) input = .ok after → Committed hooks program after

/-- `start` is where the closure of `input` begins when `input` commits, the state its transition micro-step leaves,
which `Step.step` then settles. For a start, the begin of the start Event `chooseStart` picks among those its trigger
fired, on the fresh instance whose clock it advanced (`Laws.Step.StartRan`). For an input on `before`, a committed
state of a run, `Step.onRunning`'s transition (`Laws.Step.step_ok`) on `before` emptied of its per-input record and its
clock advanced (`Laws.Step.onRunning_ok`). -/
def Opens (hooks : Hooks) (program : Program) (input : Input) (start : State) : Prop :=
  (∃ payload after fired element initial, input = .start payload ∧ Step.step hooks program none input = .ok after ∧
    hooks.startsFired (Laws.Step.inputCtx hooks program input) payload = .ok fired ∧
    chooseStart payload.startEvent fired = .ok element ∧
    Step.advanceClock payload.atMs
      (((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)).queueBatch
        (.ofRoot .seed)) = .ok initial ∧
    Step.microStep hooks (Laws.Step.inputCtx hooks program input) (.ofRoot .input) (.input .start) (some element)
      State.root (Step.begin hooks (Laws.Step.inputCtx hooks program input)
        { element, scope := State.root, trigger := payload.trigger }) initial = .ok start) ∨
  ∃ before after running transition clocked, Committed hooks program before ∧
    Step.step hooks program (some before) input = .ok after ∧
    Laws.Step.RunsTransition hooks (Laws.Step.inputCtx hooks program input) transition ∧
    Step.onRunning hooks (Laws.Step.inputCtx hooks program input) running (some before) transition = .ok after ∧
    Step.advanceClock (Step.inputHead running).2.1 { before with journal := [], outbox := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] } =
      .ok clocked ∧
    Step.microStep hooks (Laws.Step.inputCtx hooks program input) (.ofRoot .input) (.input (Step.inputHead running).1)
      none State.root transition clocked = .ok start

/-- `start` is where the closure of `input` begins once `input` is attempted, whether or not it then commits: `Opens`
without its two commit equalities (`Step.step … = .ok after`, `Step.onRunning … = .ok after`), with the running status
`Step.onRunning` checks before it runs the transition. A law stated over `Opens` presupposes that the input commits in
the schedule `Step.settle` takes, so it is vacuous for an input that fails there and silent on the failure's class
(probe P01, 2026-11-20). -/
def OpensAttempt (hooks : Hooks) (program : Program) (input : Input) (start : State) : Prop :=
  (∃ payload fired element initial, input = .start payload ∧
    hooks.startsFired (Laws.Step.inputCtx hooks program input) payload = .ok fired ∧
    chooseStart payload.startEvent fired = .ok element ∧
    Step.advanceClock payload.atMs
      (((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)).queueBatch
        (.ofRoot .seed)) = .ok initial ∧
    Step.microStep hooks (Laws.Step.inputCtx hooks program input) (.ofRoot .input) (.input .start) (some element)
      State.root (Step.begin hooks (Laws.Step.inputCtx hooks program input)
        { element, scope := State.root, trigger := payload.trigger }) initial = .ok start) ∨
  ∃ before running transition clocked, Committed hooks program before ∧ before.status = .running ∧
    Laws.Step.RunsTransition hooks (Laws.Step.inputCtx hooks program input) transition ∧
    Step.advanceClock (Step.inputHead running).2.1 { before with journal := [], outbox := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] } =
      .ok clocked ∧
    Step.microStep hooks (Laws.Step.inputCtx hooks program input) (.ofRoot .input) (.input (Step.inputHead running).1)
      none State.root transition clocked = .ok start

/-- Every input `Opens` speaks of is attempted: drop its commit equalities, and read the running status off
`Step.onRunning`'s success. -/
theorem opensAttempt_of_opens {hooks : Hooks} {program : Program} {input : Input} {start : State}
    (opens : Opens hooks program input start) : OpensAttempt hooks program input start := by
  rcases opens with ⟨payload, _, rest⟩ | ⟨before, _, running, rest⟩
  · obtain ⟨fired, element, initial, facts⟩ := rest
    obtain ⟨starts, _, started⟩ := facts
    exact .inl ⟨payload, fired, element, initial, starts, started⟩
  · obtain ⟨transition, clocked, committed, facts⟩ := rest
    obtain ⟨_, runs, ran, moved⟩ := facts
    obtain ⟨state, _, _, ok⟩ := Laws.Step.onRunning_ok ran
    obtain ⟨_, same, status, _⟩ := ok
    cases same
    exact .inr ⟨before, running, transition, clocked, committed, status, runs, moved⟩

/-- Two settle outcomes have one outcome class: both commit, or both fail as one kind of failure (rejected, rolled back,
semantic failure, unsupported), whatever their codes, a rejection's `stale` flag and a semantic failure's cause. -/
def SameClass {α β : Type} : Except Failure α → Except Failure β → Prop
  | .ok _, .ok _ => True
  | .error (.rejected _ _), .error (.rejected _ _) => True
  | .error (.rolledBack _), .error (.rolledBack _) => True
  | .error (.semanticFailure _ _), .error (.semanticFailure _ _) => True
  | .error (.unsupported _), .error (.unsupported _) => True
  | _, _ => False

/-- P6's commit side: from a state the closure of an attempted input reaches, any two schedules of its enabled work,
each with its closure record (DC4), that both settle commit results alike up to a bijection of the identities and
activations issued from that state on.

P0 stated it from any `Laws.State.WellFormed` state, which is false: `WellFormed` admits queues no run produces, and
two flow tokens queued in the root of a sequential `Start → User Task → Terminate End` process settle in one order
beginning the User Task again before the End and in the other ending the instance first, with no renaming relating the
two journals (P6 design, witness W1). The order-invariance argument rests on the queue having come from a run, so the
start is reachable (root decision D1, 2026-11-15): the state an attempted input's transition micro-step leaves on a
committed state of a run, or the start's begin (`OpensAttempt`), under the run log that records the input's
micro-step, and the closure context `Step.step` gives that input. The results are compared once committed
(`Step.orderJournal`). -/
def CommitsAgree (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (start state reordered left right : State) (log log' : Step.RunLog)
    (fuel work fuel' work' : Nat),
    program.options.branchSchedule = .orderInvariant → Laws.Flow.Apart program → OpensAttempt hooks program input start →
    Reaches hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start log state →
    Reordered (log, state) (log', reordered) →
    Step.orderJournal (Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel work log state) = .ok left →
    Step.orderJournal (Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel' work' log' reordered) =
      .ok right →
    ∃ ids keys, ScopesRenamed state ids ∧ Activations state keys ∧ Alike ids keys left right

/-- P6's failure side (KD8's settle-agreement, T42): under the same bounds, two schedules of the closure state of an
attempted input settle with one outcome class (`SameClass`), so if one fails, the other fails too, as the same kind of
failure; when both commit it says nothing `CommitsAgree` does not.

Only the class: with two independently failing units in one closure, the command reports whichever ran first, so the
failure code may differ between schedules; whether it must agree too is owner item P13 F4, open (2026-11-20). Not yet
true of the kernel, which is why it is a statement: `Step.settle` charges each micro-step the size of the whole state,
so one schedule can exceed the closure work bound where another commits (KD8 finding 1, until K3's created-entries
measure), and `Step.deferred` reads `State.crossed`, so a failure's class depends on which boundary the schedule crossed
first (probes P01 and P13; DC8, until J retires both). -/
def FailureSideAgrees (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (start state reordered : State) (log log' : Step.RunLog) (fuel work : Nat),
    program.options.branchSchedule = .orderInvariant → Laws.Flow.Apart program → OpensAttempt hooks program input start →
    Reaches hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start log state →
    Reordered (log, state) (log', reordered) →
    SameClass (Step.orderJournal (Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel work log state))
      (Step.orderJournal (Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel work log' reordered))

/-- P6: under `orderInvariant` and the order-invariance premise, the schedules of the closure of every attempted input
agree: those that commit commit results alike (`CommitsAgree`), and if one fails every one fails, with one outcome
class (`FailureSideAgrees`). Statement only: open (#163). -/
def SchedulesAgree (hooks : Hooks) : Prop := CommitsAgree hooks ∧ FailureSideAgrees hooks

/-- PC-HUM-04 (`DTB-COMMUTE-01`): a token to a None End beside a token entering an embedded Sub-Process commute under
`orderInvariant` (BPMN 2.0.2 §10.5.3, §13.5.6). The pair's two orders are one `Reordered` pair of a closure state, so
the former theorem is this lane under `Laws.Flow.Apart` at a state queuing the two tokens that the closure of a
committed input reaches, with no premise about the pair's elements. -/
theorem endBesideEntry {hooks : Hooks} (agree : SchedulesAgree hooks)
    (program : Program) (input : Input) (start state reordered left right : State) (log log' : Step.RunLog)
    (fuel work fuel' work' : Nat) (toEnd toEntry : FlowId) (scope : ScopeOccurrenceId) (split : UnitKey)
    (_pair : state.queuedTokens[split.tokenUnit 0]? = some (.flow toEnd scope) ∧
      state.queuedTokens[split.tokenUnit 1]? = some (.flow toEntry scope))
    (invariant : program.options.branchSchedule = .orderInvariant) (separate : Laws.Flow.Apart program)
    (opens : Opens hooks program input start)
    (reached : Reaches hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start log
      state)
    (swapped : Reordered (log, state) (log', reordered))
    (settled : Step.orderJournal (Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel work log state) =
      .ok left)
    (settled' : Step.orderJournal (Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel' work' log'
      reordered) = .ok right) :
    ∃ ids keys, ScopesRenamed state ids ∧ Activations state keys ∧ Alike ids keys left right :=
  agree.1 program input start state reordered left right log log' fuel work fuel' work' invariant separate
    (opensAttempt_of_opens opens) reached swapped settled settled'

end Kernel.Proofs.Concurrency
