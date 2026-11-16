module

public import Kernel.Hooks
public import Kernel.Laws.State.Derived
public import Kernel.Laws.Data.Values
public import Kernel.Feature.Data
import all Kernel.Feature.Data

/-! # Laws of Data

The rules of the [data semantics](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#interpretation), independent of
`Kernel.Feature.Data`'s and `Kernel.State`'s code: a read takes the first binding of its name from the reading scope
outward, a present null included; a write goes to the nearest scope occurrence of the instance that declares the name
and touches no other frame, and an item a Scope declares is written in its declaring occurrence; a name nobody declares
is the profile's `UndeclaredWrite`; and a removal deletes the name from its nearest owner and is nothing for an
undeclared name. The value domain and how a failed mapping source reads are stated in `Kernel.Laws.Data.Values`.

The laws take the profile's choice and the process's declaration as parameters, since computing them is the IL's.
Nothing executable imports this module.

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
    (declared = false → refused = true → result = .error (.semanticFailure .model "undeclared-write")) ∧
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

/-! ## Scope items -/

/-- The occurrence `target` is one of the Scope `element`. -/
def OccurrenceOf (s : State) (target : ScopeOccurrenceId) (element : ElementId) : Prop :=
  ∃ occurrence ∈ s.scopes, occurrence.id = target ∧ occurrence.element = some element

/-- `target` is the nearest occurrence of the Scope `element` from `scope` outward: the declaring occurrence of the items
`element` declares, for a site in `scope`. -/
def DeclaringOccurrence (s : State) (scope : ScopeOccurrenceId) (element : ElementId) (target : ScopeOccurrenceId) :
    Prop :=
  Within s scope target ∧ OccurrenceOf s target element ∧
    ∀ nearer, Within s scope nearer → Within s nearer target → OccurrenceOf s nearer element → nearer = target

/-- A write from `scope` of an item the Scope `element` declares lands in its declaring occurrence, whether that frame
binds it yet or not and whatever a nearer or outer frame binds to its identifier, and touches no other frame (BPMN 2.0.2
§10.4.1: data is referenced by element identity). -/
def WritesItem (scope : ScopeOccurrenceId) (element : ElementId) (name : String) (value : Value)
    (target : ScopeOccurrenceId) (before after : State) : Prop :=
  DeclaringOccurrence before scope element target → HoldsOnly after target name value ∧ OthersKept before after target

/-! ## The state invariant under Data's hooks

Data's share of the proof wave's state-invariant lane (P2): `Hooks.writeOutputs` and `Hooks.removeVariables` keep any
invariant `inv` that the variable operations keep, stated over `StateOps`, generic in `inv`, so the proof reads no
`Laws.State` law and no `Kernel.State` body; `Kernel.Proofs.Step` fills `StateOps` from `Laws.Step.Operations` and
`Laws.Step.StateFacts`. A write lands in a scope occurrence that stands: the writing scope occurrence for an `.own`
write, a declaring occurrence or owner a lookup found, or the instance root, the process root at worst (#121 refuses
queued work whose scope occurrence is gone). -/

/-- What Data's hooks need of the state operations they apply, for an invariant `inv`: what `inv` gives (every variable
set is housed, the process root stands), that a write to a standing scope occurrence and a removal keep `inv`, and the
invariant-free facts of the variable operations and the lookups the hooks read. -/
structure StateOps (inv : State → Prop) : Prop where
  housed : ∀ state, inv state → ∀ variables ∈ state.variables, ∃ entry ∈ state.scopes, entry.id = variables.scope
  rooted : ∀ state, inv state → ∃ entry ∈ state.scopes, entry.id = State.root
  set : ∀ state target name value, inv state → (∃ entry ∈ state.scopes, entry.id = target) →
    inv (state.setVariable target name value)
  remove : ∀ state target name, inv state → inv (state.removeVariable target name)
  setFrame : ∀ (state : State) target name value, (state.setVariable target name value).scopes = state.scopes ∧
    (state.setVariable target name value).occurrences = state.occurrences ∧
    (state.setVariable target name value).openItems = state.openItems
  removeFrame : ∀ (state : State) target name, (state.removeVariable target name).scopes = state.scopes ∧
    (state.removeVariable target name).occurrences = state.occurrences ∧
    (state.removeVariable target name).openItems = state.openItems
  declaring : ∀ (state : State) scope element found, state.declaring? scope element = some found →
    ∃ entry ∈ state.scopes, entry.id = found
  owner : ∀ (state : State) scope name found, state.owner? scope name = some found →
    ∃ variables ∈ state.variables, variables.scope = found
  instanceRoot : ∀ (state : State) scope,
    state.instanceRoot scope = State.root ∨ ∃ entry ∈ state.scopes, entry.id = state.instanceRoot scope

