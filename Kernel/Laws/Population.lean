module

public import Kernel.Population

/-! # Laws of the population

The obligations of the [population semantics](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md) over its
result types, independent of the mechanisms that produce them: the command ledger binds each command identity once and
that first binding survives every replay, commands are numbered from 1, a fan-out spends at most its receiver budget,
receivers follow the explicit order or the linearization, and every started instance carries an identity its command
derives; over the fan-out machine, each snapshot is taken when its intent is reached and each committed receiver's
intents go first; and a Timer-start occurrence fires only at or after one of its due instants, while its deployment is
current and the occurrence unspent, under the identity of the occurrence. The receiver budget is a parameter; the proof wave instantiates it with `cascadeBound` when it proves
`Population.apply` against these laws.

A law names a public function of this family only where the specification spells out that function's output format, as
the derived instance identities `startedInstanceId`, `cascadeInstanceId` and `timerInstanceId`; never an evaluator
([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)).

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it. The witnesses read only the laws, never a population mechanism's body.
-/

@[expose] public section

namespace Kernel.Laws.Population

open Kernel Kernel.Population

/-! ## The command ledger -/

/-- The ledger keys each command identity once. -/
def LedgerKeyed (ledger : List LedgerEntry) : Prop :=
  (ledger.map (·.commandId)).Nodup

/-- Every binding the ledger held before is held after: a command's first binding survives. -/
def BindingsSurvive (before after : List LedgerEntry) : Prop :=
  ∀ entry ∈ before, entry ∈ after

/-- Commands are numbered in arrival order from 1; an instance input takes no ordinal. -/
def Numbered (steps : List StepResult) : Prop :=
  ∀ (index : Nat) (bound : index < steps.length), steps[index].ordinal = index + 1

/-- What a repeated command answers: the recorded resolution for equal content, else `command-content-mismatch`; the
digest is of the content without its logical time, since a retry arrives later. -/
def ReplayAnswers (entry : LedgerEntry) (digest : String) (resolution : Resolution) : Prop :=
  entry.digest = digest ∧ resolution = entry.result.resolution ∨
    entry.digest ≠ digest ∧ resolution = .rejected "command-content-mismatch"

/-- A command whose identity the ledger holds as `entry` answers under its own ordinal and time and changes nothing
else: no rematch and no second start (engine contract point 5). -/
structure Replays (before after : Progress) (entry : LedgerEntry) (digest : String) (atMs : Nat) : Prop where
  answer : ∃ resolution, ReplayAnswers entry digest resolution ∧
    after.steps = before.steps ++ [{ commandId := entry.commandId, ordinal := before.steps.length + 1, atMs, resolution }]
  registry : after.registry = before.registry
  deployments : after.deployments = before.deployments
  instances : after.instances = before.instances
  ledger : after.ledger = before.ledger
  occurrences : after.occurrences = before.occurrences
  inputFailures : after.inputFailures = before.inputFailures
  inputCascades : after.inputCascades = before.inputCascades

/-- A command whose identity the ledger does not hold is answered once and its answer bound under its digest. -/
structure Binds (before after : Progress) (commandId digest : String) (atMs : Nat) : Prop where
  fresh : commandId ∉ before.ledger.map (·.commandId)
  answer : ∃ resolution,
    let result : StepResult := { commandId, ordinal := before.steps.length + 1, atMs, resolution }
    after.steps = before.steps ++ [result] ∧ after.ledger = before.ledger ++ [{ commandId, digest, result }]

theorem Replays.survive {before after : Progress} {entry : LedgerEntry} {digest : String} {atMs : Nat}
    (replays : Replays before after entry digest atMs) : BindingsSurvive before.ledger after.ledger := by
  intro kept member
  rw [replays.ledger]
  exact member

theorem Binds.survive {before after : Progress} {commandId digest : String} {atMs : Nat}
    (binds : Binds before after commandId digest atMs) : BindingsSurvive before.ledger after.ledger := by
  intro kept member
  obtain ⟨_, _, ledger⟩ := binds.answer
  rw [ledger]
  exact List.mem_append_left _ member

theorem Binds.keyed {before after : Progress} {commandId digest : String} {atMs : Nat}
    (binds : Binds before after commandId digest atMs) (keyed : LedgerKeyed before.ledger) :
    LedgerKeyed after.ledger := by
  obtain ⟨_, _, ledger⟩ := binds.answer
  unfold LedgerKeyed at keyed ⊢
  rw [ledger, List.map_append, List.nodup_append]
  refine ⟨keyed, by simp, fun held member added single same => binds.fresh ?_⟩
  simp only [List.map_cons, List.map_nil, List.mem_singleton] at single
  exact single ▸ same ▸ member

