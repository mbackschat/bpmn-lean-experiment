module

/-! # BpmnSemantics.BusinessValue — portable recursive business values

The closed recursive value domain of the
[portable-value contract](../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#public-value-contract):
String, Null, Boolean, Integer, exact Decimal, List and Map. Legacy `stringList` is deliberately
not a constructor, so it cannot occur below a List or Map by construction.

This module owns representation and structural equality only. Wire spelling, bounds and profile
eligibility belong to the JSON and value-domain owners.
-/

@[expose] public section

namespace BpmnSemantics

/-- One tagged business value; Map entries are kept in the order the wire contract fixes. -/
inductive BusinessValue where
  | string (value : String)
  | null
  | boolean (value : Bool)
  | integer (value : Nat)
  /-- Exact value `coefficient × 10^-scale`; canonical spelling is a wire-boundary obligation. -/
  | decimal (coefficient : Int) (scale : Nat)
  | list (members : List BusinessValue)
  | map (entries : List (String × BusinessValue))
  deriving Repr

/-
`deriving DecidableEq` rejects this nested inductive on the pinned toolchain (checked 2026-10-13
against Lean v4.34.1), so equality is written as structural mutual recursion. Structural recursion
keeps the instance kernel-reducible for `decide +kernel` fixtures, which a well-founded definition
would not be.
-/
mutual
def BusinessValue.decEq : (left right : BusinessValue) → Decidable (left = right)
  | .string x, .string y =>
      if h : x = y then isTrue (h ▸ rfl) else isFalse (by intro e; cases e; exact h rfl)
  | .null, .null => isTrue rfl
  | .boolean x, .boolean y =>
      if h : x = y then isTrue (h ▸ rfl) else isFalse (by intro e; cases e; exact h rfl)
  | .integer x, .integer y =>
      if h : x = y then isTrue (h ▸ rfl) else isFalse (by intro e; cases e; exact h rfl)
  | .decimal c s, .decimal d t =>
      if h : c = d ∧ s = t then isTrue (by obtain ⟨rfl, rfl⟩ := h; rfl)
      else isFalse (by intro e; cases e; exact h ⟨rfl, rfl⟩)
  | .list xs, .list ys =>
      match BusinessValue.decEqMembers xs ys with
      | isTrue h => isTrue (h ▸ rfl)
      | isFalse h => isFalse (by intro e; cases e; exact h rfl)
  | .map xs, .map ys =>
      match BusinessValue.decEqEntries xs ys with
      | isTrue h => isTrue (h ▸ rfl)
      | isFalse h => isFalse (by intro e; cases e; exact h rfl)
  | .string _, .null | .string _, .boolean _ | .string _, .integer _ | .string _, .decimal _ _
  | .string _, .list _ | .string _, .map _
  | .null, .string _ | .null, .boolean _ | .null, .integer _ | .null, .decimal _ _
  | .null, .list _ | .null, .map _
  | .boolean _, .string _ | .boolean _, .null | .boolean _, .integer _ | .boolean _, .decimal _ _
  | .boolean _, .list _ | .boolean _, .map _
  | .integer _, .string _ | .integer _, .null | .integer _, .boolean _ | .integer _, .decimal _ _
  | .integer _, .list _ | .integer _, .map _
  | .decimal _ _, .string _ | .decimal _ _, .null | .decimal _ _, .boolean _
  | .decimal _ _, .integer _ | .decimal _ _, .list _ | .decimal _ _, .map _
  | .list _, .string _ | .list _, .null | .list _, .boolean _ | .list _, .integer _
  | .list _, .decimal _ _ | .list _, .map _
  | .map _, .string _ | .map _, .null | .map _, .boolean _ | .map _, .integer _
  | .map _, .decimal _ _ | .map _, .list _ =>
      isFalse (by intro e; cases e)

def BusinessValue.decEqMembers : (left right : List BusinessValue) → Decidable (left = right)
  | [], [] => isTrue rfl
  | x :: xs, y :: ys =>
      match BusinessValue.decEq x y, BusinessValue.decEqMembers xs ys with
      | isTrue h₁, isTrue h₂ => isTrue (h₁ ▸ h₂ ▸ rfl)
      | isFalse h, _ => isFalse (by intro e; cases e; exact h rfl)
      | _, isFalse h => isFalse (by intro e; cases e; exact h rfl)
  | [], _ :: _ => isFalse (by intro e; cases e)
  | _ :: _, [] => isFalse (by intro e; cases e)

def BusinessValue.decEqEntries :
    (left right : List (String × BusinessValue)) → Decidable (left = right)
  | [], [] => isTrue rfl
  | (n, x) :: xs, (m, y) :: ys =>
      if hn : n = m then
        match BusinessValue.decEq x y, BusinessValue.decEqEntries xs ys with
        | isTrue h₁, isTrue h₂ => isTrue (hn ▸ h₁ ▸ h₂ ▸ rfl)
        | isFalse h, _ => isFalse (by intro e; cases e; exact h rfl)
        | _, isFalse h => isFalse (by intro e; cases e; exact h rfl)
      else isFalse (by intro e; cases e; exact hn rfl)
  | [], _ :: _ => isFalse (by intro e; cases e)
  | _ :: _, [] => isFalse (by intro e; cases e)
end

instance : DecidableEq BusinessValue := BusinessValue.decEq

mutual
/-- Tagged value nodes in one tree, counting the root; entry wrappers and keys are not nodes. -/
def BusinessValue.nodeCount : BusinessValue → Nat
  | .list members => 1 + BusinessValue.membersNodeCount members
  | .map entries => 1 + BusinessValue.entriesNodeCount entries
  | .string _ | .null | .boolean _ | .integer _ | .decimal _ _ => 1

def BusinessValue.membersNodeCount : List BusinessValue → Nat
  | [] => 0
  | member :: members => member.nodeCount + BusinessValue.membersNodeCount members

def BusinessValue.entriesNodeCount : List (String × BusinessValue) → Nat
  | [] => 0
  | (_, value) :: entries => value.nodeCount + BusinessValue.entriesNodeCount entries
end

mutual
/-- List/Map nodes on the deepest root-to-leaf path; a scalar has container depth zero. -/
def BusinessValue.containerDepth : BusinessValue → Nat
  | .list members => 1 + BusinessValue.membersContainerDepth members
  | .map entries => 1 + BusinessValue.entriesContainerDepth entries
  | .string _ | .null | .boolean _ | .integer _ | .decimal _ _ => 0

def BusinessValue.membersContainerDepth : List BusinessValue → Nat
  | [] => 0
  | member :: members => max member.containerDepth (BusinessValue.membersContainerDepth members)

def BusinessValue.entriesContainerDepth : List (String × BusinessValue) → Nat
  | [] => 0
  | (_, value) :: entries =>
      max value.containerDepth (BusinessValue.entriesContainerDepth entries)
end

end BpmnSemantics