/-- One write lands as one `setVariable` on a scope occurrence that stands: an outward write on an owner or an instance
root, whether or not the scope occurrence it writes from stands. -/
private theorem write_lands {inv : State → Prop} (ops : StateOps inv) {ctx : Ctx} {rule : WriteRule}
    {scope : ScopeOccurrenceId} {state after : State} {binding : String × Value} (holds : inv state)
    (stands : rule = .own → ∃ entry ∈ state.scopes, entry.id = scope) (ran : Feature.Data.write ctx rule scope state binding = .ok after) :
    ∃ target, (∃ entry ∈ state.scopes, entry.id = target) ∧ after = state.setVariable target binding.1 binding.2 := by
  obtain ⟨name, value⟩ := binding
  have root : ∃ entry ∈ state.scopes, entry.id = state.instanceRoot scope := by
    rcases ops.instanceRoot state scope with same | standing
    · rw [same]; exact ops.rooted state holds
    · exact standing
  unfold Feature.Data.write at ran
  dsimp only at ran
  split at ran
  · exact ⟨scope, stands rfl, (Except.ok.inj ran).symm⟩
  · cases item : Feature.Data.itemOwner? ctx state scope name with
    | some owner =>
      simp only [item] at ran
      unfold Feature.Data.itemOwner? at item
      obtain ⟨_, _, declared⟩ := Option.bind_eq_some_iff.mp item
      exact ⟨owner, ops.declaring _ _ _ _ declared, (Except.ok.inj ran).symm⟩
    | none =>
      simp only [item] at ran
      cases nearest : state.owner? scope name with
      | some owner =>
        simp only [nearest] at ran
        obtain ⟨variables, member, same⟩ := ops.owner _ _ _ _ nearest
        exact ⟨owner, same ▸ ops.housed state holds variables member, (Except.ok.inj ran).symm⟩
      | none =>
        simp only [nearest] at ran
        repeat' split at ran
        all_goals first | exact ⟨_, root, (Except.ok.inj ran).symm⟩ | (simp at ran; done) | (simp_all; done)

/-- `Hooks.writeOutputs` of Data keeps `inv` from a scope occurrence that stands, or outward from any, and changes no
scope occurrence, occurrence or open item. -/
theorem writeOutputs_keeps {inv : State → Prop} (ops : StateOps inv) {ctx : Ctx} {scope : ScopeOccurrenceId}
    {writes : List (String × Value)} {rule : WriteRule} {state after : State} (holds : inv state)
    (stands : rule = .own → ∃ entry ∈ state.scopes, entry.id = scope)
    (ran : Feature.Data.writeOutputs ctx scope writes rule state = .ok after) :
    inv after ∧ after.scopes = state.scopes ∧ after.occurrences = state.occurrences ∧ after.openItems = state.openItems := by
  unfold Feature.Data.writeOutputs at ran
  induction writes generalizing state with
  | nil => simp only [List.foldlM_nil, pure, Except.pure] at ran; cases ran; exact ⟨holds, rfl, rfl, rfl⟩
  | cons binding rest ih =>
    simp only [List.foldlM_cons] at ran
    cases wrote : Feature.Data.write ctx rule scope state binding with
    | error failure => simp [wrote, bind, Except.bind] at ran
    | ok next =>
      simp only [wrote, bind, Except.bind] at ran
      obtain ⟨target, present, made⟩ := write_lands ops holds stands wrote
      subst made
      obtain ⟨scopes, occurrences, items⟩ := ops.setFrame state target binding.1 binding.2
      obtain ⟨kept, scopes', occurrences', items'⟩ :=
        ih (ops.set _ _ _ _ holds present) (fun own => scopes ▸ stands own) ran
      exact ⟨kept, scopes'.trans scopes, occurrences'.trans occurrences, items'.trans items⟩

