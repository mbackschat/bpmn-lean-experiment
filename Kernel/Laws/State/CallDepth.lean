module

public import Kernel.State.CallDepth
import all Kernel.State.CallDepth
public import Kernel.Laws.State.Key
public import Kernel.Laws.Data.Values

/-! # Laws of the call depth of an instance name

`State.spelledDepth` reads back the Calls `State.calledInstanceId` spells: a called identifier's depth is its caller's and
one, whatever characters the caller holds, since each part follows its UTF-8 byte length. So `calledBy` and the commit's
renaming keep a name's depth (`callDepth_calledBy`, `callDepth_rename`): every name the commit resolves to one identifier has
one depth, which `Step.activationOrder` sorts by.
-/

public section

namespace Kernel.Laws.State

@[simp] theorem callDepth_called (caller : InstanceName) (call : ElementId) (activation : Issue) :
    (InstanceName.called caller call activation).callDepth = caller.callDepth + 1 := by
  simp [InstanceName.callDepth]

theorem callDepth_named (id : String) : (InstanceName.named id).callDepth = State.spelledDepth id := by
  simp [InstanceName.callDepth]

private theorem takeBytes_spelled : ∀ (first rest : List Char),
    State.takeBytes (first.map Char.utf8Size).sum (first ++ rest) = some (first, rest)
  | [], rest => by simp [State.takeBytes]
  | char :: first, rest => by
    have positive := Char.utf8Size_pos char
    obtain ⟨bytes, sized⟩ : ∃ bytes, ((char :: first).map Char.utf8Size).sum = bytes + 1 :=
      ⟨((char :: first).map Char.utf8Size).sum - 1, by simp only [List.map_cons, List.sum_cons]; omega⟩
    simp only [List.map_cons, List.sum_cons] at sized
    have fits : char.utf8Size ≤ bytes + 1 := by omega
    have left : bytes + 1 - char.utf8Size = (first.map Char.utf8Size).sum := by omega
    simp only [List.map_cons, List.sum_cons, List.cons_append]
    rw [sized, State.takeBytes]
    simp only [fits, ↓reduceIte, left, takeBytes_spelled first rest]
    rfl

private theorem takeBytes_append : ∀ {bytes : Nat} {chars taken rest : List Char},
    State.takeBytes bytes chars = some (taken, rest) → taken ++ rest = chars
  | 0, chars, taken, rest, split => by
    simp only [State.takeBytes, Option.some.injEq, Prod.mk.injEq] at split
    obtain ⟨rfl, rfl⟩ := split
    rfl
  | _ + 1, [], _, _, split => by simp [State.takeBytes] at split
  | bytes + 1, char :: chars, taken, rest, split => by
    simp only [State.takeBytes] at split
    split at split
    · cases inner : State.takeBytes (bytes + 1 - char.utf8Size) chars with
      | none => rw [inner] at split; cases split
      | some parts =>
        obtain ⟨first, second⟩ := parts
        rw [inner] at split
        simp only [Option.map_some, Option.some.injEq, Prod.mk.injEq] at split
        obtain ⟨rfl, rfl⟩ := split
        rw [List.cons_append, takeBytes_append inner]
    · cases split

private theorem digits_spelled : ∀ (digits rest : List Char), (∀ char ∈ digits, char.isDigit) →
    (digits ++ ':' :: rest).dropWhile Char.isDigit = ':' :: rest ∧
      (digits ++ ':' :: rest).takeWhile Char.isDigit = digits
  | [], rest, _ => by
    have colon : (':').isDigit = false := by decide +kernel
    simp [colon]
  | digit :: digits, rest, all => by
    have head : digit.isDigit = true := all digit List.mem_cons_self
    obtain ⟨dropped, taken⟩ := digits_spelled digits rest fun char inside => all char (List.mem_cons_of_mem _ inside)
    simp [head, dropped, taken]

/-- A caller `State.calledCaller?` reads is shorter than the identifier it reads it from. -/
private theorem calledCaller_shorter {chars caller : List Char} (read : State.calledCaller? chars = some caller) :
    caller.length < chars.length := by
  unfold State.calledCaller? at read
  split at read
  · dsimp only at read
    split at read
    · rename_i body dropped
      split at read
      · rename_i caller' tail spelled
        cases read
        have whole := takeBytes_append spelled
        have suffix := (List.dropWhile_suffix Char.isDigit (l := chars.drop 5)).length_le
        rw [dropped] at suffix
        have lengths := congrArg List.length whole
        simp only [List.length_append, List.length_cons, List.length_drop] at lengths suffix
        omega
      · cases read
    · cases read
  · cases read

