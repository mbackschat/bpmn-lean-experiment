module

public import Kernel.Laws.Step.Inputs
public import Kernel.Laws.Data.Values

/-! # Proofs: the former lanes, values and mapping sources (P7)

The former theorems (`Kernel.Proofs.Former`) that read a value or a mapping source rather than a frame: an input
carrying a value outside the portable domain is rejected whole (PC-DATA-01), and a mapping whose source fails reads by
its dialect (PC-SCOPE-04, `CVM-IN-01`). They are stated over `Laws.Data.Values`, which reads no state, so this module
enters no feature's rebuild cone. Each closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`, or of every
context. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed)

/-- PC-DATA-01: an input carrying a value outside the portable domain (`Laws.Data.InDomain`) is rejected whole, before
any write (DATA-SEMANTICS-SPEC "Values"): a start's variables or a variable command's values. -/
def ValuesRejectedWhole (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before : Option State) (input : Input) (values : List (String × Value)),
    ((∃ payload : StartInput, input = .start payload ∧ payload.variables = values) ∨
      ∃ payload : CommandInput, input = .command payload ∧ payload.action = .setVariables values) →
    (∀ formed, before = some formed → WellFormed program formed) →
    (∃ binding ∈ values, ¬ Laws.Data.InDomain binding.2) →
    ∃ code, Step.step hooks program before input = .error (.rejected code)

/-- PC-SCOPE-04 (`CVM-IN-01`, `CVM-OUT-01`): a mapping whose source fails to evaluate reads by its dialect
(`Laws.Data.FailedSource`): a Data Association's makes its set unavailable, an input or output parameter's rolls the
command back with the evaluation's code (CIB-EXT-0024), and a Call variable's copies a present null (CIB-EXT-0021).
Stated of `Ctx.evaluateMappings` for one mapping, read at its target; it is the failed-source half of the former
snapshot theorem, whose installing half is `Kernel.Proofs.Former.CallInstallsSnapshot`. -/
def FailedSourcesRead : Prop :=
  ∀ (ctx : Ctx) (context : EvalContext) (mapping : Mapping) (code : String),
    ctx.evaluate context mapping.source = .failure code →
    Laws.Data.FailedSource mapping.dialect code
      ((fun read => read.bind (·.lookup mapping.target)) <$> ctx.evaluateMappings context [mapping])

/-! ## Proofs -/

/-- `ValuesRejectedWhole`, for every hooks record: the values are admitted before any hook runs
(`Laws.Step.step_refusesValues`), and admission refuses every value outside the domain
(`Laws.Hooks.inValueDomain_sound`). -/
theorem valuesRejectedWhole (hooks : Hooks) : ValuesRejectedWhole hooks := by
  intro program before input values submits _ outside
  obtain ⟨binding, mem, notIn⟩ := outside
  exact Laws.Step.step_refusesValues submits
    (Laws.Hooks.admitValues_rejects ⟨binding.2, List.mem_map_of_mem mem, notIn⟩)

end Kernel.Proofs.Former
