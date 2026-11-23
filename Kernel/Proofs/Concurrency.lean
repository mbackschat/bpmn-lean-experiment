module

public import Kernel.Laws.Step
public import Kernel.Laws.Step.Inputs
public import Kernel.Laws.Data
public import Kernel.Laws.Flow.Concurrent

/-! # Proofs: concurrency (P6)

The statement of the proof wave's concurrency lane ([PLAN, P6](../../docs/PLAN.md#proof-wave)): under
`BranchSchedule.orderInvariant` and the order-invariance premise, the complete runs of the closure relation from where
an attempted input's closure begins, each picking any enabled unit (`fire`, `Runs`), commit results equal up to a
bijection of issued identities, with journal and intents compared at the canonical-result observation boundary, and if
one commits none fails: `Step.settle`'s fixed order, one such run (`SettleRuns`), is immaterial. A Conditional
contest is not covered: the input's ranking decides it by design. Stated over a hooks parameter; the lane closes when
`Kernel.Proofs.Step` proves it of `Registry.hooks`.

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

/-- A unit of the closure relation, what one micro-step of a closure runs under any pick (probe P18's `KUnit`, with its
later layer's picks apart): a queued signal or token by its key, a scope occurrence's idle check by its identifier, the
offer of a parked arrival by its index in the parked list, and the instance's completion. -/
inductive ClosureUnit where
  | signal (key : UnitKey)
  | token (key : UnitKey)
  | idle (scope : ScopeOccurrenceId)
  | offer (index : Nat)
  | finish

/-- The micro-step `unit` runs on `state` with the unit key it runs under, or `none` when `unit` is not enabled there.
Layer 0 is every queued signal batch entry and every queued token, each run as `Step.settle` runs it. Once neither is
queued, every idle scope occurrence (`Step.idleScope?`'s gate: not the root, no queued work names it or one inside it,
no Activity's local scope occurrence) completes through its owner; once none is idle, every parked arrival whose offer
fires is offered again, a failing offer failing as its unit; once no offer fires, the instance completes when its root
is idle and no signal is queued (`Step.settle`'s last branch). `orderInvariant` admits any of these picks (KD3), so
the relation picks any enabled unit where `Step.settle` picks one. -/
def fire (hooks : Hooks) (ctx : Ctx) (unit : ClosureUnit) (state : State) : Option (Except Failure (UnitKey × State)) :=
  let quiet := state.queuedSignals.isEmpty && state.queuedTokens.isEmpty
  match unit with
  | .signal key => state.queuedSignals[key]?.map fun next =>
      (Step.microStep hooks ctx key (.signal (Step.signalName next)) none State.root (Step.dispatchSignal hooks ctx next)
        { state with queuedSignals := state.queuedSignals.erase key }).map (key, ·)
  | .token key => state.queuedTokens[key]?.map fun token =>
      (Step.moveToken hooks ctx key token { state with queuedTokens := state.queuedTokens.erase key }).map (key, ·)
  | .idle id => (state.scopes.find? (·.id == id)).bind fun scope =>
      if quiet && id != State.root && !state.busyScopes.contains id && !Step.activityLocal ctx state scope &&
          !Step.signalsHold hooks ctx state id then
        match UnitKey.idleUnit? id with
        | none => some (.error (.semanticFailure .invariant "idle-unit-unkeyed"))
        | some key => some ((Step.microStep hooks ctx key (.idle id) scope.element id
            (Step.completeIdleScope hooks ctx scope) state).map (key, ·))
      else none
  | .offer index =>
    if quiet && (Step.idleScope? hooks ctx state).isNone then
      state.slots.parked[index]?.bind fun waiting =>
        match Step.offerParked hooks ctx state waiting with
        | .error failure => some (.error failure)
        | .ok none => none
        | .ok (some (gateway, scope, occurrence, offered)) =>
          match UnitKey.offerUnit? occurrence (Step.offerRound state occurrence) with
          | none => some (.error (.semanticFailure .invariant "offer-unit-unkeyed"))
          | some key =>
            some ((Step.microStep hooks ctx key (.idle scope) (some gateway) scope (fun _ => .ok offered) state).map (key, ·))
    else none
  | .finish =>
    if quiet && (Step.idleScope? hooks ctx state).isNone && state.idle State.root then
      match Step.reoffer? hooks ctx state with
      | .ok none => some ((Step.microStep hooks ctx (.ofRoot (.idle [])) (.idle State.root) none State.root
          (fun state => .ok (Step.endInstance .completed none state)) state).map (.ofRoot (.idle []), ·))
      | _ => none
    else none

/-- `after` under the run log `log'` is reached from `state` under `log` by committed micro-steps of the closure
relation, any enabled unit at each, the log recording each unit as it runs. -/
inductive Reaches (hooks : Hooks) (ctx : Ctx) : Step.RunLog → State → Step.RunLog → State → Prop where
  | refl (log : Step.RunLog) (state : State) : Reaches hooks ctx log state log state
  | step {log log' : Step.RunLog} {unit : ClosureUnit} {key : UnitKey} {state middle after : State} :
      state.status = .running → fire hooks ctx unit state = some (.ok (key, middle)) →
      Reaches hooks ctx (log.record key) middle log' after → Reaches hooks ctx log state log' after

/-- No unit of the closure relation runs on `state`: the instance stopped running, or no unit is enabled. -/
def Complete (hooks : Hooks) (ctx : Ctx) (state : State) : Prop :=
  state.status ≠ .running ∨ ∀ unit, fire hooks ctx unit state = none

/-- A complete run of the closure relation from `state` under `log` with its outcome in `Step.settle`'s form: it reaches
a complete state (`ok`), or a unit enabled where it stopped fails (`error`). Probe P18's `Runs` over this relation. -/
inductive Runs (hooks : Hooks) (ctx : Ctx) : Step.RunLog → State → Except Failure (State × Step.RunLog) → Prop where
  | done {log log' : Step.RunLog} {state after : State} : Reaches hooks ctx log state log' after →
      Complete hooks ctx after → Runs hooks ctx log state (.ok (after, log'))
  | fail {log log' : Step.RunLog} {state before : State} {unit : ClosureUnit} {failure : Failure} :
      Reaches hooks ctx log state log' before → before.status = .running →
      fire hooks ctx unit before = some (.error failure) → Runs hooks ctx log state (.error failure)

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
renamed key, and the intents, each as a multiset. -/
structure Alike (ids : ScopeOccurrenceId → ScopeOccurrenceId) (keys : OccurrenceKey → OccurrenceKey) (left right : State) : Prop where
  status : left.status = right.status
  failure : left.failure = right.failure
  variables : ∃ matched : List ScopeVariables, matched.Perm right.variables ∧ matched.length = left.variables.length ∧
    ∀ pair ∈ left.variables.zip matched, pair.2.scope = ids pair.1.scope ∧ pair.1.entries.Perm pair.2.entries
  started : ((left.journal.flatMap (·.started)).map fun fact => keys fact.occurrence).Perm
    ((right.journal.flatMap (·.started)).map (·.occurrence))
  ended : ((left.journal.flatMap (·.ended)).map fun fact => (keys fact.1, fact.2)).Perm (right.journal.flatMap (·.ended))
  waits : ((openKeys left).map fun entry => (keys entry.1, entry.2)).Perm (openKeys right)
  intents : (left.intents.map fun intent => (intent.address, intent.variables, intent.businessKey)).Perm
    (right.intents.map fun intent => (intent.address, intent.variables, intent.businessKey))

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
    Step.advanceClock (Step.inputHead running).2.1 { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] } =
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
    Step.advanceClock (Step.inputHead running).2.1 { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] } =
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

/-- P6's commit side: under `orderInvariant` and the order-invariance premise, any two complete runs of the closure
relation (`Runs`) from where an attempted input's closure begins that both commit, commit results alike up to a
bijection of the identities and activations issued from that state on.

The runs start at a state a run reaches, not at any `Laws.State.WellFormed` state (P0's form), which is false:
`WellFormed` admits queues no run produces, and two flow tokens queued in the root of a sequential
`Start → User Task → Terminate End` process settle in one order beginning the User Task again before the End and in the
other ending the instance first, with no renaming relating the two journals (P6 design, witness W1). The order-invariance
argument rests on the queue having come from a run, so the start is reachable (root decision D1, 2026-11-15): the state
an attempted input's transition micro-step leaves on a committed state of a run, or the start's begin (`OpensAttempt`),
under the run log that records the input's micro-step, and the closure context `Step.step` gives that input. Schedules
are runs of the closure relation (probe P18), so no bijection of unit keys renames one schedule's queues into another's;
the results are compared once committed (`Step.orderJournal`). -/
def CommitsAgree (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (start left right : State) (outcome outcome' : Except Failure (State × Step.RunLog)),
    program.options.branchSchedule = .orderInvariant → Laws.Flow.Apart program → OpensAttempt hooks program input start →
    Runs hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start outcome →
    Runs hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start outcome' →
    Step.orderJournal start outcome = .ok left → Step.orderJournal start outcome' = .ok right →
    ∃ ids keys, ScopesRenamed start ids ∧ Activations start keys ∧ Alike ids keys left right

/-- P6's failure side, commit-or-refuse agreement (KD8's settle-agreement, T42): under `orderInvariant` and the
order-invariance premise, if one complete run of the closure of an attempted input commits, every complete run from
there commits. Probe P18's `failure_side_L0` is its shape through the real `Step.settle`.

It compares no failure's class or code: with two independently failing units in one closure, the run reports whichever
ran first, so the code may differ between schedules (P13 `both_fail_order`), and so may the class (P18
`fail_class_differs`: on the kernel, a Parallel split whose branches fail with `rolledBack` and `semanticFailure`).
Whether they must agree is the owner's open item P13 F4; the root recommends that they need not, a refused command
reporting one enabled failing unit's class and code, outside the order-invariant observation (BPMN orders no concurrent
failures). Runs carry no bound, so `Step.settle`'s own refusal by its bounds is outside this statement: by `SettleRuns`
a `settle` that fails where another schedule commits fails by its fuel or its work bound, and the work bound charges
each micro-step the size of the whole state, so one schedule can exceed it where another commits (KD8 finding 1, until
K3's created-entries measure). Not yet true of the kernel either: `Step.deferred` reads `State.crossed`, so whether a
unit fails can depend on which boundary the schedule crossed first (probes P01 and P13; DC8, until J retires it). -/
def FailureSideAgrees (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (start : State) (committed : State × Step.RunLog)
    (outcome : Except Failure (State × Step.RunLog)),
    program.options.branchSchedule = .orderInvariant → Laws.Flow.Apart program → OpensAttempt hooks program input start →
    Runs hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start (.ok committed) →
    Runs hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start outcome →
    ∃ other, outcome = .ok other

/-- The bridge from `Step.settle` to the closure relation (probe P18's `settle_runs` and `settle_fails`): under
`orderInvariant`, what `settle` commits from where an attempted input's closure begins is a complete run's outcome, and
a failure it reports other than its bounds' `closure-bound` is a unit's failure on a run. So the runs `SchedulesAgree`
compares include `settle`'s own. Statement only: open (#163). -/
def SettleRuns (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (start : State) (fuel work : Nat),
    program.options.branchSchedule = .orderInvariant → OpensAttempt hooks program input start →
    (∀ committed, Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel work
        (Step.RunLog.record {} (.ofRoot .input)) start = .ok committed →
      Runs hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start (.ok committed)) ∧
    ∀ failure, Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel work
        (Step.RunLog.record {} (.ofRoot .input)) start = .error failure → failure ≠ .unsupported "closure-bound" →
      Runs hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start (.error failure)

/-- P6: under `orderInvariant` and the order-invariance premise, the schedules of the closure of every attempted input
agree: those that commit commit results alike (`CommitsAgree`), and if one commits every one commits
(`FailureSideAgrees`). With `SettleRuns`, `Step.settle`'s fixed order is immaterial. Statement only: open (#163). -/
def SchedulesAgree (hooks : Hooks) : Prop := CommitsAgree hooks ∧ FailureSideAgrees hooks

/-- PC-HUM-04 (`DTB-COMMUTE-01`): a token to a None End beside a token entering an embedded Sub-Process commute under
`orderInvariant` (BPMN 2.0.2 §10.5.3, §13.5.6). Running either token first from a state that queues both, which a run
of the closure of a committed input reaches, extends to a complete run, so the former theorem is this lane under
`Laws.Flow.Apart` between `Step.settle`'s run and any other, with no premise about the pair's elements. -/
theorem endBesideEntry {hooks : Hooks} (agree : SchedulesAgree hooks) (bridge : SettleRuns hooks)
    (program : Program) (input : Input) (start state left right : State) (log : Step.RunLog)
    (committed : State × Step.RunLog) (outcome : Except Failure (State × Step.RunLog)) (fuel work : Nat)
    (toEnd toEntry : FlowId) (scope : ScopeOccurrenceId) (split : UnitKey)
    (_pair : Reaches hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start log
        state ∧
      state.queuedTokens[split.tokenUnit 0]? = some (.flow toEnd scope) ∧
      state.queuedTokens[split.tokenUnit 1]? = some (.flow toEntry scope))
    (invariant : program.options.branchSchedule = .orderInvariant) (separate : Laws.Flow.Apart program)
    (opens : Opens hooks program input start)
    (settled : Step.settle hooks (Laws.Step.inputCtx hooks program input) fuel work
      (Step.RunLog.record {} (.ofRoot .input)) start = .ok committed)
    (other : Runs hooks (Laws.Step.inputCtx hooks program input) (Step.RunLog.record {} (.ofRoot .input)) start outcome)
    (journalled : Step.orderJournal start (.ok committed) = .ok left)
    (journalled' : Step.orderJournal start outcome = .ok right) :
    ∃ ids keys, ScopesRenamed start ids ∧ Activations start keys ∧ Alike ids keys left right :=
  agree.1 program input start left right (.ok committed) outcome invariant separate (opensAttempt_of_opens opens)
    ((bridge program input start fuel work invariant (opensAttempt_of_opens opens)).1 committed settled) other journalled
    journalled'

end Kernel.Proofs.Concurrency
