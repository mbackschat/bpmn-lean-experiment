module

public import Kernel.Hooks
public import Kernel.Laws.State
import all Kernel.Feature.Data

/-! # Laws of Data

The rules of the [data semantics](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#interpretation), independent of
`Kernel.Feature.Data`'s and `Kernel.State`'s code: a read takes the first binding of its name from the reading scope
outward, a present null included; a write goes to the nearest scope occurrence of the instance that declares the name
and touches no other frame, and an item a Scope declares is written in its declaring occurrence; a name nobody declares
is the profile's `UndeclaredWrite`; a removal deletes the name from its nearest owner and is nothing for an undeclared
name; the value domain is stated over `Value`, and one value outside it rejects the whole input; and a failed mapping
source reads by its dialect.

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

/-! ## The value domain

The portable domain of the [data semantics](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#interpretation)
("Values") and of the portable-values contract it cites, stated over `Value` alone and independent of
`Kernel.Hooks.inValueDomain`. -/

/-- A Decimal in canonical spelling: zero only at scale 0, a signed 64-bit coefficient, scale `0..6`, and no trailing
zero at a positive scale, so `123450 × 10^-3` is outside rather than normalized. -/
def CanonicalDecimal (coefficient : Int) (scale : Nat) : Prop :=
  (coefficient = 0 → scale = 0) ∧ scale ≤ 6 ∧ -9223372036854775808 ≤ coefficient ∧
    coefficient ≤ 9223372036854775807 ∧ (0 < scale → coefficient % 10 ≠ 0)

/-- `value` is a portable value whose node lies `depth` containers below the root: an Integer `0..2^53 − 1`, a
canonical Decimal, a String of at most 1,024 UTF-8 bytes, a null or Boolean, or a List or Map at most four containers
deep with at most 32 members, each a portable value; Map keys are at most 1,024 UTF-8 bytes and strictly increasing
in Unicode-scalar order. A String List is no portable value at any depth. -/
inductive Portable : Nat → Value → Prop where
  | null (depth : Nat) : Portable depth .null
  | bool (depth : Nat) (value : Bool) : Portable depth (.bool value)
  | int (depth : Nat) (value : Int) : 0 ≤ value → value ≤ 9007199254740991 → Portable depth (.int value)
  | decimal (depth : Nat) (coefficient : Int) (scale : Nat) :
      CanonicalDecimal coefficient scale → Portable depth (.decimal coefficient scale)
  | string (depth : Nat) (text : String) : text.utf8ByteSize ≤ 1024 → Portable depth (.string text)
  | list (depth : Nat) (items : List Value) : depth < 4 → items.length ≤ 32 →
      (∀ item ∈ items, Portable (depth + 1) item) → Portable depth (.list items)
  | map (depth : Nat) (entries : List (String × Value)) : depth < 4 → entries.length ≤ 32 →
      entries.Pairwise (fun left right => left.1 < right.1) → (∀ entry ∈ entries, entry.1.utf8ByteSize ≤ 1024) →
      (∀ entry ∈ entries, Portable (depth + 1) entry.2) → Portable depth (.map entries)

mutual
/-- The tagged value nodes of a value, the root included; Map keys and entry wrappers are no nodes. -/
def nodes : Value → Nat
  | .list items => 1 + itemNodes items
  | .map entries => 1 + entryNodes entries
  | _ => 1

def itemNodes : List Value → Nat
  | [] => 0
  | item :: items => nodes item + itemNodes items

def entryNodes : List (String × Value) → Nat
  | [] => 0
  | (_, value) :: entries => nodes value + entryNodes entries
end

/-- The bytes one character takes inside a JSON string literal: two for a quote, a backslash and the five named
controls, six (`\u00XX`) for every other control, its UTF-8 bytes otherwise. -/
def charBytes (character : Char) : Nat :=
  if character = '"' ∨ character = '\\' ∨ character = '\x08' ∨ character = '\t' ∨ character = '\n' ∨
      character = '\x0c' ∨ character = '\r' then 2
  else if character.toNat < 0x20 then 6 else character.utf8Size

/-- A JSON string literal's bytes, quotes included. -/
def textBytes (text : String) : Nat := 2 + (text.toList.map charBytes).sum

/-- The decimal digits of `value`, counted with `fuel` divisions to spare. -/
def digitsWithin : Nat → Nat → Nat
  | 0, _ => 1
  | fuel + 1, value => if value < 10 then 1 else 1 + digitsWithin fuel (value / 10)

/-- The decimal digits of an Integer's canonical spelling, a minus sign included; a number has fewer digits than its
value, so the value is fuel enough. -/
def digitBytes (value : Int) : Nat :=
  (if value < 0 then 1 else 0) + digitsWithin value.natAbs value.natAbs

mutual
/-- The bytes of a portable value's canonical JSON: no whitespace, each node `{"kind":…,"value":…}` (a Decimal's
coefficient a string beside its scale), each Map entry `{"name":…,"value":…}`; each constant is the bytes of the
template its comment shows. A String List has no canonical value JSON; `Portable` excludes it before its measure is
read. -/
def jsonBytes : Value → Nat
  | .null => 15 -- {"kind":"null"}
  | .bool value => 27 + if value then 4 else 5 -- {"kind":"boolean","value":}
  | .int value => 27 + digitBytes value -- {"kind":"integer","value":}
  | .decimal coefficient scale => 42 + (2 + digitBytes coefficient) + digitBytes scale
    -- {"coefficient":,"kind":"decimal","scale":}
  | .string text => 26 + textBytes text -- {"kind":"string","value":}
  | .stringList _ => 0
  | .list items => 26 + itemBytes items + (items.length - 1) -- {"kind":"list","value":[]}
  | .map entries => 25 + entryBytes entries + (entries.length - 1) -- {"kind":"map","value":[]}

def itemBytes : List Value → Nat
  | [] => 0
  | item :: items => jsonBytes item + itemBytes items

def entryBytes : List (String × Value) → Nat
  | [] => 0
  | (name, value) :: entries => 18 + textBytes name + jsonBytes value + entryBytes entries -- {"name":,"value":}
end

/-- The `stringList` arm, admitted only as a whole variable value within its wire bounds: at most 32 Strings of at
most 1,024 UTF-8 bytes. -/
def WholeStringList : Value → Prop
  | .stringList items => items.length ≤ 32 ∧ ∀ text ∈ items, text.utf8ByteSize ≤ 1024
  | _ => False

/-- A value an input may carry: a portable root value of at most 256 nodes and 16,384 canonical JSON bytes, or a
`stringList` as a whole. -/
def InDomain (value : Value) : Prop :=
  (Portable 0 value ∧ nodes value ≤ 256 ∧ jsonBytes value ≤ 16384) ∨ WholeStringList value

/-- One value outside the domain rejects the whole input (`value-outside-domain`), so nothing of it is written; an
input wholly inside is admitted (`PBV-BOUND-01`). -/
def AdmitsWhole (values : List Value) (result : Except Failure Unit) : Prop :=
  ((∃ value ∈ values, ¬ InDomain value) → result = .error (.rejected "value-outside-domain")) ∧
  ((∀ value ∈ values, InDomain value) → result = .ok ())

/-! ## Mapping sources -/

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

def sampleMap : Value := .map [("a", .bool true), ("b", .decimal (-125) 2)]

theorem sample_map_portable : Portable 0 sampleMap :=
  .map 0 _ (by decide +kernel) (by decide +kernel) (by decide +kernel) (by decide +kernel) fun entry mem => by
    simp only [List.mem_cons, List.not_mem_nil, or_false] at mem
    rcases mem with rfl | rfl
    · exact .bool _ _
    · exact .decimal _ _ _ (by unfold CanonicalDecimal; decide +kernel)

theorem sample_map_in_domain : InDomain sampleMap :=
  .inl ⟨sample_map_portable, by simp [sampleMap, nodes, entryNodes],
    by simp [sampleMap, jsonBytes, entryBytes, textBytes, charBytes, digitBytes,
      show 'a'.utf8Size = 1 by decide +kernel, show 'b'.utf8Size = 1 by decide +kernel,
      show digitsWithin 125 125 = 3 by decide +kernel, show digitsWithin 2 2 = 1 by decide +kernel]⟩

theorem string_list_in_domain : InDomain (.stringList ["x"]) := .inr ⟨by decide +kernel, by decide +kernel⟩

/-- A value that is neither a whole `stringList` nor a portable root value is outside the domain. -/
theorem outside_of_portable {value : Value} (notWhole : ¬ WholeStringList value) (outside : ¬ Portable 0 value) :
    ¬ InDomain value := fun inside => by
  rcases inside with ⟨portable, _⟩ | whole
  · exact outside portable
  · exact notWhole whole

theorem negative_integer_outside : ¬ InDomain (.int (-1)) :=
  outside_of_portable nofun fun portable => by cases portable; omega

theorem unsafe_integer_outside : ¬ InDomain (.int 9007199254740992) :=
  outside_of_portable nofun fun portable => by cases portable; omega

theorem trailing_zero_outside : ¬ InDomain (.decimal 10 1) :=
  outside_of_portable nofun fun portable => by
    cases portable
    rename_i canonical
    exact canonical.2.2.2.2 (by decide +kernel) (by decide +kernel)

theorem unordered_keys_outside : ¬ InDomain (.map [("b", Value.null), ("a", Value.null)]) :=
  outside_of_portable nofun fun portable => by
    cases portable
    rename_i ordered _ _
    simp at ordered

theorem nested_string_list_outside : ¬ InDomain (.list [.stringList ["x"]]) :=
  outside_of_portable nofun fun portable => by
    cases portable
    rename_i members
    nomatch members (.stringList ["x"]) (by simp)

/-- Five containers along one path. -/
def fiveDeep : Value := .list [.list [.list [.list [.list []]]]]

theorem five_deep_outside : ¬ InDomain fiveDeep :=
  outside_of_portable nofun fun portable => by
    cases portable with | list _ _ _ _ first => ?_
    cases first (.list [.list [.list [.list []]]]) (by simp) with | list _ _ _ _ second => ?_
    cases second (.list [.list [.list []]]) (by simp) with | list _ _ _ _ third => ?_
    cases third (.list [.list []]) (by simp) with | list _ _ _ _ fourth => ?_
    cases fourth (.list []) (by simp) with | list _ _ shallow _ _ => ?_
    omega

theorem text_bytes_replicate (count : Nat) (character : Char) :
    textBytes (String.ofList (List.replicate count character)) = 2 + count * charBytes character := by
  simp only [textBytes, String.toList_ofList, List.map_replicate]
  induction count with
  | zero => simp
  | succ count step =>
    simp only [List.replicate_succ, List.sum_cons, Nat.succ_mul] at step ⊢
    omega

theorem list_bytes (items : List Value) : jsonBytes (.list items) = 26 + itemBytes items + (items.length - 1) := by
  simp only [jsonBytes]

/-- Three Strings whose JSON literals take 6,002 bytes each exceed the byte bound. The text stays a variable here:
a proof over the concrete String makes the kernel decode its UTF-8 bytes and exhausts the memory ceiling. -/
theorem oversized_of (text : String) (long : textBytes text = 6002) :
    ¬ InDomain (.list [.string text, .string text, .string text]) := fun inside => by
  rcases inside with ⟨_, _, bytes⟩ | whole
  · rw [list_bytes] at bytes
    simp only [itemBytes, jsonBytes, long, List.length_cons, List.length_nil] at bytes
    omega
  · exact whole

/-- 1,000 control characters: 1,000 UTF-8 bytes, within the String bound, and 6,002 JSON bytes. -/
def controls : String := String.ofList (List.replicate 1000 '\x01')

theorem controls_bytes : textBytes controls = 6002 :=
  (text_bytes_replicate 1000 '\x01').trans (by simp [charBytes])

theorem oversized_outside : ¬ InDomain (.list [.string controls, .string controls, .string controls]) :=
  oversized_of controls controls_bytes

theorem admits_inside : AdmitsWhole [sampleMap, .stringList ["x"]] (.ok ()) :=
  ⟨fun found => by
      obtain ⟨value, mem, outside⟩ := found
      simp only [List.mem_cons, List.not_mem_nil, or_false] at mem
      rcases mem with rfl | rfl
      · exact absurd sample_map_in_domain outside
      · exact absurd string_list_in_domain outside,
    fun _ => rfl⟩

theorem one_outside_rejects : AdmitsWhole [sampleMap, .int (-1)] (.error (.rejected "value-outside-domain")) :=
  ⟨fun _ => rfl, fun inside => absurd (inside (.int (-1)) (by simp)) negative_integer_outside⟩

/-- Admitting the inside part of an input with one value outside is rejected. -/
theorem partial_admission_rejected : ¬ AdmitsWhole [sampleMap, .int (-1)] (.ok ()) := fun law => by
  simpa using law.1 ⟨.int (-1), by simp, negative_integer_outside⟩

/-- Rejecting an input wholly inside is rejected. -/
theorem inside_rejected_rejected : ¬ AdmitsWhole [sampleMap] (.error (.rejected "value-outside-domain")) := fun law => by
  simpa using law.2 fun value mem => by simp at mem; subst mem; exact sample_map_in_domain

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