private theorem spelledDepthWithin_stable : ∀ {fuel fuel' : Nat} {chars : List Char}, chars.length ≤ fuel →
    chars.length ≤ fuel' → State.spelledDepthWithin fuel chars = State.spelledDepthWithin fuel' chars
  | 0, 0, _, _, _ => rfl
  | 0, _ + 1, chars, short, _ => by
    have : chars = [] := List.eq_nil_of_length_eq_zero (by omega)
    subst this
    simp [State.spelledDepthWithin, State.calledCaller?]
  | _ + 1, 0, chars, _, short => by
    have : chars = [] := List.eq_nil_of_length_eq_zero (by omega)
    subst this
    simp [State.spelledDepthWithin, State.calledCaller?]
  | fuel + 1, fuel' + 1, chars, short, short' => by
    simp only [State.spelledDepthWithin]
    split
    · rename_i caller read
      have shorter := calledCaller_shorter read
      rw [spelledDepthWithin_stable (fuel := fuel) (fuel' := fuel') (by omega) (by omega)]
    · rfl

private theorem calledCaller_spelled (caller : String) (call : ElementId) (activation : Nat) :
    State.calledCaller? (State.calledInstanceId caller call activation).toList = some caller.toList := by
  rw [calledInstanceId_eq]
  have colon : (":" : String).toList = [':'] := by simp
  have word : ("call:" : String).toList = ['c', 'a', 'l', 'l', ':'] := by decide +kernel
  simp only [String.toList_append, toString, Nat.toList_repr, List.append_assoc, colon, word, List.singleton_append]
  have sized := takeBytes_spelled caller.toList
    (':' :: ((Nat.toDigits 10 call.value.utf8ByteSize) ++ ':' :: (call.value.toList ++ ':' :: Nat.toDigits 10 activation)))
  rw [← Kernel.Laws.Data.utf8ByteSize_eq] at sized
  obtain ⟨dropped, taken⟩ := digits_spelled (Nat.toDigits 10 caller.utf8ByteSize) (caller.toList ++
    ':' :: ((Nat.toDigits 10 call.value.utf8ByteSize) ++ ':' :: (call.value.toList ++ ':' :: Nat.toDigits 10 activation)))
    fun _ inside => Nat.isDigit_of_mem_toDigits (by decide +kernel) (by decide +kernel) inside
  unfold State.calledCaller?
  simp only [List.isPrefixOf, List.cons_append, List.nil_append, beq_self_eq_true, Bool.and_true, ite_true,
    List.drop_succ_cons, List.drop_zero]
  simp only [dropped, taken, Nat.ofDigitChars_ten_toDigits, sized]

/-- **A called identifier is one Call deeper than its caller's**, whatever characters the caller holds. -/
theorem spelledDepth_calledInstanceId (caller : String) (call : ElementId) (activation : Nat) :
    State.spelledDepth (State.calledInstanceId caller call activation) = State.spelledDepth caller + 1 := by
  have longer : caller.length < (State.calledInstanceId caller call activation).length := by
    rw [calledInstanceId_eq, ← String.length_toList, ← String.length_toList]
    simp only [String.toList_append, List.length_append, toString]
    have : ("call:" : String).toList.length = 5 := by decide +kernel
    omega
  unfold State.spelledDepth
  obtain ⟨fuel, sized⟩ : ∃ fuel, (State.calledInstanceId caller call activation).length = fuel + 1 :=
    ⟨(State.calledInstanceId caller call activation).length - 1, by omega⟩
  rw [sized, State.spelledDepthWithin, calledCaller_spelled]
  simp only [Nat.add_right_cancel_iff]
  exact spelledDepthWithin_stable (by rw [String.length_toList]; omega) (Nat.le_of_eq String.length_toList)

/-- A name `calledBy` builds is one Call deeper than its caller. -/
theorem callDepth_calledBy (caller : InstanceName) (call : ElementId) (activation : Issue) :
    (caller.calledBy call activation).callDepth = caller.callDepth + 1 := by
  rcases calledBy_cases caller call activation with ⟨id, built⟩ | pending
  · obtain ⟨ordinal, rfl, rfl, named⟩ := built
    rw [named, callDepth_named, callDepth_named, spelledDepth_calledInstanceId]
  · rw [pending, callDepth_called]

/-- **The commit's renaming keeps a name's depth**: a pending name is one Call deeper than its caller, as the identifier
it resolves to spells it. -/
theorem callDepth_rename (r : Issue → Issue) : ∀ name : InstanceName, (name.rename r).callDepth = name.callDepth
  | .named id => by rw [rename_named]
  | .called caller call activation => by
    rw [rename_called]
    split
    · rw [callDepth_calledBy, callDepth_rename r caller, callDepth_called]
    · rfl

end Kernel.Laws.State