theorem Replays.numbered {before after : Progress} {entry : LedgerEntry} {digest : String} {atMs : Nat}
    (replays : Replays before after entry digest atMs) (numbered : Numbered before.steps) : Numbered after.steps := by
  obtain ⟨_, _, steps⟩ := replays.answer
  intro index bound
  simp only [steps, List.length_append, List.length_singleton] at bound ⊢
  rcases Nat.lt_or_ge index before.steps.length with earlier | last
  · rw [List.getElem_append_left earlier]
    exact numbered index earlier
  · have : index = before.steps.length := by omega
    subst this
    simp

/-! ## Fan-out budget -/

/-- The entry that ends a fan-out past its receiver budget. -/
def BoundStop (entry : FanOutEntry) : Prop :=
  ∃ target, entry = .failed target (.unsupported "population-cascade-bound")

/-- No budget stop before the last entry. -/
def StopsLast (entries : List FanOutEntry) : Prop :=
  ∀ entry ∈ entries.dropLast, ¬ BoundStop entry

/-- At most `bound` receivers, cascades included, of which `passed` recorded no entry (a Conditional start whose
predicate is false still takes its receiver); the next receiver ends the fan-out as the budget stop, and the receivers
before it stay committed ([population, cascade bound](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts)). -/
def Budgeted (bound passed : Nat) (entries : List FanOutEntry) : Prop :=
  StopsLast entries ∧
    ((∀ entry ∈ entries, ¬ BoundStop entry) ∧ entries.length + passed ≤ bound ∨
      entries.length + passed = bound + 1 ∧ ∃ target,
        entries.getLast? = some (.failed target (.unsupported "population-cascade-bound")))

/-- A resolution's budget, `passed` receivers having recorded nothing. A `fanOut`'s entries are its receivers, a start's
`started` entry included; a `committed` cascade follows the delivery's target, which the budget does not count, so
every cascade receiver may spend it. -/
def ResolutionBudgeted (bound passed : Nat) : Resolution → Prop
  | .fanOut entries => Budgeted bound passed entries
  | .committed _ cascade => Budgeted bound passed cascade
  | .failed _ _ | .noMatch | .ambiguous | .rejected _ | .unsupported _ => True

/-- A command's budget: only an evaluation passes receivers, its false starts, whose count `EvaluationReaches` fixes;
every other command's receivers each record an entry. -/
def CommandBudgeted (bound : Nat) : Command → Resolution → Prop
  | .evaluateConditions _, resolution => ∃ passed, ResolutionBudgeted bound passed resolution
  | .publish _, resolution | .broadcast _, resolution | .timerStart _, resolution => ResolutionBudgeted bound 0 resolution

/-- Every command and every committed instance input of a run keeps the budget. A step result does not say which
command it answers, so a step may have passed receivers; an instance input's cascade reaches only Signal receivers, each
recording an entry. -/
def RunBudgeted (bound : Nat) (progress : Progress) : Prop :=
  (∀ step ∈ progress.steps, ∃ passed, ResolutionBudgeted bound passed step.resolution) ∧
    ∀ cascade ∈ progress.inputCascades, Budgeted bound 0 cascade.2

/-! ## Receiver order -/

/-- The receiver an entry reached. -/
def receiverOf : FanOutEntry → Receiver
  | .delivered target => .occurrence target
  | .started _ deploymentId _ startEvent => .start deploymentId startEvent
  | .skipped target => .occurrence target
  | .failed target _ => target

/-- A broadcast's explicit `order` is the order its own receivers are reached in, each leaving an entry (delivered,
skipped, failed or started); the cascades between them are interleaved depth-first, so the order is a sublist of what
was reached unless the budget stopped the fan-out (engine contract point 4). -/
def BroadcastFollowsOrder (order : List Receiver) (entries : List FanOutEntry) : Prop :=
  (∀ entry ∈ entries, ¬ BoundStop entry) → order.Sublist (entries.map receiverOf)

