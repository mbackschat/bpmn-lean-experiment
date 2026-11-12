module

public import Kernel.Hooks
import all Kernel.Feature.Work

/-! # Laws of Work

The rules of the [work semantics](../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#service-tasks-and-effects) and the
[script semantics](../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md#selected-contract), independent of
`Kernel.Feature.Work`'s code: a Script Task's arguments are every visible variable once, its nearest owner's, nearest
owner first; its result patch is empty or names its result variable once, anything else rejected; an `unsupported`
effect result ends the input as `unsupported` with the host's code; a technical failure is `unsupported` unless the
profile opens incidents, and then the next incident generation; a retry naming another generation than the open
incident's is stale; and a business failure carries outputs only where the profile maps them on the error path.

The laws take the profile's choices as Booleans and name no profile or work constructor: each states one rule, and the
caller supplies the case. Where the Script result is written is `Kernel.Laws.Data`'s nearest-owner write, and a
snapshot entry's value is what that module's `Reads` gives for its name. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Work

open Kernel

/-! ## Script Tasks -/

/-- A Script Task's arguments over the bindings visible from its scope occurrence, innermost first (item 3): one entry
per visible name, in the order the names are first visible, each the first visible binding of its name. -/
def Snapshot (visible snapshot : List (String × Value)) : Prop :=
  snapshot.map (·.1) = (visible.map (·.1)).eraseDups ∧ ∀ entry ∈ snapshot, visible.find? (·.1 == entry.1) = some entry

/-- A Script Task's result patch (item 5 and the patch rule after it): the empty patch writes nothing, the one-entry
patch on the result variable is accepted, a name given twice is `duplicate-output`, and among distinct names one that
is not the result variable is `undeclared-output`. -/
def ScriptPatch (resultVariable : Option String) (patch : List (String × Value))
    (outcome : Except Failure (List (String × Value))) : Prop :=
  (patch = [] → outcome = .ok []) ∧
  (∀ name value, resultVariable = some name → patch = [(name, value)] → outcome = .ok [(name, value)]) ∧
  (¬ (patch.map (·.1)).Nodup → outcome = .error (.rejected "duplicate-output")) ∧
  ((patch.map (·.1)).Nodup → (∃ entry ∈ patch, resultVariable ≠ some entry.1) →
    outcome = .error (.rejected "undeclared-output"))

/-! ## Effect results -/

/-- An `unsupported` effect result ends the input as `unsupported` with the host's code, for every effect kind and
under every profile: a value or behavior the portable domain cannot represent is never a technical failure. -/
def UnsupportedResult {α : Type} (code : String) (outcome : Except Failure α) : Prop :=
  outcome = .error (.unsupported code)

/-- A technical failure (§13.3.3 defines only a fault): `unsupported` without incidents, else the incident of the next
generation, one more than the effect's failures so far (CIB-EXT-0013). -/
def TechnicalFailure (incidents : Bool) (failures : Nat) (generation : Except Failure Nat) : Prop :=
  (incidents = false → generation = .error (.unsupported "effect-technical-failure")) ∧
  (incidents = true → generation = .ok (failures + 1))

/-- A retry reopens the effect only when it names the open incident's generation; any other is stale, so a command
never resolves an incident its issuer did not observe. -/
def Retry (open_ named : Nat) (outcome : Except Failure Unit) : Prop :=
  (named = open_ → outcome = .ok ()) ∧ (named ≠ open_ → outcome = .error (.rejected "incident-generation-stale"))

/-- A business failure writes no outputs (§13.3.2) unless the profile maps them on the error path (`mapped`), so a
non-empty patch without that mapping is rejected. -/
def ErrorPathPatch (mapped : Bool) (patch : List (String × Value)) (outcome : Except Failure Unit) : Prop :=
  mapped = false → patch ≠ [] → outcome = .error (.rejected "error-path-outputs-not-accepted")

/-! ## Non-vacuity -/

/-- The witness of `script-effect.test.ts`: the Sub-Process's `b` shadows the root's. -/
theorem snapshot_nearest_first :
    Snapshot [("b", .string "inner"), ("a", .int 1), ("b", .string "outer")]
      [("b", .string "inner"), ("a", .int 1)] := by
  refine ⟨by decide +kernel, fun entry member => ?_⟩
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [List.find?]

/-- The shadowed value is rejected. -/
theorem snapshot_shadowed_rejected :
    ¬ Snapshot [("b", .string "inner"), ("a", .int 1), ("b", .string "outer")]
      [("b", .string "outer"), ("a", .int 1)] :=
  fun ⟨_, values⟩ => by simpa [List.find?] using values ("b", .string "outer") (by simp)

/-- A name given twice is rejected. -/
theorem snapshot_repeated_rejected : ¬ Snapshot [("a", .int 1)] [("a", .int 1), ("a", .int 1)] :=
  fun ⟨names, _⟩ => absurd names (by decide +kernel)

theorem patch_result : ScriptPatch (some "total") [("total", .int 2)] (.ok [("total", .int 2)]) :=
  ⟨nofun, fun _ _ _ same => by simp at same; simp [same], fun distinct => by simp at distinct,
    fun _ ⟨_, member, differs⟩ => by simp at member; simp [member] at differs⟩

theorem patch_empty : ScriptPatch none [] (.ok []) :=
  ⟨fun _ => rfl, fun _ _ _ => nofun, fun distinct => by simp at distinct, fun _ ⟨_, member, _⟩ => by simp at member⟩

/-- Writing a name without a result variable is rejected. -/
theorem patch_without_result_rejected : ¬ ScriptPatch none [("total", .int 2)] (.ok [("total", .int 2)]) :=
  fun law => by simpa using law.2.2.2 (by simp) ⟨("total", .int 2), by simp, by simp⟩

/-- Keeping the first of a twice-given result variable is rejected. -/
theorem patch_twice_rejected :
    ¬ ScriptPatch (some "total") [("total", .int 1), ("total", .int 2)] (.ok [("total", .int 1)]) :=
  fun law => by simpa using law.2.2.1 (by simp)

theorem unsupported_result :
    UnsupportedResult "result-outside-domain" (.error (.unsupported "result-outside-domain") : Except Failure Unit) :=
  rfl

/-- Turning an unsupported result into a technical failure's answer is rejected. -/
theorem unsupported_as_failure_rejected :
    ¬ UnsupportedResult "result-outside-domain"
      (.error (.unsupported "effect-technical-failure") : Except Failure Unit) := by
  simp [UnsupportedResult]

theorem failure_without_incidents : TechnicalFailure false 0 (.error (.unsupported "effect-technical-failure")) :=
  ⟨fun _ => rfl, nofun⟩

theorem failure_next_generation : TechnicalFailure true 1 (.ok 2) := ⟨nofun, fun _ => rfl⟩

/-- Reopening the generation already failed is rejected. -/
theorem failure_same_generation_rejected : ¬ TechnicalFailure true 1 (.ok 1) := fun law => by
  simpa using law.2 rfl

theorem retry_fresh : Retry 2 2 (.ok ()) := ⟨fun _ => rfl, fun differs => absurd rfl differs⟩

theorem retry_stale : Retry 2 1 (.error (.rejected "incident-generation-stale")) := ⟨nofun, fun _ => rfl⟩

/-- Retrying a stale generation is rejected. -/
theorem retry_stale_rejected : ¬ Retry 2 1 (.ok ()) := fun law => by simpa using law.2 (by decide +kernel)

theorem error_path_refused :
    ErrorPathPatch false [("x", .int 1)] (.error (.rejected "error-path-outputs-not-accepted")) :=
  fun _ _ => rfl

/-- Accepting an unmapped error path's outputs is rejected. -/
theorem error_path_accepted_rejected : ¬ ErrorPathPatch false [("x", .int 1)] (.ok ()) := fun law => by
  simpa using law rfl (by simp)

end Kernel.Laws.Work