/-- Whatever every variable write keeps, `Hooks.writeOutputs` of Data keeps: it applies only `State.setVariable`. -/
theorem writeOutputs_induction {ctx : Ctx} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {rule : WriteRule} {state after : State} (motive : State → Prop)
    (set : ∀ s target name value, motive s → motive (s.setVariable target name value)) (holds : motive state)
    (ran : Feature.Data.writeOutputs ctx scope writes rule state = .ok after) : motive after := by
  unfold Feature.Data.writeOutputs at ran
  induction writes generalizing state with
  | nil => simp only [List.foldlM_nil, pure, Except.pure] at ran; cases ran; exact holds
  | cons binding rest ih =>
    simp only [List.foldlM_cons] at ran
    cases wrote : Feature.Data.write ctx rule scope state binding with
    | error failure => simp [wrote, bind, Except.bind] at ran
    | ok next =>
      simp only [wrote, bind, Except.bind] at ran
      refine ih ?_ ran
      unfold Feature.Data.write at wrote
      dsimp only at wrote
      repeat' split at wrote
      all_goals first | (simp at wrote; done) | (cases wrote; exact set _ _ _ _ holds)

/-- `Hooks.removeVariables` of Data keeps `inv`. -/
theorem removeVariables_keeps {inv : State → Prop} (ops : StateOps inv) {ctx : Ctx} {scope : ScopeOccurrenceId}
    {names : List String} {state after : State} (holds : inv state)
    (ran : Feature.Data.removeVariables ctx scope names state = .ok after) : inv after := by
  unfold Feature.Data.removeVariables at ran
  cases ran
  induction names generalizing state with
  | nil => exact holds
  | cons name rest ih =>
    simp only [List.foldl_cons]
    apply ih
    split
    · exact ops.remove _ _ _ holds
    · exact holds

/-! ## Where Data's writes land

The former lanes' share (P7): the scope occurrence each write of `Hooks.writeOutputs` lands on, stated over the
searches of `Kernel.State` so that `Kernel.Proofs.Former` reads what they find through `Kernel.Laws.State.Chain`. -/

/-- Data's `Hooks.writeOutputs` applies its writes in order, each as one `State.setVariable` on the state the earlier
ones left: an `.own` write on the writing scope occurrence; an outward write on the declaring occurrence of its name's
item when the item's Scope has one on the way out (`State.declaring?`), else on the nearest scope occurrence that binds
the name (`State.owner?`), else on the instance root (`State.instanceRoot`), unless the profile refuses it. -/
theorem write_outward {ctx : Ctx} {scope : ScopeOccurrenceId} {writes : List (String × Value)} {rule : WriteRule}
    {state after : State} : Feature.Data.writeOutputs ctx scope writes rule state = .ok after →
    after = writes.foldl (fun s binding => s.setVariable (match rule with
      | .own => scope
      | .outward => (((ctx.program.itemScope? binding.1).bind (s.declaring? scope) <|> s.owner? scope binding.1).getD
          (s.instanceRoot scope))) binding.1 binding.2) state := by
  intro ran
  unfold Feature.Data.writeOutputs at ran
  induction writes generalizing state with
  | nil => simp only [List.foldlM_nil, pure, Except.pure] at ran; cases ran; rfl
  | cons binding rest ih =>
    simp only [List.foldlM_cons] at ran
    cases wrote : Feature.Data.write ctx rule scope state binding with
    | error failure => simp [wrote, bind, Except.bind] at ran
    | ok next =>
      simp only [wrote, bind, Except.bind] at ran
      rw [List.foldl_cons]
      refine (ih ran).trans (congrArg (fun start => rest.foldl _ start) ?_)
      obtain ⟨name, value⟩ := binding
      unfold Feature.Data.write at wrote
      cases rule with
      | own => exact (Except.ok.inj wrote).symm
      | outward =>
        simp only [Feature.Data.itemOwner?] at wrote
        dsimp only
        cases found : ((ctx.program.itemScope? name).bind (state.declaring? scope) <|> state.owner? scope name) with
        | some owner => simp only [found] at wrote; exact (Except.ok.inj wrote).symm
        | none =>
          simp only [found] at wrote
          repeat' split at wrote
          all_goals first | (simp at wrote; done) | exact (Except.ok.inj wrote).symm

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
    UndeclaredWrite false true processRoot subScope "z" (.int 5) (frames (.int 1)) (.error (.semanticFailure .model "undeclared-write")) :=
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

