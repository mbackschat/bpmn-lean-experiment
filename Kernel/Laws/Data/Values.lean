module

public import Kernel.Hooks

/-! # Laws of Data: the value domain and failed mapping sources

The portable value domain of the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#interpretation),
stated over `Value` alone: one value outside it rejects the whole input; and how a failed mapping source reads by its
dialect. Neither reads a state, so `Kernel.Laws.Hooks` states its helpers against them without importing the state laws
of `Kernel.Laws.Data`, which imports this module. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Data

open Kernel

/-! ## The value domain

The portable domain of the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#interpretation)
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
inductive Portable : Nat → Value → Prop where -- guard-exception(3): the portable domain over `Value`'s kinds, a law about values, not a copy of `JVal`.
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
  | .null | .bool _ | .int _ | .decimal _ _ | .string _ | .stringList _ => 1

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
  | .null | .bool _ | .int _ | .decimal _ _ | .string _ | .list _ | .map _ => False

/-- A value an input may carry: a portable root value of at most 256 nodes and 16,384 canonical JSON bytes, or a
`stringList` as a whole. -/
def InDomain (value : Value) : Prop :=
  (Portable 0 value ∧ nodes value ≤ 256 ∧ jsonBytes value ≤ 16384) ∨ WholeStringList value

/-- One value outside the domain rejects the whole input (`value-outside-domain`), so nothing of it is written; an
input wholly inside is admitted (`PBV-BOUND-01`). -/
def AdmitsWhole (values : List Value) (result : Except Failure Unit) : Prop :=
  ((∃ value ∈ values, ¬ InDomain value) → result = .error (.rejected "value-outside-domain")) ∧
  ((∀ value ∈ values, InDomain value) → result = .ok ())

/-! ## The measures, character by character

What the measures above count for one character and for an Integer's spelling, read from the core library's UTF-8
encoding and decimal digits, so `Kernel.Laws.Hooks` checks the executable byte census against them by proof. -/

/-- `charBytes` by code point. -/
theorem charBytes_eq (character : Char) : charBytes character =
    if character.toNat = 0x22 ∨ character.toNat = 0x5c ∨ character.toNat = 0x08 ∨ character.toNat = 0x09 ∨
      character.toNat = 0x0a ∨ character.toNat = 0x0c ∨ character.toNat = 0x0d then 2
    else if character.toNat < 0x20 then 6 else character.utf8Size := by
  simp only [charBytes, ← Char.toNat_inj]
  rfl

/-- A String's UTF-8 bytes are its characters' UTF-8 sizes. -/
theorem utf8ByteSize_eq (text : String) : text.utf8ByteSize = (text.toList.map Char.utf8Size).sum := by
  rw [← String.size_toByteArray, ← String.utf8Encode_toList, List.utf8Encode, List.size_toByteArray,
    List.length_flatMap]
  simp

theorem sum_map_ones {α : Type} (items : List α) (measure : α → Nat)
    (ones : ∀ item ∈ items, measure item = 1) :
    (items.map measure).sum = items.length := by
  induction items with
  | nil => rfl
  | cons item rest step =>
    simp only [List.map_cons, List.sum_cons, List.length_cons, ones item (by simp),
      step fun other mem => ones other (by simp [mem])]
    omega

/-- With fuel at least the value, `digitsWithin` counts the core library's decimal digits. -/
theorem digitsWithin_eq {fuel value : Nat} (enough : value ≤ fuel) :
    digitsWithin fuel value = (Nat.toDigits 10 value).length := by
  induction fuel generalizing value with
  | zero => cases Nat.le_zero.mp enough; rw [Nat.toDigits_zero]; rfl
  | succ fuel step =>
    rw [Nat.toDigits_eq_ite (by decide +kernel)]
    unfold digitsWithin
    split
    · rfl
    · rw [step (by omega)]; simp; omega

