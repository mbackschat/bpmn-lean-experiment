module

public import Kernel.Hooks
public import Kernel.Laws.Data.Values
public import Kernel.Laws.State.Items
import all Kernel.Hooks

/-! # Laws of the hooks module

What `Kernel.Hooks`' shared helpers compute, for the proofs that need a helper's value rather than its name. This is the
one module that sees `Kernel.Hooks`' bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
a helper enters here when a proof first needs it. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Hooks

open Kernel

/-- An expression evaluated from `scope` reads the variables visible from it and the logical time. -/
theorem evalContext_eq (state : State) (program : Program) (scope : ScopeOccurrenceId) :
    state.evalContext program scope = { variables := state.visible program scope, nowMs := state.logicalTimeMs } := by
  simp only [State.evalContext]

/-- A held occurrence joins `FeatureSlots.held`; nothing else changes. -/
theorem hold_eq (state : State) (held : Held) :
    state.hold held = { state with slots := { state.slots with held := state.slots.held ++ [held] } } := by
  simp only [State.hold]

/-- The item an input addresses is one of the state's open items, and its element, its occurrence's activation and
its instance are the ones the input's reference names. -/
theorem itemDetail?_some {α : Type} {ctx : Ctx} {state : State} {ref : OccurrenceRef} {detail : WaitView → Option α}
    {item : OpenItem} {value : α} (found : itemDetail? ctx state ref detail = some (item, value)) :
    item ∈ state.items ∧ ctx.program.publicId item.element = ref.element ∧
      (state.occurrence? item.id.occurrence).map (·.activation) = some ref.activation ∧
      state.instanceOf item.scope = ref.processInstanceId := by
  unfold itemDetail? at found
  obtain ⟨candidate, member, made⟩ := List.exists_of_findSome?_eq_some found
  split at made
  · rename_i matches_
    obtain ⟨_, _, same⟩ := Option.map_eq_some_iff.mp made
    obtain ⟨rfl, _⟩ := Prod.mk.inj same
    simp only [Bool.and_eq_true, beq_iff_eq] at matches_
    exact ⟨Laws.State.mem_itemsByPosition.mp member, matches_.1.1, matches_.1.2, matches_.2⟩
  · simp at made

theorem itemDetail?_mem {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef}
    {detail : WaitView → Option α} {item : OpenItem} {value : α}
    (found : itemDetail? ctx state occurrence detail = some (item, value)) : item ∈ state.items :=
  (itemDetail?_some found).1

theorem item?_mem {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef} {detail : WaitView → Option α}
    {item : OpenItem} (found : item? ctx state occurrence detail = some item) : item ∈ state.items := by
  unfold item? at found
  obtain ⟨⟨_, value⟩, made, same⟩ := Option.map_eq_some_iff.mp found
  cases same
  exact itemDetail?_mem made

/-- The start `chooseStart` picks is one of the fired starts. -/
theorem chooseStart_mem {named : Option ElementId} {fired : List ElementId} {start : ElementId}
    (chosen : chooseStart named fired = .ok start) : start ∈ fired := by
  unfold chooseStart at chosen
  split at chosen
  · split at chosen
    · rename_i listed
      cases chosen
      simpa using listed
    · cases chosen
  · cases chosen
    exact List.mem_singleton_self _
  · cases chosen
  · cases chosen

/-- The item an input addresses has the detail it was looked up by. -/
theorem itemDetail?_view {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef}
    {detail : WaitView → Option α} {item : OpenItem} {value : α}
    (found : itemDetail? ctx state occurrence detail = some (item, value)) : detail item.kind.view = some value := by
  unfold itemDetail? at found
  obtain ⟨candidate, _, made⟩ := List.exists_of_findSome?_eq_some found
  split at made
  · obtain ⟨_, same, pair⟩ := Option.map_eq_some_iff.mp made
    obtain ⟨rfl, rfl⟩ := Prod.mk.inj pair
    exact same
  · simp at made

theorem item?_view {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef} {detail : WaitView → Option α}
    {item : OpenItem} (found : item? ctx state occurrence detail = some item) : (detail item.kind.view).isSome = true := by
  unfold item? at found
  obtain ⟨⟨_, value⟩, made, same⟩ := Option.map_eq_some_iff.mp found
  cases same
  simp [itemDetail?_view made]

