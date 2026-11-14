module

public import Kernel.Laws.Step
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

The invariant holds at input boundaries only: inside a closure `Kernel/Step/Stale.lean` lets a queued signal name a
scope occurrence an interruption already removed, so the closure is proved through a weaker invariant of its own, from
`Laws.Step.settle_induction`, that `WellFormed` follows from once the closure settles. Nothing executable imports this
module.
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

end Kernel.Proofs.State
