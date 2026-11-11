module

public import Kernel.Population

/-! # Laws of the population

The obligations of the [population semantics](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md) over its
result types, independent of the mechanisms that produce them: the command ledger binds each command identity once and
that first binding survives every replay, commands are numbered from 1, a fan-out spends at most its receiver budget,
receivers follow the explicit order or the linearization, and every started instance carries an identity its command
derives; and, over the fan-out machine, each snapshot is taken when its intent is reached and each committed receiver's
intents go first. The receiver budget is a parameter; the proof wave instantiates it with `cascadeBound` when it proves
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

end Kernel.Laws.Population