/-- An evaluation reaches its Conditional starts in `order` (the command's, else deploy and document order), each
taking one receiver of the budget: a start whose predicate is false (`falseStart`) records nothing, every other start its
entry, followed by the cascade it began. The first `considered` starts were reached, all of them unless the budget
stopped the fan-out ([population, Conditional start evaluations](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#conditional-start-evaluations)). -/
def EvaluationReaches (bound : Nat) (order : List Receiver) (falseStart : Receiver → Bool)
    (entries : List FanOutEntry) : Prop :=
  ∃ considered ≤ order.length,
    ((order.take considered).filter (!falseStart ·)).Sublist (entries.map receiverOf) ∧
    Budgeted bound ((order.take considered).filter falseStart).length entries ∧
    ((∀ entry ∈ entries, ¬ BoundStop entry) → considered = order.length)

/-- `first` may come before `second` in the defined linearization: waiting catches before starts, catches by instance
identifier, starts by deploy ordinal; `rank` orders the receivers within one instance (arming order) and within one
deployment (document order) ([CIB-INT-0030](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-int-0030--a-signal-reaches-a-snapshot-of-its-receivers-waiting-catches-by-instance-before-starts)). -/
def Precedes (rank : Receiver → Nat) : Receiver → Receiver → Prop
  | .occurrence first, .occurrence second =>
    first.processInstanceId < second.processInstanceId ∨
      first.processInstanceId = second.processInstanceId ∧ rank (.occurrence first) ≤ rank (.occurrence second)
  | .occurrence _, .start _ _ => True
  | .start _ _, .occurrence _ => False
  | .start firstDeployment firstEvent, .start secondDeployment secondEvent =>
    firstDeployment < secondDeployment ∨ firstDeployment = secondDeployment ∧
      rank (.start firstDeployment firstEvent) ≤ rank (.start secondDeployment secondEvent)

/-- A snapshot listed in the defined linearization. -/
def Linearized (rank : Receiver → Nat) (receivers : List Receiver) : Prop :=
  receivers.Pairwise (Precedes rank)

/-! ## Derived instance identity -/

/-- The entries a resolution reached. -/
def entriesOf : Resolution → List FanOutEntry
  | .fanOut entries => entries
  | .committed _ cascade => cascade
  | .failed _ _ | .noMatch | .ambiguous | .rejected _ | .unsupported _ => []

/-- Every instance a command or its cascade starts carries a derived identity: its command's own start's, the identity
of a start a throw in its cascade made, or, for a Timer start, the identity of the occurrence it fires, which no command
names. So a retry can never start a second instance (engine contract point 5,
[population, Timer starts](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#timer-starts)). -/
def StartsDerived (commandId : String) (entries : List FanOutEntry) : Prop :=
  ∀ entry ∈ entries, ∀ instanceId deploymentId version startEvent,
    entry = .started instanceId deploymentId version startEvent →
      instanceId = startedInstanceId commandId deploymentId startEvent ∨
        (∃ emitter, instanceId = cascadeInstanceId commandId deploymentId startEvent emitter) ∨
        ∃ dueMs, instanceId = timerInstanceId deploymentId startEvent dueMs

/-- No two instances of a run share an identity. -/
def InstancesKeyed (instances : List Instance) : Prop :=
  (instances.map (·.state.instanceId)).Nodup

/-- The identity laws of a run together: one ledger binding per command, ordinals from 1, unique instances, and every
started instance present under a derived identity. -/
structure RunKeyed (progress : Progress) : Prop where
  ledger : LedgerKeyed progress.ledger
  numbered : Numbered progress.steps
  instances : InstancesKeyed progress.instances
  derived : ∀ step ∈ progress.steps, StartsDerived step.commandId (entriesOf step.resolution)
  inputsDerived : ∀ cascade ∈ progress.inputCascades, StartsDerived cascade.1 cascade.2
  present : ∀ step ∈ progress.steps, ∀ entry ∈ entriesOf step.resolution, ∀ instanceId deploymentId version startEvent,
    entry = .started instanceId deploymentId version startEvent → instanceId ∈ progress.instances.map (·.state.instanceId)

/-! ## Fan-out placement -/

/-- A delivery's snapshot is taken when its intent reaches the head of the work list: its receivers, in the explicit
order when one is given, else as the linearization listed them, take the intent's place ahead of the work after it, so a
receiver armed later is not in it; nothing is recorded or spent (CIB-INT-0030). -/
structure SnapshotPlaced (before after : FanOutMachine) (receivers : List Receiver) (order : Option (List Receiver)) :
    Prop where
  placed : ∃ emitter intent rest, before.pending = .intent emitter intent :: rest ∧
    (order.getD receivers).Perm receivers ∧
    ∃ emission, after.pending = (order.getD receivers).map (.receiver (some emission)) ++ rest
  recorded : after.reversed = before.reversed
  budget : after.budget = before.budget
  stopped : after.stopped = before.stopped
  command : after.commandId = before.commandId

/-- A reached receiver's entry is recorded, newest first, and the intents its committed step left go first, depth-first,
ahead of the receivers still pending; it spends one receiver (CIB-INT-0033). -/
structure RecordPlaced (before after : FanOutMachine) (entry : FanOutEntry) (intents : List BroadcastIntent)
    (emitter : String) : Prop where
  placed : ∃ emission receiver rest, before.pending = .receiver emission receiver :: rest ∧
    after.pending = intents.map (.intent emitter) ++ rest
  recorded : after.reversed = entry :: before.reversed
  budget : after.budget + 1 = before.budget
  stopped : after.stopped = before.stopped
  command : after.commandId = before.commandId

/-! ## Timer starts

The due instants of a root Timer start, the verdict on firing one of its occurrences and what a committed firing
starts and consumes ([population, Timer starts](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#timer-starts),
CIB-INT-0029). Which instants a Cron expression matches is the parameter `cronMatch`, a match strictly after the
origin or after the match before it, since stating it needs the Cron fields' calendar, which `Kernel.IL.Timer` owns. -/

/-- `dueMs` is an occurrence of a start resolved as `resolved` whose schedule counts from `originMs`, its deployment's
deploy time: a duration `originMs + d`; a date its own instant, also before the origin; the `k`-th period after the
origin for `1 ≤ k ≤ n`, every `k ≥ 1` when unbounded (CIB-INT-0008); a Cron match strictly after the origin. -/
def DueInstant (cronMatch : String → Nat → Nat → Prop) (originMs dueMs : Nat) : Timer.Resolved → Prop
  | .duration ms => dueMs = originMs + ms
  | .date instantMs => dueMs = instantMs
  | .cycle periodMs repetitions =>
    0 < periodMs ∧ ∃ k, 1 ≤ k ∧ (∀ count, repetitions = some count → k ≤ count) ∧ dueMs = originMs + k * periodMs
  | .cron text => originMs < dueMs ∧ cronMatch text originMs dueMs

/-- An occurrence fires at `atMs` exactly when it is a due instant not later than `atMs`; one the schedule does not name
is `timer-occurrence-unknown`, a firing before its instant `timer-not-due`. -/
def FiringVerdict (cronMatch : String → Nat → Nat → Prop) (originMs dueMs atMs : Nat) (resolved : Timer.Resolved) :
    Option String → Prop
  | none => DueInstant cronMatch originMs dueMs resolved ∧ dueMs ≤ atMs
  | some code =>
    (¬ DueInstant cronMatch originMs dueMs resolved ∧ code = "timer-occurrence-unknown") ∨
      (DueInstant cronMatch originMs dueMs resolved ∧ atMs < dueMs ∧ code = "timer-not-due")

/-- No later registered deployment shares `deployment`'s key: the current deployment of a key is its last registered
one, in registration order. -/
def Current (registry : List DeploymentSummary) (deployment : DeploymentSummary) : Prop :=
  ∃ earlier later, registry = earlier ++ deployment :: later ∧ ∀ other ∈ later, other.key ≠ deployment.key

/-- The occurrence `fired` names already started an instance. -/
def Spent (consumed : List TimerOccurrence) (fired : TimerStart) : Prop :=
  ∃ occurrence ∈ consumed, occurrence.deploymentId = fired.deploymentId ∧ occurrence.startEvent = fired.startEvent ∧
    occurrence.dueMs = fired.dueMs

/-- The registry is keyed by deployment and each deployment's Timer starts by start Event, so the deployment and start
a verdict reads are the only ones. -/
def SummariesKeyed (registry : List DeploymentSummary) : Prop :=
  (registry.map (·.deploymentId)).Nodup ∧ ∀ deployment ∈ registry, (deployment.timerStarts.map (·.1)).Nodup

/-- The verdict on a `timerStart` at `atMs`, the first refusal in this order: `definition-not-deployed` for a deployment
not registered; `no-start-event` for a start that is not one of its root Timer starts; the firing verdict;
`timer-start-superseded` once another deployment of its key is current, as CIB deletes every Timer-start job of a key it
redeploys; `timer-start-occurrence-consumed` for a spent occurrence; else none, and it fires. -/
def TimerStartVerdict (cronMatch : String → Nat → Nat → Prop) (registry : List DeploymentSummary) (fired : TimerStart)
    (atMs : Nat) (consumed : List TimerOccurrence) (verdict : Option String) : Prop :=
  ((∀ deployment ∈ registry, deployment.deploymentId ≠ fired.deploymentId) ∧ verdict = some "definition-not-deployed") ∨
  ∃ deployment ∈ registry, deployment.deploymentId = fired.deploymentId ∧
    (((∀ start ∈ deployment.timerStarts, start.1 ≠ fired.startEvent) ∧ verdict = some "no-start-event") ∨
    ∃ resolved, (fired.startEvent, resolved) ∈ deployment.timerStarts ∧
      let firing := FiringVerdict cronMatch deployment.deployedAtMs fired.dueMs atMs resolved
      (∃ code, firing (some code) ∧ verdict = some code) ∨
      (firing none ∧ ¬ Current registry deployment ∧ verdict = some "timer-start-superseded") ∨
      (firing none ∧ Current registry deployment ∧ Spent consumed fired ∧
        verdict = some "timer-start-occurrence-consumed") ∨
      (firing none ∧ Current registry deployment ∧ ¬ Spent consumed fired ∧ verdict = none))

/-- What a `timerStart` resolves to: a refusal changes nothing; a firing is one entry, and a started one carries the
identity of the occurrence, `timer:<len>:<deploymentId>:<len>:<startEvent>:<dueMs>`, whatever the firing time or the
command, and consumes exactly that occurrence; a start the start step refuses is the failed entry and consumes nothing. -/
def TimerResolves (fired : TimerStart) (verdict : Option String) (before after : List TimerOccurrence)
    (resolution : Resolution) : Prop :=
  match verdict with
  | some code => resolution = .rejected code ∧ after = before
  | none =>
    (∃ version, resolution = .fanOut [.started (timerInstanceId fired.deploymentId fired.startEvent fired.dueMs)
        fired.deploymentId version fired.startEvent] ∧
      after = before ++ [{ deploymentId := fired.deploymentId, startEvent := fired.startEvent, dueMs := fired.dueMs }]) ∨
    (∃ receiver failure, resolution = .fanOut [.failed receiver failure] ∧ after = before)

/-! ## Non-vacuity -/

def refA : OccurrenceRef := { processInstanceId := "a", element := ⟨"Catch"⟩, activation := 1 }
def refB : OccurrenceRef := { processInstanceId := "b", element := ⟨"Catch"⟩, activation := 1 }
def stop : FanOutEntry := .failed (.occurrence refB) (.unsupported "population-cascade-bound")

theorem one_binding (result : StepResult) : LedgerKeyed [{ commandId := "c", digest := "d", result }] := by
  simp [LedgerKeyed]

theorem rebinding_rejected (result : StepResult) :
    ¬ LedgerKeyed [{ commandId := "c", digest := "d", result }, { commandId := "c", digest := "e", result }] := by
  simp [LedgerKeyed]

theorem replay_answers (progress : Progress) (entry : LedgerEntry) (atMs : Nat) :
    Replays progress { progress with steps := progress.steps ++
      [{ commandId := entry.commandId, ordinal := progress.steps.length + 1, atMs, resolution := entry.result.resolution }] }
      entry entry.digest atMs :=
  { answer := ⟨_, .inl ⟨rfl, rfl⟩, rfl⟩, registry := rfl, deployments := rfl, instances := rfl, ledger := rfl
    occurrences := rfl, inputFailures := rfl, inputCascades := rfl }

/-- A replay that starts another instance is no replay. -/
theorem second_start_rejected (progress : Progress) (entry : LedgerEntry) (digest : String) (atMs : Nat)
    (started : Instance) : ¬ Replays progress { progress with instances := started :: progress.instances } entry digest atMs :=
  fun replays => by simpa using replays.instances

theorem record_places_depth_first (intent : BroadcastIntent) :
    RecordPlaced { commandId := "c", pending := [.receiver none (.occurrence refA), .receiver none (.occurrence refB)], budget := 2 }
      { commandId := "c", pending := [.intent "a" intent, .receiver none (.occurrence refB)], reversed := [.delivered refA],
        budget := 1 }
      (.delivered refA) [intent] "a" :=
  { placed := ⟨_, _, _, rfl, rfl⟩, recorded := rfl, budget := rfl, stopped := rfl, command := rfl }

/-- Queueing a committed receiver's intents behind the pending receivers is breadth-first, not depth-first. -/
theorem breadth_first_rejected (intent : BroadcastIntent) :
    ¬ RecordPlaced { commandId := "c", pending := [.receiver none (.occurrence refA), .receiver none (.occurrence refB)], budget := 2 }
      { commandId := "c", pending := [.receiver none (.occurrence refB), .intent "a" intent], reversed := [.delivered refA],
        budget := 1 }
      (.delivered refA) [intent] "a" := fun placed => by
  obtain ⟨_, _, rest, facts⟩ := placed.placed
  obtain ⟨before, after⟩ := facts
  simp only [List.cons.injEq] at before
  obtain ⟨_, rfl⟩ := before
  simp at after

theorem snapshot_placed (intent : BroadcastIntent) (emission : Emission) :
    SnapshotPlaced { commandId := "c", pending := [.intent "a" intent], budget := 2 }
      { commandId := "c", pending := [.receiver (some emission) (.occurrence refB), .receiver (some emission) (.start 1 "S")],
        budget := 2 }
      [.occurrence refB, .start 1 "S"] none :=
  { placed := ⟨_, _, [], rfl, List.Perm.refl _, emission, rfl⟩, recorded := rfl, budget := rfl, stopped := rfl
    command := rfl }

/-- A receiver outside the snapshot, armed after it was taken, is not reached by the delivery. -/
theorem late_receiver_rejected (intent : BroadcastIntent) (emission : Emission) :
    ¬ SnapshotPlaced { commandId := "c", pending := [.intent "a" intent], budget := 2 }
      { commandId := "c", pending := [.receiver (some emission) (.occurrence refB),
          .receiver (some emission) (.start 1 "S"), .receiver (some emission) (.occurrence refA)], budget := 2 }
      [.occurrence refB, .start 1 "S"] none := fun placed => by
  obtain ⟨_, _, rest, facts⟩ := placed.placed
  obtain ⟨before, _, _, after⟩ := facts
  simp only [List.cons.injEq] at before
  obtain ⟨_, _, rfl⟩ := before
  simp at after

/-- Other content under a held identity answers the mismatch, never the recorded resolution, unless they coincide. -/
theorem mismatch_answer (entry : LedgerEntry) (resolution : Resolution) (other : entry.digest ≠ "other")
    (answers : ReplayAnswers entry "other" resolution) : resolution = .rejected "command-content-mismatch" := by
  rcases answers with ⟨same, _⟩ | ⟨_, rejected⟩
  · exact absurd same other
  · exact rejected

theorem within_budget : Budgeted 1 0 [.delivered refA] := by
  simp [Budgeted, StopsLast, BoundStop]

theorem stopped_at_budget : Budgeted 1 0 [.delivered refA, stop] := by
  simp [Budgeted, StopsLast, BoundStop, stop]

theorem over_budget_rejected : ¬ Budgeted 1 0 [.delivered refA, .delivered refB] := by
  simp [Budgeted, StopsLast]

theorem early_stop_rejected : ¬ Budgeted 2 0 [stop, .delivered refA] := by
  simp [Budgeted, StopsLast, BoundStop, stop]

/-- A passed receiver spends the budget: one false start leaves room for one entry of two, then the stop. -/
theorem passed_spends : Budgeted 2 1 [.delivered refA, stop] := by
  simp [Budgeted, StopsLast, BoundStop, stop]

theorem passed_over_budget_rejected : ¬ Budgeted 2 1 [.delivered refA, .delivered refB] := by
  simp [Budgeted, StopsLast]

/-- A delivery's target is not counted: its cascade may reach the whole budget, but no more. -/
theorem committed_cascade_budget : ResolutionBudgeted 1 0 (.committed refA [.delivered refB]) := by
  simp [ResolutionBudgeted, Budgeted, StopsLast, BoundStop]

theorem committed_over_budget_rejected : ¬ ResolutionBudgeted 1 0 (.committed refA [.delivered refA, .delivered refB]) := by
  simp [ResolutionBudgeted, Budgeted, StopsLast]

theorem follows_order : BroadcastFollowsOrder [.occurrence refA, .occurrence refB] [.delivered refA, .skipped refB] := by
  intro _
  simp [receiverOf]

theorem reversed_order_rejected :
    ¬ BroadcastFollowsOrder [.occurrence refA, .occurrence refB] [.delivered refB, .delivered refA] := by
  intro follows
  have reached := follows (by simp [BoundStop])
  have same := reached.eq_of_length (by simp)
  simp [receiverOf, refA, refB] at same

theorem catches_first (rank : Receiver → Nat) : Linearized rank [.occurrence refA, .occurrence refB, .start 1 "S"] := by
  simp [Linearized, Precedes, refA, refB]

theorem start_first_rejected (rank : Receiver → Nat) : ¬ Linearized rank [.start 1 "S", .occurrence refA] := by
  simp [Linearized, Precedes]

/-- No rank reorders instances: instance `b`'s catch never precedes instance `a`'s. -/
theorem instance_order_rejected (rank : Receiver → Nat) : ¬ Linearized rank [.occurrence refB, .occurrence refA] := by
  have later : ¬ "b" < "a" := by decide +kernel
  have other : "b" ≠ "a" := by decide +kernel
  simp [Linearized, Precedes, refA, refB, later, other]

/-- The arming order within one instance, read here as the activation. -/
def armingRank : Receiver → Nat
  | .occurrence ref => ref.activation
  | .start _ _ => 0

def refA2 : OccurrenceRef := { refA with activation := 2 }

theorem arming_order : Linearized armingRank [.occurrence refA, .occurrence refA2] := by
  simp [Linearized, Precedes, armingRank, refA, refA2]

theorem arming_order_rejected : ¬ Linearized armingRank [.occurrence refA2, .occurrence refA] := by
  simp [Linearized, Precedes, armingRank, refA, refA2]

def startS1 : Receiver := .start 1 "S1"
def startS2 : Receiver := .start 1 "S2"

/-- W2: start S1's predicate is false and S2's holds; S1 records nothing and still spends its receiver. -/
theorem false_start_passes :
    EvaluationReaches 2 [startS1, startS2] (· matches .start 1 "S1")
      [.started (startedInstanceId "c" 1 "S2") 1 1 "S2"] :=
  ⟨2, by simp, by simp [receiverOf, startS1, startS2], by simp [Budgeted, StopsLast, BoundStop, startS1, startS2],
    fun _ => rfl⟩

/-- A true start that records nothing is not an evaluation's reach. -/
theorem true_start_missing_rejected :
    ¬ EvaluationReaches 2 [startS1, startS2] (· matches .start 1 "S1") [] := by
  rintro ⟨considered, _, facts⟩
  obtain ⟨reached, _, all⟩ := facts
  have := all (by simp)
  subst this
  simp [startS1, startS2] at reached

theorem derived_start : StartsDerived "c" [.started (startedInstanceId "c" 1 "S") 1 1 "S"] := by
  intro entry member instanceId deploymentId version startEvent same
  simp only [List.mem_singleton] at member
  subst member
  cases same
  exact .inl rfl

/-- W1: a root Timer start `T` (`PT1M`) of deployment 1 deployed at 0, fired by `timerStart` at 60000, answers
`fanOut [started "timer:…"]`. -/
theorem timer_start_derived : StartsDerived "c" [.started (timerInstanceId 1 "T" 60000) 1 1 "T"] := by
  intro entry member instanceId deploymentId version startEvent same
  simp only [List.mem_singleton] at member
  subst member
  cases same
  exact .inr (.inr ⟨60000, rfl⟩)

theorem lost_binding_rejected (result : StepResult) :
    ¬ BindingsSurvive [{ commandId := "c", digest := "d", result }] [] := fun survive => by
  simpa using survive _ (List.mem_singleton_self _)

theorem duplicate_instances_rejected (started : Instance) : ¬ InstancesKeyed [started, started] := by
  simp [InstancesKeyed]

theorem empty_run_keyed : RunKeyed {} :=
  { ledger := by simp [LedgerKeyed], numbered := by simp [Numbered], instances := by simp [InstancesKeyed]
    derived := by simp, inputsDerived := by simp, present := by simp }

/-! ### Timer starts

A duration `PT0.5S` deployed at 1000, a cycle of period 100 with two repetitions deployed at 0, a Cron start whose
matches are a parameter, and two deployments 1 and 2 of the key `k`, each with the Timer start `T` (`PT1M`). -/

theorem duration_due (cronMatch : String → Nat → Nat → Prop) :
    FiringVerdict cronMatch 1000 1500 1600 (.duration 500) none :=
  ⟨rfl, by omega⟩

theorem duration_early (cronMatch : String → Nat → Nat → Prop) :
    FiringVerdict cronMatch 1000 1500 1400 (.duration 500) (some "timer-not-due") :=
  .inr ⟨rfl, by omega, rfl⟩

/-- An instant the schedule does not name never fires, however late. -/
theorem unnamed_instant_rejected (cronMatch : String → Nat → Nat → Prop) :
    ¬ FiringVerdict cronMatch 1000 1700 2000 (.duration 500) none := fun ⟨due, _⟩ => by
  simp [DueInstant] at due

theorem cycle_second_period (cronMatch : String → Nat → Nat → Prop) :
    DueInstant cronMatch 0 200 (.cycle 100 (some 2)) :=
  ⟨by omega, 2, by omega, fun count same => by cases same; omega, by omega⟩

/-- A third period of a cycle of two repetitions is no occurrence. -/
theorem cycle_third_rejected (cronMatch : String → Nat → Nat → Prop) :
    ¬ DueInstant cronMatch 0 300 (.cycle 100 (some 2)) := fun ⟨_, period⟩ => by
  obtain ⟨k, _, bounded, due⟩ := period
  have := bounded 2 rfl
  omega

/-- The origin is no occurrence of a cycle. -/
theorem cycle_origin_rejected (cronMatch : String → Nat → Nat → Prop) (repetitions : Option Nat) :
    ¬ DueInstant cronMatch 0 0 (.cycle 100 repetitions) := fun ⟨_, period⟩ => by
  obtain ⟨k, positive, _, due⟩ := period
  omega

theorem date_before_origin (cronMatch : String → Nat → Nat → Prop) : DueInstant cronMatch 5000 1000 (.date 1000) := rfl

/-- A Cron match at or before the origin is no occurrence. -/
theorem cron_at_origin_rejected (text : String) : ¬ DueInstant (fun _ _ _ => True) 1000 1000 (.cron text) :=
  fun ⟨after, _⟩ => by omega

def summaryOf (deploymentId : Nat) : DeploymentSummary :=
  { deploymentId, key := "k", keys := ["k"], namesAddress := false, messageCorrelation := .modeledKey
    messageStartNames := [], timerStarts := [("T", .duration 60000)] }

def redeployed : List DeploymentSummary := [summaryOf 1, summaryOf 2]

def firing (deploymentId dueMs : Nat) : TimerStart := { commandId := "c", deploymentId, startEvent := "T", dueMs }

def spentOnce : List TimerOccurrence := [{ deploymentId := 2, startEvent := "T", dueMs := 60000 }]

theorem redeployed_keyed : SummariesKeyed redeployed := by
  simp [SummariesKeyed, redeployed, summaryOf]

theorem current_fires (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 2 60000) 60000 [] none :=
  .inr ⟨summaryOf 2, by simp [redeployed], rfl, .inr ⟨.duration 60000, by simp [summaryOf, firing],
    .inr (.inr (.inr ⟨⟨rfl, by simp [firing]⟩, ⟨[summaryOf 1], [], rfl, by simp⟩,
      fun ⟨_, member, _⟩ => by simp at member, rfl⟩))⟩⟩

theorem undeployed (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 3 60000) 60000 [] (some "definition-not-deployed") :=
  .inl ⟨by simp [redeployed, summaryOf, firing], rfl⟩

theorem superseded (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 1 60000) 60000 [] (some "timer-start-superseded") :=
  .inr ⟨summaryOf 1, by simp [redeployed], rfl, .inr ⟨.duration 60000, by simp [summaryOf, firing],
    .inr (.inl ⟨⟨rfl, by simp [firing]⟩, fun ⟨earlier, later, split, after⟩ => by
      rcases earlier with _ | ⟨first, _ | ⟨second, rest⟩⟩
      · simp only [redeployed, List.nil_append, List.cons.injEq] at split
        exact after (summaryOf 2) (by simp [← split.2]) rfl
      · simp [redeployed, summaryOf] at split
      · simp [redeployed] at split, rfl⟩)⟩⟩

theorem consumed_refused (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 2 60000) 60000 spentOnce (some "timer-start-occurrence-consumed") :=
  .inr ⟨summaryOf 2, by simp [redeployed], rfl, .inr ⟨.duration 60000, by simp [summaryOf, firing],
    .inr (.inr (.inl ⟨⟨rfl, by simp [firing]⟩, ⟨[summaryOf 1], [], rfl, by simp⟩,
      ⟨spentOnce.head (by simp [spentOnce]), by simp [spentOnce], rfl, rfl, rfl⟩, rfl⟩))⟩⟩

/-- An instant the schedule does not name is refused as unknown before the deployment's supersession is read. -/
theorem unknown_before_superseded (cronMatch : String → Nat → Nat → Prop) :
    ¬ TimerStartVerdict cronMatch redeployed (firing 1 61000) 70000 [] (some "timer-start-superseded") := by
  rintro (⟨_, wrong⟩ | ⟨deployment, member, same, (⟨missing, wrong⟩ | ⟨resolved, start, verdict⟩)⟩)
  · simp at wrong
  · simp at wrong
  · simp only [redeployed, List.mem_cons, List.not_mem_nil, or_false] at member
    rcases member with rfl | rfl
    · simp only [summaryOf, firing, List.mem_singleton, Prod.mk.injEq, true_and] at start
      subst start
      rcases verdict with ⟨code, _, wrong⟩ | ⟨⟨due, _⟩, _⟩ | ⟨_, _, _, wrong⟩ | ⟨_, _, _, wrong⟩
      · cases wrong
        simp [FiringVerdict, DueInstant, firing, summaryOf] at *
      · simp [DueInstant, firing, summaryOf] at due
      · simp at wrong
      · simp at wrong
    · simp [summaryOf, firing] at same

theorem timer_started (version : Nat) :
    TimerResolves (firing 2 60000) none [] [{ deploymentId := 2, startEvent := "T", dueMs := 60000 }]
      (.fanOut [.started (timerInstanceId 2 "T" 60000) 2 version "T"]) :=
  .inl ⟨version, by simp [firing], by simp [firing]⟩

/-- An identity derived from the command, not the occurrence, is rejected. -/
theorem command_identity_rejected (version : Nat) (other : startedInstanceId "c" 2 "T" ≠ timerInstanceId 2 "T" 60000) :
    ¬ TimerResolves (firing 2 60000) none [] [{ deploymentId := 2, startEvent := "T", dueMs := 60000 }]
      (.fanOut [.started (startedInstanceId "c" 2 "T") 2 version "T"]) := by
  rintro (⟨_, same, _⟩ | ⟨_, _, wrong, _⟩)
  · simp only [firing, Resolution.fanOut.injEq, List.cons.injEq, FanOutEntry.started.injEq, and_true] at same
    exact other same.1
  · simp at wrong

/-- A refused start consumes nothing. -/
theorem refusal_consumes_rejected :
    ¬ TimerResolves (firing 2 60000) (some "timer-not-due") [] spentOnce (.rejected "timer-not-due") :=
  fun ⟨_, kept⟩ => by simp [spentOnce] at kept

end Kernel.Laws.Population