/-- How a boundary fires (`Boundary.fire`): an interrupting one cancels its host first, if it names one; then the
reservation completes, or a fresh occurrence occurs. -/
theorem fire_eq (boundary : Boundary) (host reserved : Option Nat) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (state : State) : boundary.fire host reserved scope writes state =
      (if boundary.interrupting then host.elim state (state.signal <| .cancel ·) else state).signal
        (reserved.elim (.occur boundary.id scope (.flows boundary.outgoing) writes .outward)
          (.complete · (.flows boundary.outgoing) writes .outward)) := by
  unfold Boundary.fire
  cases boundary.interrupting <;> cases host <;> cases reserved <;> rfl

/-- No item is found where no item detail is. -/
theorem item?_none {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef} {detail : WaitView → Option α}
    (none_ : itemDetail? ctx state occurrence detail = none) : item? ctx state occurrence detail = none := by
  simp [item?, none_]

/-- Admitting command values fails only by rejecting a value outside the value domain. -/
theorem admitValues_error {values : List Value} {failure : Failure} (refused : admitValues values = .error failure) :
    failure = .rejected "value-outside-domain" := by
  unfold admitValues at refused
  split at refused
  · cases refused
  · exact (Except.error.inj refused).symm

/-- A List's members are its items and a String List's are its texts as Strings, in order. -/
theorem collectionItems_lists {value : Value} {outputs : List Value}
    (lists : value = .list outputs ∨ ∃ texts, value = .stringList texts ∧ texts.map .string = outputs) :
    collectionItems value = some outputs := by
  rcases lists with rfl | ⟨texts, rfl, rfl⟩ <;> rfl

/-! ## The value domain and failed mapping sources

What `inValueDomain` and `Ctx.evaluateMappings` compute, against `Kernel.Laws.Data.Values`' statements of the portable
value domain and of a failed mapping source. -/