/-- An Integer's spelling: a minus sign for a negative one, then the decimal digits of its magnitude. -/
theorem toString_int_toList (value : Int) :
    (toString value).toList = (if value < 0 then ['-'] else []) ++ Nat.toDigits 10 value.natAbs := by
  rw [Int.toString_eq_repr, Int.repr_eq_ite]
  split
  · rename_i nonnegative
    simp [Int.not_lt.mpr nonnegative, show value.toNat = value.natAbs by omega]
  · rename_i negative
    simp [Int.not_le.mp negative, show (-value).toNat = value.natAbs by omega]

theorem spelled_length (value : Int) : (toString value).toList.length = digitBytes value := by
  rw [toString_int_toList, digitBytes, digitsWithin_eq (Nat.le_refl _)]
  split <;> simp <;> omega

/-- Every character of an Integer's spelling, a digit or the minus sign, takes one byte in UTF-8 and in a JSON
string literal. -/
theorem spelled_chars (value : Int) :
    ∀ character ∈ (toString value).toList, charBytes character = 1 ∧ character.utf8Size = 1 := by
  intro character mem
  have bounds : 0x2d ≤ character.toNat ∧ character.toNat ≤ 0x39 ∧ character.toNat ≠ 0x2e ∧
      character.toNat ≠ 0x2f := by
    rw [toString_int_toList] at mem
    have digit : character ∈ Nat.toDigits 10 value.natAbs → 0x30 ≤ character.toNat ∧ character.toNat ≤ 0x39 :=
      fun digits => by
        have spelled := Nat.isDigit_of_mem_toDigits (b := 10) (by decide +kernel) (by decide +kernel) digits
        simp only [Char.isDigit, Bool.and_eq_true, decide_eq_true_eq] at spelled
        exact ⟨spelled.1, spelled.2⟩
    split at mem
    · simp only [List.cons_append, List.nil_append, List.mem_cons] at mem
      rcases mem with rfl | digits
      · decide +kernel
      · have := digit digits; omega
    · have := digit (by simpa using mem); omega
  have one : character.utf8Size = 1 := Char.utf8Size_eq_one_iff.mpr (show character.toNat ≤ 0x7f by omega)
  refine ⟨?_, one⟩
  rw [charBytes_eq, one]
  split
  · omega
  · split <;> omega

/-- An Integer's spelling takes `digitBytes` UTF-8 bytes. -/
theorem toString_int_bytes (value : Int) : (toString value).utf8ByteSize = digitBytes value := by
  rw [utf8ByteSize_eq, sum_map_ones _ _ fun character mem => (spelled_chars value character mem).2, spelled_length]

theorem toString_nat_bytes (value : Nat) : (toString value).utf8ByteSize = digitBytes value := by
  have spelled := toString_int_bytes value
  rw [Int.toString_eq_repr, Int.repr_eq_ite] at spelled
  simpa using spelled

/-- An Integer's spelling as a JSON string literal takes its digits and two quotes. -/
theorem textBytes_int (value : Int) : textBytes (toString value) = 2 + digitBytes value := by
  rw [textBytes, sum_map_ones _ _ fun character mem => (spelled_chars value character mem).1, spelled_length]

/-! ## Mapping sources -/

/-- How a mapping whose source fails to evaluate with `code` reads, by its dialect: a Data Association's source is
unavailable, which neither ends the list nor yields a value; an input or output parameter rolls the command back with
the code (CIB-EXT-0024); a Call variable copies a present null (`CVM-IN-01`, `CVM-OUT-01`). -/
def FailedSource (dialect : MappingDialect) (code : String) (reading : Except Failure (Option Value)) : Prop :=
  (dialect = .dataAssociation → reading = .ok none) ∧
  (dialect = .ioParameter → reading = .error (.rolledBack code)) ∧
  (dialect = .callVariable → reading = .ok (some .null))

/-! ## Non-vacuity -/

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
