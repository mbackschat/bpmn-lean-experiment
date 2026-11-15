module

public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.State.Begin
public import Kernel.Laws.State.Chain
public import Kernel.Laws.State.Variables
public import Kernel.Laws.Data
public import Kernel.Laws.Population

/-! # Proofs: the state invariant (P2)

The statements of the proof wave's state-invariant lane ([PLAN, P2](../../docs/PLAN.md#proof-wave)): `Step` and
`Population`'s calls of it keep `Laws.State.WellFormed`, through every feature's hooks and the closure loop. Each is
stated over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`. The state premise is
`WellFormed` of the before-state under the program the step runs, which the after-state keeps: `WellFormed` is relative
to the program, since which kind of item an element opens only the program says (`Laws.State.Typed`), and no instance
migrates between programs, as `Population` runs each under its deployment's.

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

The closure is proved through `WellFormed` itself, which holds between any two micro-steps of a closure: queued work
naming a scope occurrence an interruption removed (`Kernel/Step/Stale.lean`) keeps it, since `Laws.State.QueueSound`
asks only that what queued work names was issued, and is inert (`Laws.Step.perform_stale`). `stepKeepsWellFormed`
composes the per-hook and per-phase obligations of `Laws.Step` (`Laws.Step.HookContract`, `Laws.Step.Phases`,
`Laws.Step.PipelinePhases`) into the invariant's preservation. `Kernel.Proofs.Step` proves the phases of `WellFormed`
(`Kernel.Proofs.Step.phases`, `Kernel.Proofs.Step.pipelinePhases`) and the registered hooks' contract, and so the three
statements of `Registry.hooks` (`Kernel.Proofs.Step.registered_stepKeeps`, `Kernel.Proofs.Step.registered_startIs`,
`Kernel.Proofs.Step.registered_populationKeeps`).
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.State

open Kernel
open Kernel.Laws.State (WellFormed)

/-- A committed input keeps the state well-formed under the program it runs. -/
def StepKeepsWellFormed (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    WellFormed program before → Step.step hooks program (some before) input = .ok after → WellFormed program after

/-- A committed start makes a state well-formed under the program it runs. -/
def StartIsWellFormed (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State),
    Step.step hooks program none input = .ok after → WellFormed program after

/-- Every instance a committed population run holds is well-formed under its deployment's program: `Population`
reaches an instance only through `Step.step` of that program, from no state or from one it holds. -/
def PopulationKeepsWellFormed (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
      ∀ instance_ ∈ result.instances, WellFormed instance_.deployment.program instance_.state

/-! ## The composition -/

/-- Leaving scope occurrences keeps no scope occurrence or instance entry the state did not have. -/
private theorem leaveAll_kept : ∀ (scopes : List ScopeOccurrence) (t : State),
    (∀ entry ∈ (scopes.foldl (fun t entry => t.leaveScope entry.id) t).scopes, entry ∈ t.scopes) ∧
      ∀ entry ∈ (scopes.foldl (fun t entry => t.leaveScope entry.id) t).slots.instances, entry ∈ t.slots.instances
  | [], _ => ⟨fun _ kept => kept, fun _ kept => kept⟩
  | entry :: rest, t => by
    obtain ⟨scopes, instances⟩ := leaveAll_kept rest (t.leaveScope entry.id)
    obtain ⟨draft, cleared⟩ := Laws.State.clearInside_eq t entry.id []
    have left := (Laws.State.leaveScope_eq t entry.id).1
    refine ⟨fun found member => ?_, fun found member => ?_⟩
    · have inLeft := scopes found member
      rw [left, cleared] at inLeft
      exact (List.mem_filter.mp (List.mem_filter.mp inLeft).1).1
    · have inLeft := instances found member
      rw [Laws.State.leaveScope_slots_eq, cleared] at inLeft
      exact (List.mem_filter.mp inLeft).1

/-- What the state operations `Step` applies do to the fields it reads (`Laws.State`). -/
theorem stateFacts : Laws.Step.StateFacts where
  found _ _ _ found := Laws.State.occurrence?_some found
  begun := Laws.State.beginOccurrence_mem
  startReserved _ _ sourceType member := by
    obtain ⟨inside, begun, id, facts⟩ := Laws.State.startReserved_facts sourceType member
    obtain ⟨scope, scopes, element, slots⟩ := facts
    exact ⟨inside, begun, id, scope, scopes, element, by rw [slots]⟩
  closeOwnItems state id := by
    obtain ⟨scopes, occurrences, fewer, free⟩ := Laws.State.closeOwnItems_facts state id
    exact ⟨⟨scopes, fun occurrence member _ => occurrences ▸ member, fewer, fun _ kept => by
      rwa [Laws.State.closeOwnItems_eq] at kept⟩, free⟩
  recordEnd state key terminal := ⟨Laws.State.recordEnd_scopes state key terminal, by rw [Laws.State.recordEnd_eq]⟩
  reserve state element scope := by
    have reserves := Laws.State.reserve_reserves state element scope
    exact ⟨reserves.occurrences, reserves.kind, reserves.placed, reserves.id, reserves.scopes,
      by rw [Laws.State.reserve_slots]⟩
  removeOccurrence state id := by
    rw [Laws.State.removeOccurrence_eq]
    obtain ⟨scopes, instances⟩ := leaveAll_kept (state.scopes.filter (·.occurrence == some id))
      (Laws.State.withoutRecord state id)
    exact ⟨scopes, instances⟩
  setVariable := Laws.State.setVariable_frame
  removeVariable := Laws.State.removeVariable_frame
  declaring _ _ _ _ found := Laws.State.declaring?_stands found
  owner _ _ _ _ found := Laws.State.owner?_holds found
  instanceRoot := Laws.State.instanceRoot_stands
  parentBusy := Laws.State.busyScopes_parent

/-- What the state operations the hooks apply keep of `WellFormed` (`Laws.State`). -/
theorem operations : Laws.Step.Operations WellFormed where
  variablesHoused _ _ formed variables member := by
    obtain ⟨entry, inside, same⟩ := List.mem_map.mp (formed.owned.variableScopes variables member)
    exact ⟨entry, inside, same⟩
  rootStands _ _ formed := by
    obtain ⟨entry, inside, same⟩ := List.mem_map.mp formed.rooted.1
    exact ⟨entry, inside, same⟩
  setVariable _ _ _ _ _ formed stands := by
    obtain ⟨entry, inside, same⟩ := stands
    exact Laws.State.setVariable_wellFormed formed (List.mem_map.mpr ⟨entry, inside, same⟩)
  removeVariable _ _ _ _ formed := Laws.State.removeVariable_wellFormed formed

/-- `Step.endInstance` keeps `WellFormed` (`Laws.Step.Phases.endInstance`). -/
theorem endInstance_wellFormed {program : Program} {state : State} {status : InstanceStatus}
    {failure : Option InstanceFailure} (formed : WellFormed program state) (recorded : failure.isSome = true ↔ status = .failed) :
    WellFormed program (Step.endInstance status failure state) :=
  Laws.Step.endInstance_eq ▸ Laws.State.endInstance_wellFormed formed recorded

/-- The composition of the state-invariant lane: hooks that keep their contract (`Laws.Step.HookContract`) and the
phases of `Step` (`Laws.Step.Phases`, `Laws.Step.PipelinePhases`) keep `WellFormed` through every committed input. -/
theorem stepKeepsWellFormed {hooks : Hooks} (contract : Laws.Step.HookContract hooks WellFormed)
    (phases : Laws.Step.Phases WellFormed) (pipeline : Laws.Step.PipelinePhases WellFormed) : StepKeepsWellFormed hooks :=
  fun _ _ _ _ formed ran => Laws.Step.running_keeps contract phases stateFacts
    (Laws.Step.complete_keeps contract phases.toClosurePhases pipeline stateFacts) (Laws.State.reset_wellFormed formed) ran

/-- A committed start makes a well-formed state, from the same obligations and a well-formed fresh instance with its
root's Event Sub-Process starts queued for arming. -/
theorem startIsWellFormed {hooks : Hooks} (contract : Laws.Step.HookContract hooks WellFormed)
    (phases : Laws.Step.Phases WellFormed) (pipeline : Laws.Step.PipelinePhases WellFormed)
    (initial : ∀ program instanceId variables businessKey,
      WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root))) :
    StartIsWellFormed hooks :=
  fun program _ _ ran => Laws.Step.step_keeps contract phases stateFacts
    (Laws.Step.complete_keeps contract phases.toClosurePhases pipeline stateFacts) (fun _ _ => Laws.State.reset_wellFormed)
    (initial program) (fun _ given => by simp at given) ran

/-- A population run keeps every instance well-formed under its deployment's program when `Step.step` does
(`Laws.Population.runStimuli_held`). -/
theorem populationKeepsWellFormed {hooks : Hooks} (steps : StepKeepsWellFormed hooks) (starts : StartIsWellFormed hooks) :
    PopulationKeepsWellFormed hooks :=
  fun _ _ _ ran => Laws.Population.runStimuli_held ⟨steps, starts⟩ ran

end Kernel.Proofs.State
