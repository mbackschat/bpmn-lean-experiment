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

The closure is proved through `WellFormed` itself, which holds between any two micro-steps of a closure: queued work
naming a scope occurrence an interruption removed (`Kernel/Step/Stale.lean`) keeps it, since `Laws.State.QueueSound`
asks only that what queued work names was issued, and is inert (`Laws.Step.perform_stale`). `stepKeepsWellFormed`
composes the per-hook and per-phase obligations of `Laws.Step` (`Laws.Step.HookContract`, `Laws.Step.Phases`) into
the invariant's preservation; what remains is to prove those obligations of `WellFormed`. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Proofs.State

open Kernel
open Kernel.Laws.State (WellFormed)

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

/-! ## The composition -/

/-- What the state operations `Step` applies do to the fields it reads (`Laws.State`). -/
theorem stateFacts : Laws.Step.StateFacts where
  found _ _ _ found := Laws.State.occurrence?_some found
  begun := Laws.State.beginOccurrence_mem
  startReserved _ _ sourceType member := Laws.State.startReserved_facts sourceType member
  closeOwnItems state id := by
    obtain ⟨scopes, occurrences, fewer, free⟩ := Laws.State.closeOwnItems_facts state id
    exact ⟨⟨scopes, fun occurrence member _ => occurrences ▸ member, fewer⟩, free⟩
  recordEnd := Laws.State.recordEnd_scopes
  setVariable := Laws.State.setVariable_frame
  removeVariable := Laws.State.removeVariable_frame
  declaring _ _ _ _ found := Laws.State.declaring?_stands found
  owner _ _ _ _ found := Laws.State.owner?_holds found
  instanceRoot := Laws.State.instanceRoot_stands

/-- What the state operations the hooks apply keep of `WellFormed` (`Laws.State`). -/
theorem operations : Laws.Step.Operations WellFormed where
  variablesHoused _ formed variables member := by
    obtain ⟨entry, inside, same⟩ := List.mem_map.mp (formed.owned.variableScopes variables member)
    exact ⟨entry, inside, same⟩
  rootStands _ formed := by
    obtain ⟨entry, inside, same⟩ := List.mem_map.mp formed.rooted.1
    exact ⟨entry, inside, same⟩
  setVariable _ _ _ _ formed stands := by
    obtain ⟨entry, inside, same⟩ := stands
    exact Laws.State.setVariable_wellFormed formed (List.mem_map.mpr ⟨entry, inside, same⟩)
  removeVariable _ _ _ formed := Laws.State.removeVariable_wellFormed formed

/-- `Step.endInstance` keeps `WellFormed` (`Laws.Step.Phases.endInstance`). -/
theorem endInstance_wellFormed {state : State} {status : InstanceStatus} {failure : Option InstanceFailure}
    (formed : WellFormed state) (recorded : failure.isSome = true ↔ status = .failed) :
    WellFormed (Step.endInstance status failure state) :=
  Laws.Step.endInstance_eq ▸ Laws.State.endInstance_wellFormed formed recorded

/-- The composition of the state-invariant lane: hooks that keep their contract (`Laws.Step.HookContract`) and the
phases of `Step` (`Laws.Step.Phases`) keep `WellFormed` through every committed input. -/
theorem stepKeepsWellFormed {hooks : Hooks} (contract : Laws.Step.HookContract hooks WellFormed)
    (phases : Laws.Step.Phases WellFormed) : StepKeepsWellFormed hooks :=
  fun _ _ _ _ formed ran => Laws.Step.step_keeps contract phases stateFacts
    (fun _ given => Option.some.inj given ▸ formed) ran

/-- A committed start makes a well-formed state, from the same obligations. -/
theorem startIsWellFormed {hooks : Hooks} (contract : Laws.Step.HookContract hooks WellFormed)
    (phases : Laws.Step.Phases WellFormed) : StartIsWellFormed hooks :=
  fun _ _ _ ran => Laws.Step.step_keeps contract phases stateFacts (fun _ given => by simp at given) ran

end Kernel.Proofs.State
