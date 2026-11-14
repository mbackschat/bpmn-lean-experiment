module

public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.Data
public import Kernel.Laws.Population

/-! # Proofs: the state invariant (P2)

The statements of the proof wave's state-invariant lane ([PLAN, P2](../../docs/PLAN.md#proof-wave)): `Step` and
`Population`'s calls of it keep `Laws.State.WellFormed`, through every feature's hooks and the closure loop. Each is
stated over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`. The state premise is
`WellFormed` of the before-state.

No premise on a binding list keeps the variable sets keyed (`Laws.State.VariablesKeyed`), which every input kind
reaches by one of two paths. A start's variables, and the locals of a Scope, an Event Sub-Process start (a delivery's
variables included), a Multi-Instance instance, a Call's called root and a compensation context, install through
`State.initial` and `State.enterScope`, which keep the last binding of each name (`keyed`, `Laws.State.keyed_names`,
[#147](https://github.com/mbackschat/bpmn-lean-experiment/issues/147)). Every other binding list an input carries, a
Signal start's variables, a delivery's variables at a catch, a User Task completion's and a variable command's values
and an effect result's outputs, is written one binding at a time through `State.setVariable`, which rebinds a name its
set holds (`Laws.State.setVariable_variablesKeyed`). A population stimulus reaches an instance only as one of these
inputs. The kernel's codecs do not refuse a repeated name: `codec.duplicateField` sees repeated object keys, never
repeated names in a binding array, and the scenario contract's canonical order is checked outside the kernel.

The closure is proved through `ClosureInvariant`, of which `WellFormed` is part: queued work naming a scope occurrence
an interruption removed (`Kernel/Step/Stale.lean`) breaks no clause of `WellFormed`, which reads no queued signal, and
is inert (`Laws.Step.perform_stale`), but the closure needs what `WellFormed` leaves unsaid of queued work, of the
input's start facts and of owned scope occurrences. `stepKeepsClosureInvariant` composes the per-hook and per-phase
obligations of `Laws.Step` (`Laws.Step.HookContract`, `Laws.Step.Phases`) into the invariant's preservation; what
remains is to prove those obligations. `StepKeepsWellFormed` follows only for a before-state that also keeps the
closure invariant's other clauses, which every committed input leaves (`unissued_arming`: `WellFormed` alone does not
give them). They are stated here, beside the lane, because `Laws.State` has neither the size nor the importer headroom
to take them (guard 15, the 800-line review target). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.State

open Kernel
open Kernel.Laws.State (WellFormed StartedOnce Within)

/-- A committed input keeps the state well-formed. -/
def StepKeepsWellFormed (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    WellFormed before → Step.step hooks program (some before) input = .ok after → WellFormed after

/-- A committed start makes a well-formed state. -/
def StartIsWellFormed (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), Step.step hooks program none input = .ok after → WellFormed after

/-- Every instance a committed population run holds is well-formed: `Population` reaches an instance only through
`Step.step`, from no state or from one it holds. -/
def PopulationKeepsWellFormed (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result → ∀ instance_ ∈ result.instances, WellFormed instance_.state

/-! ## The closure invariant

What holds between any two micro-steps of a closure (`Laws.Step.step_keeps`). `WellFormed` never breaks inside one:
the work stack it reads loses a removed subtree's tokens with it (`State.clearInside`). -/

/-- Every arming queued names an occurrence and a scope occurrence that were issued, so one that `Step.stale` lets run
finds them standing; every queued instance end records a failure exactly when it fails (`FailureRecorded`). The other
queued work checks what it names itself (`Step.requireScope`, `Step.gone`) or does nothing to what is gone. -/
structure QueueSound (s : State) : Prop where
  arm : ∀ host element scope, Signal.arm host element scope ∈ s.signals → host < s.nextIssue ∧ scope.value < s.nextIssue
  armScope : ∀ scope, Signal.armScope scope ∈ s.signals → scope.value < s.nextIssue
  armGateway : ∀ occurrence gateway scope, Signal.armGateway occurrence gateway scope ∈ s.signals →
    occurrence < s.nextIssue ∧ scope.value < s.nextIssue
  ends : ∀ status failure, Signal.endInstance status failure ∈ s.signals → (failure.isSome = true ↔ status = .failed)

/-- Every start fact of the input in progress counts an activation its counter has issued, so a fresh activation never
repeats one (`StartedOnce`, R8). -/
def StartsCounted (s : State) : Prop :=
  ∀ fact ∈ s.journal.flatMap (·.started) ++ s.draft.started, ∃ count ∈ s.activations,
    count.processInstance = fact.occurrence.processInstanceId ∧ count.element = fact.occurrence.element ∧
    count.role = fact.occurrence.role ∧ fact.occurrence.activation ≤ count.count

/-- A scope occurrence an occurrence owns lies directly below the scope occurrence that occurrence runs in, as every
caller of `State.enterScope` enters it, so removing an occurrence with what it owns leaves the scope occurrence it ran
in standing. -/
def OwnedBelow (s : State) : Prop :=
  ∀ scope ∈ s.scopes, ∀ occurrence ∈ s.occurrences, scope.occurrence = some occurrence.id →
    scope.parent = some occurrence.scope

/-- The closure invariant: `WellFormed` and what a committed input leaves besides. -/
structure ClosureInvariant (s : State) : Prop where
  formed : WellFormed s
  queue : QueueSound s
  counted : StartsCounted s
  owned : OwnedBelow s

/-! ### Non-vacuity

Over `Laws.State`'s sample instance. -/

section Witnesses

open Kernel.Laws.State

/-- The sample is closure-invariant. -/
theorem sample_closureInvariant (kind : OpenKind) : ClosureInvariant (sample kind) where
  formed := sample_wellFormed kind
  queue := ⟨by simp [sample], by simp [sample], by simp [sample], by simp [sample]⟩
  counted := by simp [StartsCounted, sample]
  owned := by
    simp only [OwnedBelow, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro scope (rfl | rfl) occurrence (rfl | rfl | rfl) owner <;>
      simp_all [rootScope, childScope, subProcess, innerTask, outerTask]

/-- A start fact pending without its counter breaks `StartsCounted`. -/
theorem uncounted_start_rejected (kind : OpenKind) :
    ¬ StartsCounted { sample kind with draft := { started := [startFact innerTask] }, activations := [] } :=
  fun counted => by
    obtain ⟨_, member, _⟩ := counted (startFact innerTask) (by simp)
    simp at member

/-- A Sub-Process scope owned by an occurrence of another scope occurrence breaks `OwnedBelow`. -/
theorem misplaced_owner_rejected (kind : OpenKind) :
    ¬ OwnedBelow { sample kind with occurrences := [{ subProcess with scope := subScope }, innerTask, outerTask] } :=
  fun owned => by
    have := owned childScope (by simp [sample]) { subProcess with scope := subScope } (by simp) (by simp [childScope, subProcess])
    simp [childScope, subScope, processRoot] at this

/-- An arming of a scope occurrence never issued breaks `QueueSound` while the state stays `WellFormed`, which reads no
queued signal: a well-formed state alone does not give the closure invariant. -/
theorem unissued_arming (kind : OpenKind) :
    WellFormed { sample kind with signals := [.armScope ⟨9⟩] } ∧
      ¬ QueueSound { sample kind with signals := [.armScope ⟨9⟩] } := by
  refine ⟨(sample_wellFormed kind).withSignals _, fun queue => ?_⟩
  · have := queue.armScope ⟨9⟩ (by simp)
    simp [sample] at this

end Witnesses

/-! ### Bridges -/

/-- Exit: a closure-invariant state is well-formed. -/
theorem ClosureInvariant.wellFormed {s : State} (holds : ClosureInvariant s) : WellFormed s := holds.formed

/-- Entry: an input on a running instance starts from its state with an empty journal and outbox (`Step.onRunning`),
which keeps the closure invariant. -/
theorem ClosureInvariant.reset {s : State} (holds : ClosureInvariant s) :
    ClosureInvariant { s with journal := [], outbox := [] } := by
  obtain ⟨formed, queue, counted, owned⟩ := holds
  have fewer : ∀ fact ∈ ([] : List Transition).flatMap (·.started) ++ s.draft.started,
      fact ∈ s.journal.flatMap (·.started) ++ s.draft.started := fun fact member => by
    simp only [List.flatMap_nil, List.nil_append] at member
    exact List.mem_append_right _ member
  refine ⟨⟨⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩,
    ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes⟩, ?_,
    ⟨formed.activations.keys, formed.activations.positive⟩, ?_, ⟨formed.owned.occurrenceScopes,
      formed.owned.itemScopes, formed.owned.itemOccurrences, formed.owned.attachments, formed.owned.scopeOwners,
      formed.owned.variableScopes, formed.owned.tokenScopes⟩, ?_, ⟨formed.variables.scopes, formed.variables.names⟩,
    formed.failure⟩, ⟨queue.arm, queue.armScope, queue.armGateway, queue.ends⟩,
    fun fact member => counted fact (fewer fact member), owned⟩
  · have once := formed.startedOnce
    unfold StartedOnce at once ⊢
    simp only [List.flatMap_nil, List.nil_append]
    exact once.sublist ((List.sublist_append_right _ _).map _)
  · intro occurrence member unbegun fact started
    exact formed.reservations occurrence member unbegun fact (fewer fact started)
  · obtain ⟨present, parentless, reach⟩ := formed.rooted
    exact ⟨present, parentless, fun scope member =>
      Within.congr (s := s) (t := { s with journal := [], outbox := [] }) rfl (reach scope member)⟩

/-- A well-formed state with nothing queued and no start fact of an input in progress is closure-invariant once its
owned scope occurrences lie below their owners: `OwnedBelow` is the one clause no quiet state gives. -/
theorem closureInvariant_of_quiet {s : State} (formed : WellFormed s) (quiet : s.signals = [])
    (unstarted : s.journal.flatMap (·.started) ++ s.draft.started = []) (owned : OwnedBelow s) :
    ClosureInvariant s where
  formed := formed
  queue := ⟨by simp [quiet], by simp [quiet], by simp [quiet], by simp [quiet]⟩
  counted := fun fact member => by simp [unstarted] at member
  owned := owned

/-! ## The composition -/

/-- A committed input keeps the closure invariant. -/
def StepKeepsClosureInvariant (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    ClosureInvariant before → Step.step hooks program (some before) input = .ok after → ClosureInvariant after

/-- What the state operations `Step` applies do to the fields it reads (`Laws.State`). -/
theorem stateFacts : Laws.Step.StateFacts where
  found _ _ _ found := Laws.State.occurrence?_some found
  begun := Laws.State.beginOccurrence_mem
  startReserved _ _ sourceType member := Laws.State.startReserved_facts sourceType member
  closeOwnItems state id := by
    obtain ⟨scopes, occurrences, fewer, free⟩ := Laws.State.closeOwnItems_facts state id
    exact ⟨⟨scopes, fun occurrence member _ => occurrences ▸ member, fewer⟩, free⟩
  recordEnd := Laws.State.recordEnd_scopes

/-- The composition of the state-invariant lane: hooks that keep their contract (`Laws.Step.HookContract`) and the
phases of `Step` (`Laws.Step.Phases`) keep the closure invariant through every committed input. -/
theorem stepKeepsClosureInvariant {hooks : Hooks} (contract : Laws.Step.HookContract hooks ClosureInvariant)
    (phases : Laws.Step.Phases ClosureInvariant) : StepKeepsClosureInvariant hooks :=
  fun _ _ _ _ holds ran => Laws.Step.step_keeps contract phases stateFacts
    (fun _ given => Option.some.inj given ▸ holds) ran

/-- A committed start makes a well-formed state, from the same obligations. -/
theorem startIsWellFormed {hooks : Hooks} (contract : Laws.Step.HookContract hooks ClosureInvariant)
    (phases : Laws.Step.Phases ClosureInvariant) : StartIsWellFormed hooks :=
  fun _ _ _ ran => (Laws.Step.step_keeps contract phases stateFacts (fun _ given => by simp at given) ran).wellFormed

/-- `StepKeepsWellFormed` from the same obligations, for a before-state that also keeps the closure invariant's other
clauses. -/
theorem stepKeepsWellFormed {hooks : Hooks} (contract : Laws.Step.HookContract hooks ClosureInvariant)
    (phases : Laws.Step.Phases ClosureInvariant) {program : Program} {input : Input} {before after : State}
    (formed : WellFormed before) (queue : QueueSound before) (counted : StartsCounted before)
    (owned : OwnedBelow before) (ran : Step.step hooks program (some before) input = .ok after) :
    WellFormed after :=
  (stepKeepsClosureInvariant contract phases program input before after ⟨formed, queue, counted, owned⟩ ran).wellFormed

end Kernel.Proofs.State
