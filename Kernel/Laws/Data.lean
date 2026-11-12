module

public import Kernel.Hooks
public import Kernel.Laws.State
import all Kernel.Feature.Data

/-! # Laws of Data

The rules of the [data semantics](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#interpretation), independent of
`Kernel.Feature.Data`'s and `Kernel.State`'s code: a read takes the first binding of its name from the reading scope
outward, a present null included; a write goes to the nearest scope occurrence of the instance that declares the name
and touches no other frame; a name nobody declares is the profile's `UndeclaredWrite`; a removal deletes the name from
its nearest owner and is nothing for an undeclared name; one value outside the domain rejects the whole input; and a
failed mapping source reads by its dialect.

The laws take the domain predicate, the profile's choice and the process's declaration as parameters, since computing
them is `Kernel.Hooks`' and the IL's. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Data

open Kernel
open Kernel.Laws.State (Within)

/-! ## Reads -/

/-- A read of `name` over the bindings visible from the reading scope occurrence, innermost first, gives the first
binding of the name, a present null included, and no value when none binds it (`NSD-READ-01`). -/
def Reads (visible : List (String × Value)) (name : String) (result : Option Value) : Prop :=
  (∀ value, result = some value →
    ∃ nearer rest, visible = nearer ++ (name, value) :: rest ∧ ∀ binding ∈ nearer, binding.1 ≠ name) ∧
  (result = none → ∀ binding ∈ visible, binding.1 ≠ name)

/-! ## Writes and removals -/

/-- `owner`'s own variables bind `name`. -/
def Declares (s : State) (owner : ScopeOccurrenceId) (name : String) : Prop :=
  ∃ frame ∈ s.variables, frame.scope = owner ∧ ∃ value, (name, value) ∈ frame.entries

/-- `owner` is the nearest scope occurrence from `scope` outward, within the instance rooted at `root`, that declares
`name`; a called instance's write never reaches its caller (`CVM-ISOLATE-01`). -/
def NearestOwner (s : State) (root scope : ScopeOccurrenceId) (name : String) (owner : ScopeOccurrenceId) : Prop :=
  Within s scope owner ∧ Within s owner root ∧ Declares s owner name ∧
    ∀ nearer, Within s scope nearer → Within s nearer owner → Declares s nearer name → nearer = owner

/-- `owner`'s frame exists and binds `name` to `value` alone. -/
def HoldsOnly (s : State) (owner : ScopeOccurrenceId) (name : String) (value : Value) : Prop :=
  (∃ frame ∈ s.variables, frame.scope = owner) ∧
    ∀ frame ∈ s.variables, frame.scope = owner → ∀ old, (name, old) ∈ frame.entries ↔ old = value

/-- Every frame but `owner`'s is the same before and after. -/
def OthersKept (before after : State) (owner : ScopeOccurrenceId) : Prop :=
  (∀ frame ∈ before.variables, frame.scope ≠ owner → frame ∈ after.variables) ∧
    ∀ frame ∈ after.variables, frame.scope ≠ owner → frame ∈ before.variables

/-- A write of `name` from `scope` reaches the nearest owner and replaces its value there, creating no local and
touching no other frame (`NSD-WRITE-01`). -/
def WritesNearest (root scope : ScopeOccurrenceId) (name : String) (value : Value) (owner : ScopeOccurrenceId)
    (before after : State) : Prop :=
  NearestOwner before root scope name owner → HoldsOnly after owner name value ∧ OthersKept before after owner

/-- A write of a name no frame of the instance declares goes to the instance root when its process declares the name
(`declared`, §10.4.1); otherwise the profile's `UndeclaredWrite` refuses it (`refused`, `undeclared-write`) or creates
it at the root as CIB does. -/
def UndeclaredWrite (declared refused : Bool) (root scope : ScopeOccurrenceId) (name : String) (value : Value)
    (before : State) (result : Except Failure State) : Prop :=
  (∀ owner, ¬ NearestOwner before root scope name owner) →
    (declared = false → refused = true → result = .error (.semanticFailure "undeclared-write")) ∧
    (declared = true ∨ refused = false → ∃ after, result = .ok after ∧ HoldsOnly after root name value ∧
      OthersKept before after root)

/-- A removal of `name` from `scope` deletes it from the nearest owner alone. -/
def RemovesNearest (root scope : ScopeOccurrenceId) (name : String) (owner : ScopeOccurrenceId) (before after : State) :
    Prop :=
  NearestOwner before root scope name owner →
    (∀ frame ∈ after.variables, frame.scope = owner → ∀ value, (name, value) ∉ frame.entries) ∧
    OthersKept before after owner

/-- Removing a name no frame of the instance declares changes no variable. -/
def RemovesNothing (root scope : ScopeOccurrenceId) (name : String) (before after : State) : Prop :=
  (∀ owner, ¬ NearestOwner before root scope name owner) → after.variables = before.variables

/-! ## Ingress and mapping sources -/

/-- One value outside the domain `inDomain` rejects the whole input (`value-outside-domain`), so nothing of it is
written; an input wholly inside is admitted (`PBV-BOUND-01`). -/
def AdmitsWhole (inDomain : Value → Bool) (values : List Value) (result : Except Failure Unit) : Prop :=
  ((∃ value ∈ values, inDomain value = false) → result = .error (.rejected "value-outside-domain")) ∧
  ((∀ value ∈ values, inDomain value = true) → result = .ok ())

/-- How a mapping whose source fails to evaluate with `code` reads, by its dialect: a Data Association's source is
unavailable, which neither ends the list nor yields a value; an input or output parameter rolls the command back with
the code (CIB-EXT-0024); a Call variable copies a present null (`CVM-IN-01`, `CVM-OUT-01`). -/
def FailedSource (dialect : MappingDialect) (code : String) (reading : Except Failure (Option Value)) : Prop :=
  (dialect = .dataAssociation → reading = .ok none) ∧
  (dialect = .ioParameter → reading = .error (.rolledBack code)) ∧
  (dialect = .callVariable → reading = .ok (some .null))

/-! ## Non-vacuity

The scopes of `Kernel.Laws.State`: the root scope 0 holds the Sub-Process's scope occurrence 2. The root declares `a`,
the Sub-Process `b`. -/

open Kernel.Laws.State (processRoot subScope rootScope childScope)

/-- A present null shadows an outer binding of its name. -/
theorem null_shadows : Reads [("a", .null), ("a", .int 1)] "a" (some .null) :=
  ⟨fun _ same => ⟨[], [("a", .int 1)], by simp_all, by simp⟩, fun absent => by simp at absent⟩

/-- Reading the outer binding behind a present null is rejected. -/
theorem outer_read_rejected : ¬ Reads [("a", .null), ("a", .int 1)] "a" (some (.int 1)) := fun law => by
  obtain ⟨nearer, rest, split, outside⟩ := law.1 _ rfl
  cases nearer
  · simp at split
  · rename_i first _
    simp at split
    exact outside first (by simp) (by simp [← split.1])

theorem absent_reads_nothing : Reads [("a", .int 1)] "b" none := ⟨fun _ none => by simp at none, fun _ => by simp⟩

def rootFrame (entries : List (String × Value)) : ScopeVariables := { scope := processRoot, entries }

def subFrame : ScopeVariables := { scope := subScope, entries := [("b", .int 2)] }

def framesWith (entries : List (String × Value)) : State :=
  { instanceId := "p", scopes := [rootScope, childScope], variables := [rootFrame entries, subFrame] }

def frames (rootValue : Value) : State := framesWith [("a", rootValue)]

theorem sub_within_root {v : Value} : Within (frames v) subScope processRoot :=
  .parent childScope processRoot processRoot (by simp [frames, framesWith]) rfl (.refl _)

/-- Only the root and the Sub-Process frame exist, so a frame other than the root's is the Sub-Process's. -/
theorem only_frames {entries : List (String × Value)} {frame : ScopeVariables}
    (mem : frame ∈ (framesWith entries).variables) (other : frame.scope ≠ processRoot) : frame = subFrame := by
  simp only [framesWith, List.mem_cons, List.not_mem_nil, or_false] at mem
  rcases mem with rfl | rfl
  · exact absurd rfl other
  · rfl

theorem root_owns_a {v : Value} : NearestOwner (frames v) processRoot subScope "a" processRoot :=
  ⟨sub_within_root, .refl _, ⟨rootFrame [("a", v)], by simp [frames, framesWith], rfl, v, by simp [rootFrame]⟩,
    fun nearer _ _ declares => by
      obtain ⟨frame, mem, owned, bound⟩ := declares
      obtain ⟨_, bound⟩ := bound
      simp only [frames, framesWith, List.mem_cons, List.not_mem_nil, or_false] at mem
      rcases mem with rfl | rfl
      · exact owned.symm
      · simp [subFrame] at bound⟩

/-- Rewriting the root's entries alone keeps every other frame. -/
theorem root_rewrite_keeps (old new : List (String × Value)) :
    OthersKept (framesWith old) (framesWith new) processRoot :=
  ⟨fun frame mem other => by rw [only_frames mem other]; simp [framesWith],
    fun frame mem other => by rw [only_frames mem other]; simp [framesWith]⟩

/-- The root frame of `framesWith entries` holds `name` alone with `value` when `entries` binds it so. -/
theorem root_holds {entries : List (String × Value)} {name : String} {value : Value}
    (only : ∀ old, (name, old) ∈ entries ↔ old = value) : HoldsOnly (framesWith entries) processRoot name value :=
  ⟨⟨rootFrame entries, by simp [framesWith], rfl⟩, fun frame mem owned old => by
    simp only [framesWith, List.mem_cons, List.not_mem_nil, or_false] at mem
    rcases mem with rfl | rfl
    · exact only old
    · simp [subFrame, subScope, processRoot] at owned⟩

theorem writes_nearest : WritesNearest processRoot subScope "a" (.int 5) processRoot (frames (.int 1)) (frames (.int 5)) :=
  fun _ => ⟨root_holds (by simp), root_rewrite_keeps _ _⟩

/-- A write that creates a local in the writing scope instead of reaching the owner is rejected. -/
theorem local_write_rejected :
    ¬ WritesNearest processRoot subScope "a" (.int 5) processRoot (frames (.int 1))
      { frames (.int 1) with variables := [rootFrame [("a", .int 1)], { subFrame with entries := [("b", .int 2), ("a", .int 5)] }] } :=
  fun law => by
    have := (law root_owns_a).1.2 (rootFrame [("a", .int 1)]) (by simp) rfl (.int 1)
    simp [rootFrame] at this

theorem nobody_declares_z : ∀ owner, ¬ NearestOwner (frames (.int 1)) processRoot subScope "z" owner :=
  fun _ nearest => by
    obtain ⟨frame, mem, _, bound⟩ := nearest.2.2.1
    obtain ⟨_, bound⟩ := bound
    simp only [frames, framesWith, List.mem_cons, List.not_mem_nil, or_false] at mem
    rcases mem with rfl | rfl <;> simp [rootFrame, subFrame] at bound

theorem undeclared_refused :
    UndeclaredWrite false true processRoot subScope "z" (.int 5) (frames (.int 1)) (.error (.semanticFailure "undeclared-write")) :=
  fun _ => ⟨fun _ _ => rfl, fun choice => by simp at choice⟩

/-- Creating an undeclared name the profile refuses is rejected. -/
theorem undeclared_created_rejected :
    ¬ UndeclaredWrite false true processRoot subScope "z" (.int 5) (frames (.int 1)) (.ok (frames (.int 1))) :=
  fun law => by simpa using (law nobody_declares_z).1 rfl rfl

def created : State := framesWith [("a", .int 1), ("z", .int 5)]

theorem undeclared_at_root :
    UndeclaredWrite false false processRoot subScope "z" (.int 5) (frames (.int 1)) (.ok created) :=
  fun _ => ⟨fun _ refused => by simp at refused,
    fun _ => ⟨created, rfl, root_holds (by simp), root_rewrite_keeps _ _⟩⟩

def removed : State := framesWith []

theorem removes_nearest : RemovesNearest processRoot subScope "a" processRoot (frames (.int 1)) removed :=
  fun _ => ⟨fun frame mem owned value => by
      simp only [removed, framesWith, List.mem_cons, List.not_mem_nil, or_false] at mem
      rcases mem with rfl | rfl
      · simp [rootFrame]
      · simp [subFrame, subScope, processRoot] at owned,
    root_rewrite_keeps _ _⟩

/-- A removal that leaves the owner's binding is rejected. -/
theorem kept_binding_rejected : ¬ RemovesNearest processRoot subScope "a" processRoot (frames (.int 1)) (frames (.int 1)) :=
  fun law => (law root_owns_a).1 (rootFrame [("a", .int 1)]) (by simp [frames, framesWith]) rfl (.int 1) (by simp [rootFrame])

theorem removes_nothing : RemovesNothing processRoot subScope "z" (frames (.int 1)) (frames (.int 1)) := fun _ => rfl

/-- Removing an undeclared name from another frame is rejected. -/
theorem removes_other_rejected : ¬ RemovesNothing processRoot subScope "z" (frames (.int 1)) removed :=
  fun law => by simpa [removed, frames, framesWith, rootFrame] using law nobody_declares_z

/-- The witnesses' domain: everything but a null. -/
def nonNull : Value → Bool
  | .null => false
  | _ => true

theorem one_outside_rejects : AdmitsWhole nonNull [.int 1, .null] (.error (.rejected "value-outside-domain")) :=
  ⟨fun _ => rfl, fun inside => by simpa [nonNull] using inside .null (by simp)⟩

/-- Admitting the inside part of an input with one value outside is rejected. -/
theorem partial_admission_rejected : ¬ AdmitsWhole nonNull [.int 1, .null] (.ok ()) := fun law => by
  simpa using law.1 ⟨.null, by simp, rfl⟩

theorem inside_admitted : AdmitsWhole nonNull [.int 1] (.ok ()) :=
  ⟨fun ⟨_, mem, outside⟩ => by simp at mem; subst mem; simp [nonNull] at outside, fun _ => rfl⟩

theorem association_unavailable : FailedSource .dataAssociation "unknown-variable" (.ok none) :=
  ⟨fun _ => rfl, nofun, nofun⟩

theorem parameter_rolls_back : FailedSource .ioParameter "unknown-variable" (.error (.rolledBack "unknown-variable")) :=
  ⟨nofun, fun _ => rfl, nofun⟩

theorem call_copies_null : FailedSource .callVariable "unknown-variable" (.ok (some .null)) :=
  ⟨nofun, nofun, fun _ => rfl⟩

/-- A parameter that reads its failed source as unavailable, a wait, is rejected. -/
theorem parameter_waits_rejected : ¬ FailedSource .ioParameter "unknown-variable" (.ok none) := fun law => by
  simpa using law.2.1 rfl

end Kernel.Laws.Data