/-- A fold over a byte array folds its bytes in order. -/
private theorem foldl_data {β : Type} (f : β → UInt8 → β) (init : β) (bytes : ByteArray) :
    bytes.foldl f init = bytes.data.toList.foldl f init := by
  have loop : ∀ k j (b : β), j + k = bytes.size →
      ByteArray.foldlM.loop (m := Id) (pure <| f · ·) bytes bytes.size (Nat.le_refl _) k j b =
        pure ((bytes.data.toList.drop j).foldl f b) := by
    intro k
    induction k with
    | zero =>
      intro j b sum
      unfold ByteArray.foldlM.loop
      have : bytes.data.toList.length ≤ j := by rw [Array.length_toList, ByteArray.size_data]; omega
      simp [List.drop_eq_nil_of_le this]
    | succ k step =>
      intro j b sum
      unfold ByteArray.foldlM.loop
      have lt : j < bytes.size := by omega
      have lt' : j < bytes.data.toList.length := by rw [Array.length_toList, ByteArray.size_data]; exact lt
      simp only [lt, ↓reduceDIte, pure_bind]
      rw [step (j + 1) _ (by omega), List.drop_eq_getElem_cons lt']
      simp [ByteArray.getElem_eq_getElem_data]
  unfold ByteArray.foldl ByteArray.foldlM
  simp only [Nat.le_refl, ↓reduceDIte, Nat.sub_zero]
  exact congrArg Id.run (loop bytes.size 0 init (by simp))

private theorem foldl_bytes {β : Type} (f : β → UInt8 → β) (init : β) (bytes : List UInt8) :
    bytes.toByteArray.foldl f init = bytes.foldl f init := by
  rw [foldl_data]; simp

/-- Every byte of a character above ASCII's UTF-8 encoding is at least `0x80`: a lead or continuation byte. -/
private theorem encode_high {c : Char} (high : 0x7f < c.toNat) :
    ∀ byte ∈ String.utf8EncodeChar c, 0x80 ≤ byte.toNat := by
  intro byte mem
  unfold String.utf8EncodeChar at mem
  simp only [Char.toNat] at high
  dsimp only at mem
  split at mem
  · omega
  split at mem
  · simp only [List.mem_cons, List.not_mem_nil, or_false] at mem
    rcases mem with rfl | rfl <;> simp <;> omega
  split at mem
  · simp only [List.mem_cons, List.not_mem_nil, or_false] at mem
    rcases mem with rfl | rfl | rfl <;> simp <;> omega
  · simp only [List.mem_cons, List.not_mem_nil, or_false] at mem
    rcases mem with rfl | rfl | rfl | rfl <;> simp <;> omega

/-- A per-byte census over the UTF-8 encoding of `chars` sums each character's own census. -/
private theorem foldl_census (g : UInt8 → Nat) (acc : Nat) (chars : List Char)
    (each : ∀ c, ((String.utf8EncodeChar c).map g).sum = Laws.Data.charBytes c) :
    (chars.flatMap String.utf8EncodeChar).foldl (fun total byte => total + g byte) acc =
      acc + (chars.map Laws.Data.charBytes).sum := by
  induction chars generalizing acc with
  | nil => simp
  | cons c rest step =>
    simp only [List.flatMap_cons, List.foldl_append, List.map_cons, List.sum_cons, step, ← each c]
    suffices ∀ (bytes : List UInt8) acc,
        bytes.foldl (fun total byte => total + g byte) acc = acc + (bytes.map g).sum by
      rw [this]; omega
    intro bytes
    induction bytes with
    | nil => simp
    | cons b bs ih => intro acc; simp only [List.foldl_cons, ih, List.map_cons, List.sum_cons]; omega

/-- `stringBytes`' census over UTF-8 bytes counts what `Laws.Data.textBytes` counts over characters: an ASCII byte
is its own character, escaped or not, and every byte of a longer encoding is at least `0x80`, so it counts one. -/
theorem stringBytes_eq (text : String) : stringBytes text = Laws.Data.textBytes text := by
  unfold stringBytes Laws.Data.textBytes
  rw [String.toUTF8_eq_toByteArray, ← String.utf8Encode_toList, List.utf8Encode, foldl_bytes]
  refine foldl_census _ 2 _ fun c => ?_
  rw [Laws.Data.charBytes_eq]
  by_cases ascii : c.toNat ≤ 0x7f
  · rw [String.utf8EncodeChar_eq_singleton (Char.utf8Size_eq_one_iff.mpr ascii)]
    have one : c.utf8Size = 1 := Char.utf8Size_eq_one_iff.mpr ascii
    have same : c.val.toUInt8.toNat = c.toNat := by
      rw [UInt32.toNat_toUInt8]
      simp only [Char.toNat] at ascii ⊢
      omega
    simp only [List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero, same, one]
    split <;> simp_all
  · refine (Laws.Data.sum_map_ones _ _ fun byte mem => ?_).trans ?_
    · have := encode_high (by omega) byte mem
      repeat' split
      all_goals omega
    · rw [String.length_utf8EncodeChar]
      repeat' split
      all_goals omega

private theorem bool_bytes (value : Bool) : (toString value).utf8ByteSize = if value then 4 else 5 := by
  cases value <;> decide +kernel

private theorem canonicalDecimal_sound {coefficient : Int} {scale : Nat}
    (canonical : canonicalDecimal coefficient scale = true) :
    Laws.Data.CanonicalDecimal coefficient scale := by
  unfold canonicalDecimal at canonical
  unfold Laws.Data.CanonicalDecimal
  split at canonical
  · rename_i zero
    simp at zero canonical
    omega
  · rename_i nonzero
    simp at nonzero canonical
    omega

private theorem keysInDomain_sound {entries : List (String × Value)} (keys : keysInDomain entries = true) :
    entries.Pairwise (fun left right => left.1 < right.1) ∧ ∀ entry ∈ entries, entry.1.utf8ByteSize ≤ 1024 := by
  unfold keysInDomain at keys
  simp only [Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at keys
  refine ⟨?_, keys.1⟩
  have chain := keys.2
  clear keys
  induction entries with
  | nil => exact .nil
  | cons entry rest step =>
    cases rest with
    | nil => exact .cons (by simp) .nil
    | cons next rest =>
      have first : entry.1 < next.1 := chain (entry, next) (by simp)
      have later := step fun pair mem => chain pair (by
        simp only [List.tail_cons] at mem; simp [List.zip_cons_cons, mem])
      refine .cons (fun other mem => ?_) later
      rcases List.mem_cons.mp mem with rfl | mem
      · exact first
      · exact String.lt_trans first (List.rel_of_pairwise_cons later mem)

private theorem arrayBytes_eq (sizes : List Nat) : arrayBytes sizes = 2 + sizes.sum + (sizes.length - 1) := by
  simp only [arrayBytes, List.sum_eq_foldl]

mutual
/-- A value `valueBytes` measures takes `Laws.Data.jsonBytes` bytes: each template's bytes are checked here, not
counted by hand. -/
private theorem valueBytes_some : ∀ {value : Value} {bytes : Nat}, valueBytes value = some bytes →
    Laws.Data.jsonBytes value = bytes
  | .null, _, made => by
    simp only [valueBytes, Option.some.injEq] at made
    subst made
    unfold Laws.Data.jsonBytes
    decide +kernel
  | .bool value, _, made => by
    simp only [valueBytes, Option.some.injEq] at made
    subst made
    rw [bool_bytes]
    unfold Laws.Data.jsonBytes
    congr 1
  | .int value, _, made => by
    simp only [valueBytes, Option.some.injEq] at made
    subst made
    rw [Laws.Data.toString_int_bytes]
    unfold Laws.Data.jsonBytes
    congr 1
  | .decimal coefficient scale, _, made => by
    simp only [valueBytes, Option.some.injEq] at made
    subst made
    rw [Laws.Data.toString_nat_bytes, stringBytes_eq, Laws.Data.textBytes_int]
    unfold Laws.Data.jsonBytes
    congr 2
  | .string text, _, made => by
    simp only [valueBytes, Option.some.injEq] at made
    subst made
    rw [stringBytes_eq]
    unfold Laws.Data.jsonBytes
    congr 2
  | .stringList _, _, made => by simp [valueBytes] at made
  | .list items, _, made => by
    simp only [valueBytes] at made
    cases measured : itemsBytes items with
    | none => simp [measured] at made
    | some sizes =>
      simp only [measured, Option.bind_eq_bind, Option.bind_some, Option.some.injEq] at made
      subst made
      obtain ⟨count, total⟩ := itemsBytes_some measured
      rw [arrayBytes_eq, count, total, show "{\"kind\":\"list\",\"value\":}".utf8ByteSize = 24 by decide +kernel]
      unfold Laws.Data.jsonBytes
      omega
  | .map entries, _, made => by
    simp only [valueBytes] at made
    cases measured : entriesBytes entries with
    | none => simp [measured] at made
    | some sizes =>
      simp only [measured, Option.bind_eq_bind, Option.bind_some, Option.some.injEq] at made
      subst made
      obtain ⟨count, total⟩ := entriesBytes_some measured
      rw [arrayBytes_eq, count, total, show "{\"kind\":\"map\",\"value\":}".utf8ByteSize = 23 by decide +kernel]
      unfold Laws.Data.jsonBytes
      omega

private theorem itemsBytes_some : ∀ {items : List Value} {sizes : List Nat}, itemsBytes items = some sizes →
    sizes.length = items.length ∧ sizes.sum = Laws.Data.itemBytes items
  | [], _, made => by simp only [itemsBytes, Option.some.injEq] at made; subst made; simp [Laws.Data.itemBytes]
  | item :: items, _, made => by
    simp only [itemsBytes] at made
    cases measured : valueBytes item with
    | none => simp [measured] at made
    | some size =>
      cases rest : itemsBytes items with
      | none => simp [measured, rest] at made
      | some sizes =>
        simp [measured, rest] at made
        subst made
        obtain ⟨count, total⟩ := itemsBytes_some rest
        refine ⟨by simp [count], ?_⟩
        rw [List.sum_cons, total, Laws.Data.itemBytes, valueBytes_some measured]

private theorem entriesBytes_some : ∀ {entries : List (String × Value)} {sizes : List Nat},
    entriesBytes entries = some sizes →
    sizes.length = entries.length ∧ sizes.sum = Laws.Data.entryBytes entries
  | [], _, made => by simp only [entriesBytes, Option.some.injEq] at made; subst made; simp [Laws.Data.entryBytes]
  | (name, value) :: entries, _, made => by
    simp only [entriesBytes] at made
    cases measured : valueBytes value with
    | none => simp [measured] at made
    | some size =>
      cases rest : entriesBytes entries with
      | none => simp [measured, rest] at made
      | some sizes =>
        simp [measured, rest] at made
        subst made
        obtain ⟨count, total⟩ := entriesBytes_some rest
        refine ⟨by simp [count], ?_⟩
        rw [List.sum_cons, total, Laws.Data.entryBytes, valueBytes_some measured, stringBytes_eq,
          show "{\"name\":,\"value\":}".utf8ByteSize = 18 by decide +kernel]
end

mutual
/-- A value `domainNodes` counts is portable at its depth, with `Laws.Data.nodes` nodes. -/
private theorem domainNodes_some : ∀ {depth : Nat} {value : Value} {count : Nat},
    domainNodes depth value = some count →
    Laws.Data.Portable depth value ∧ Laws.Data.nodes value = count
  | depth, .null, _, made => by
    simp only [domainNodes, Option.some.injEq] at made
    exact ⟨.null depth, by rw [← made]; rfl⟩
  | depth, .bool value, _, made => by
    simp only [domainNodes, Option.some.injEq] at made
    exact ⟨.bool depth value, by rw [← made]; rfl⟩
  | depth, .int value, _, made => by
    simp only [domainNodes] at made
    split at made
    · rename_i bounded
      simp [integerBound] at bounded
      simp only [Option.some.injEq] at made
      exact ⟨.int depth value bounded.1 (of_decide_eq_true bounded.2), by rw [← made]; rfl⟩
    · cases made
  | depth, .decimal coefficient scale, _, made => by
    simp only [domainNodes] at made
    split at made
    · simp only [Option.some.injEq] at made
      exact ⟨.decimal depth coefficient scale (canonicalDecimal_sound ‹_›), by rw [← made]; rfl⟩
    · cases made
  | depth, .string text, _, made => by
    simp only [domainNodes] at made
    split at made
    · rename_i bounded
      simp only [Option.some.injEq] at made
      exact ⟨.string depth text (by simpa [textBytes] using bounded), by rw [← made]; rfl⟩
    · cases made
  | _, .stringList _, _, made => by simp [domainNodes] at made
  | depth, .list items, _, made => by
    simp only [domainNodes] at made
    split at made
    · rename_i bounded
      simp only [Bool.and_eq_true, decide_eq_true_eq] at bounded
      cases measured : memberNodes (depth + 1) items with
      | none => simp [measured] at made
      | some inner =>
        simp only [measured, Option.map_some, Option.some.injEq] at made
        obtain ⟨portable, counted⟩ := memberNodes_some measured
        exact ⟨.list depth items bounded.1 bounded.2 portable,
          by rw [← made, ← counted, Laws.Data.nodes]; omega⟩
    · cases made
  | depth, .map entries, _, made => by
    simp only [domainNodes] at made
    split at made
    · rename_i bounded
      simp only [Bool.and_eq_true, decide_eq_true_eq] at bounded
      obtain ⟨⟨shallow, few⟩, keys⟩ := bounded
      obtain ⟨ordered, short⟩ := keysInDomain_sound keys
      cases measured : entryNodes (depth + 1) entries with
      | none => simp [measured] at made
      | some inner =>
        simp only [measured, Option.map_some, Option.some.injEq] at made
        obtain ⟨portable, counted⟩ := entryNodes_some measured
        exact ⟨.map depth entries shallow few ordered short portable,
          by rw [← made, ← counted, Laws.Data.nodes]; omega⟩
    · cases made

private theorem memberNodes_some : ∀ {depth : Nat} {items : List Value} {count : Nat},
    memberNodes depth items = some count →
    (∀ item ∈ items, Laws.Data.Portable depth item) ∧ Laws.Data.itemNodes items = count
  | _, [], _, made => by
    simp only [memberNodes, Option.some.injEq] at made
    exact ⟨nofun, by rw [← made]; rfl⟩
  | depth, item :: items, _, made => by
    simp only [memberNodes] at made
    cases measured : domainNodes depth item with
    | none => simp [measured] at made
    | some size =>
      cases rest : memberNodes depth items with
      | none => simp [measured, rest] at made
      | some sizes =>
        simp [measured, rest] at made
        obtain ⟨portable, counted⟩ := domainNodes_some measured
        obtain ⟨portables, total⟩ := memberNodes_some rest
        refine ⟨fun other mem => ?_, by rw [Laws.Data.itemNodes, counted, total, made]⟩
        rcases List.mem_cons.mp mem with rfl | mem
        · exact portable
        · exact portables other mem

private theorem entryNodes_some : ∀ {depth : Nat} {entries : List (String × Value)} {count : Nat},
    entryNodes depth entries = some count →
      (∀ entry ∈ entries, Laws.Data.Portable depth entry.2) ∧ Laws.Data.entryNodes entries = count
  | _, [], _, made => by
    simp only [entryNodes, Option.some.injEq] at made
    exact ⟨nofun, by rw [← made]; rfl⟩
  | depth, (name, value) :: entries, _, made => by
    simp only [entryNodes] at made
    cases measured : domainNodes depth value with
    | none => simp [measured] at made
    | some size =>
      cases rest : entryNodes depth entries with
      | none => simp [measured, rest] at made
      | some sizes =>
        simp [measured, rest] at made
        obtain ⟨portable, counted⟩ := domainNodes_some measured
        obtain ⟨portables, total⟩ := entryNodes_some rest
        refine ⟨fun other mem => ?_, by rw [Laws.Data.entryNodes, counted, total, made]⟩
        rcases List.mem_cons.mp mem with rfl | mem
        · exact portable
        · exact portables other mem
end

/-- Whatever `inValueDomain` admits lies in the value domain the data semantics states (`Laws.Data.InDomain`): the
executable node count, byte census and bounds are checked against the law's, constant by constant. -/
theorem inValueDomain_sound {value : Value} (admitted : inValueDomain value = true) : Laws.Data.InDomain value := by
  cases value with
  | stringList items =>
    simp only [inValueDomain, textBytes, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true] at admitted
    exact .inr ⟨admitted.1, fun text mem => of_decide_eq_true (admitted.2 text mem)⟩
  | _ =>
    simp only [inValueDomain] at admitted
    split at admitted
    · rename_i counted measured
      simp only [Bool.and_eq_true, decide_eq_true_eq] at admitted
      obtain ⟨portable, rfl⟩ := domainNodes_some counted
      exact .inl ⟨portable, admitted.1, (valueBytes_some measured).symm ▸ admitted.2⟩
    · cases admitted

/-- Admitting values rejects every list holding one value outside the value domain. -/
theorem admitValues_rejects {values : List Value} (outside : ∃ value ∈ values, ¬ Laws.Data.InDomain value) :
    admitValues values = .error (.rejected "value-outside-domain") := by
  obtain ⟨value, mem, notIn⟩ := outside
  have refused : values.all inValueDomain = false := Bool.eq_false_iff.mpr fun all =>
    notIn (inValueDomain_sound (List.all_eq_true.mp all value mem))
  simp [admitValues, refused]

/-- `lastWrites` restated: the keyed bindings, in name order. -/
theorem lastWrites_eq (bindings : List (String × Value)) :
    lastWrites bindings = (keyed bindings).mergeSort fun left right => decide (left.1 ≤ right.1) := by
  simp only [lastWrites]

/-- One mapping whose source fails to evaluate with `code` reads by its dialect: a Data Association's leaves the set
unavailable, an input or output parameter's rolls back with the code, and a Call variable's binds its target to null. -/
theorem evaluateMappings_failed {ctx : Ctx} {context : EvalContext} {mapping : Mapping} {code : String}
    (unresolved : ctx.evaluate context mapping.source = .failure code) :
    ctx.evaluateMappings context [mapping] = match mapping.dialect with
      | .dataAssociation => .ok none
      | .ioParameter => .error (.rolledBack code)
      | .callVariable => .ok (some (lastWrites [(mapping.target, .null)])) := by
  unfold Ctx.evaluateMappings Ctx.evaluateMappingsWith
  simp only [List.foldlM_cons, List.foldlM_nil, unresolved]
  cases mapping.dialect <;> rfl

/-- The bindings an evaluation that ends available makes are the last writes of what its mappings bound. -/
theorem evaluateMappings_some {ctx : Ctx} {context : EvalContext} {mappings : List Mapping}
    {bindings : List (String × Value)} (evaluated : ctx.evaluateMappings context mappings = .ok (some bindings)) :
    ∃ made, bindings = lastWrites made := by
  unfold Ctx.evaluateMappings Ctx.evaluateMappingsWith at evaluated
  simp only [bind, Except.bind] at evaluated
  split at evaluated
  · cases evaluated
  · rename_i result _
    simp only [pure, Except.pure, Except.ok.injEq] at evaluated
    split at evaluated
    · exact ⟨result.1, (Option.some.inj evaluated).symm⟩
    · cases evaluated

/-- An element runs as an instance only in a scope occurrence of its own: the first one of its identifier. -/
theorem runsAsInstance_entry {ctx : Ctx} {state : State} {element : ElementId} {scope : ScopeOccurrenceId}
    (runs : ctx.runsAsInstance state element scope = true) :
    ∃ entry, state.scopes.find? (·.id == scope) = some entry ∧ entry.element = some element := by
  unfold Ctx.runsAsInstance at runs
  have found := beq_iff_eq.mp ((Bool.and_eq_true _ _).mp runs).2
  cases entry : state.scopes.find? (·.id == scope) with
  | none => simp [entry] at found
  | some entry' =>
    exact ⟨entry', rfl, by simpa [entry] using found⟩

end Kernel.Laws.Hooks