/-- The Sub-Process `Sub` declares the item `P`; the root binds the identifier `P` as a variable, and `Sub`'s frame does not
bind it yet. -/
def itemBefore : State := framesWith [("P", .int 1)]

def itemAfter : State :=
  { itemBefore with variables := [rootFrame [("P", .int 1)], { subFrame with entries := [("b", .int 2), ("P", .int 5)] }] }

/-- The root occurrence has no parent, so it lies inside no other occurrence. -/
theorem root_within {target : ScopeOccurrenceId} (within : Within itemBefore processRoot target) : target = processRoot :=
  (Within.parentless (fun scope mem same => by
    simp only [itemBefore, framesWith, List.mem_cons, List.not_mem_nil, or_false] at mem
    rcases mem with rfl | rfl
    · rfl
    · simp [childScope, subScope, processRoot] at same) within).symm

theorem sub_declares_p : DeclaringOccurrence itemBefore subScope ⟨"Sub"⟩ subScope :=
  ⟨.refl _, ⟨childScope, by simp [itemBefore, framesWith], rfl, rfl⟩, fun nearer _ inside _ => by
    cases inside with
    | refl => rfl
    | parent child parent _ member link within =>
      simp only [itemBefore, framesWith, List.mem_cons, List.not_mem_nil, or_false] at member
      rcases member with rfl | rfl
      · simp [rootScope] at link
      · simp only [childScope, Option.some.injEq] at link
        subst link
        exact absurd (root_within within) (by simp [subScope, processRoot])⟩

theorem writes_item : WritesItem subScope ⟨"Sub"⟩ "P" (.int 5) subScope itemBefore itemAfter := fun _ =>
  ⟨⟨⟨{ subFrame with entries := [("b", .int 2), ("P", .int 5)] }, by simp [itemAfter], rfl⟩, fun frame mem owned old => by
      simp only [itemAfter, List.mem_cons, List.not_mem_nil, or_false] at mem
      rcases mem with rfl | rfl
      · simp [rootFrame, subScope, processRoot] at owned
      · simp⟩,
    ⟨fun frame mem other => by
      simp only [itemBefore, framesWith, List.mem_cons, List.not_mem_nil, or_false] at mem
      rcases mem with rfl | rfl
      · simp [itemAfter]
      · exact absurd rfl other,
    fun frame mem other => by
      simp only [itemAfter, List.mem_cons, List.not_mem_nil, or_false] at mem
      rcases mem with rfl | rfl
      · simp [itemBefore, framesWith]
      · exact absurd rfl other⟩⟩

/-- A write the root's binding of the identifier captures, as a lookup by name would, is rejected. -/
theorem captured_item_write_rejected :
    ¬ WritesItem subScope ⟨"Sub"⟩ "P" (.int 5) subScope itemBefore (framesWith [("P", .int 5)]) := fun law => by
  have := (law sub_declares_p).1.2 subFrame (by simp [framesWith]) rfl (.int 5)
  simp [subFrame] at this

end Kernel.Laws.Data
