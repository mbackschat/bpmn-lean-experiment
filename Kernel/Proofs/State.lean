module

public import Kernel.Laws.Step
public import Kernel.Laws.Data
public import Kernel.Laws.Population

/-! # Proofs: the state invariant (P2)

The statements of the proof wave's state-invariant lane ([PLAN, P2](../../docs/PLAN.md#proof-wave)): `Step` and
`Population`'s calls of it keep `Laws.State.WellFormed`, through every feature's hooks and the closure loop. Each is
stated over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`. The state premise is
`WellFormed` of the before-state.

Two premises keep a new variable set keyed (`Laws.State.VariablesKeyed`). The input premise `InputNamesDistinct`: an
input binds each variable name at most once, which the codec enforces on every input it reads, since an object that
repeats a key is refused (`codec.duplicateField`, `Codec.parseStrict`, `Kernel/IL/Codec.lean:95-98`). The model premise `distinct`, a draft
named after [#147](https://github.com/mbackschat/bpmn-lean-experiment/issues/147): the variables an installer
(`State.initial`, `State.enterScope`) puts into a new scope occurrence bind each name at most once. P1 settles it, by
stating the admission premise per installer or by fixing the class once at the installer.

The invariant holds at input boundaries only: inside a closure `Kernel/Step/Stale.lean` lets a queued signal name a
scope occurrence an interruption already removed, so the closure is proved through a weaker invariant of its own, from
`Laws.Step.settle_induction`, that `WellFormed` follows from once the closure settles. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Proofs.State

open Kernel
open Kernel.Laws.State (WellFormed)

/-- A binding list names each variable at most once. -/
def NamesDistinct (bindings : List (String × Value)) : Prop :=
  (bindings.map (·.1)).Nodup

/-- Every binding list `input` carries names each variable at most once: a start's variables and its Signal trigger's,
a delivery's variables, a User Task completion's and a variable command's values, and an effect result's outputs. Read
by equality on `Input`'s constructors, whose matching `Kernel.Step` owns. -/
def InputNamesDistinct (input : Input) : Prop :=
  (∀ payload : StartInput, input = .start payload → NamesDistinct payload.variables ∧
    ∀ address variables, payload.trigger = .signal address variables → NamesDistinct variables) ∧
  (∀ payload : DeliveryInput, input = .deliver payload → NamesDistinct payload.variables) ∧
  (∀ (payload : CommandInput) values, input = .command payload →
    (payload.action = .completeUserTask values ∨ payload.action = .setVariables values) → NamesDistinct values) ∧
  ∀ (payload : EffectInput) outputs, input = .effectResult payload →
    (payload.outcome = .success outputs ∨ ∃ code message, payload.outcome = .businessFailure code message outputs) →
    NamesDistinct outputs

/-- Every binding list a population stimulus carries names each variable at most once: an instance input's, and a
Message publication's, a Signal broadcast's and a condition evaluation's variables. -/
def StimulusNamesDistinct (stimulus : Population.Stimulus) : Prop :=
  (∀ instanceId definitionRef commandId input, stimulus = .input instanceId definitionRef commandId input →
    InputNamesDistinct input) ∧
  ∀ command atMs digest, stimulus = .command command atMs digest →
    (∀ publication, command = .publish publication → NamesDistinct publication.variables) ∧
    (∀ broadcast, command = .broadcast broadcast → NamesDistinct broadcast.variables) ∧
    ∀ evaluation, command = .evaluateConditions evaluation → NamesDistinct evaluation.variables

/-- A committed input keeps the state well-formed. `distinct` is the draft premise of #147. -/
def StepKeepsWellFormed (hooks : Hooks) (distinct : Program → Prop) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State), distinct program → InputNamesDistinct input →
    WellFormed before → Step.step hooks program (some before) input = .ok after → WellFormed after

/-- A committed start makes a well-formed state. `distinct` is the draft premise of #147. -/
def StartIsWellFormed (hooks : Hooks) (distinct : Program → Prop) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), distinct program → InputNamesDistinct input →
    Step.step hooks program none input = .ok after → WellFormed after

/-- Every instance a committed population run holds is well-formed: `Population` reaches an instance only through
`Step.step`, from no state or from one it holds. `distinct` is the draft premise of #147, of every deployed program. -/
def PopulationKeepsWellFormed (hooks : Hooks) (distinct : Program → Prop) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    (∀ definitionRef ref program atMs, Population.Stimulus.deploy definitionRef ref program atMs ∈ stimuli →
      distinct program) →
    (∀ stimulus ∈ stimuli, StimulusNamesDistinct stimulus) →
    Population.runStimuli hooks admission stimuli = .ok result → ∀ instance_ ∈ result.instances, WellFormed instance_.state

end Kernel.Proofs.State
