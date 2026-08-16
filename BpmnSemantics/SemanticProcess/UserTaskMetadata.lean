import BpmnSemantics.Contract

/-! # User Task assignment and form metadata

This module owns the neutral immutable metadata vocabulary and the exact literal-domain predicate
shared by checked User Tasks, Semantic Process waits, and public observations. It defines no BPMN
source interpretation, assignment authorization, form validation, or task-lifecycle behavior.
-/

namespace BpmnSemantics

/-- The selected candidate vocabulary is deliberately narrower than a directory identity model. -/
inductive UserTaskCandidateKind where
  | group
  deriving Repr, DecidableEq

structure UserTaskCandidate where
  kind : UserTaskCandidateKind
  id : String
  deriving Repr, DecidableEq

/-- Closed field types published by the selected generated-form profile. -/
inductive UserTaskFormFieldType where
  | string
  | boolean
  deriving Repr, DecidableEq

structure UserTaskFormField where
  key : String
  type : UserTaskFormFieldType
  deriving Repr, DecidableEq

structure UserTaskAssignmentMetadata where
  candidates : List UserTaskCandidate
  deriving Repr, DecidableEq

structure UserTaskFormMetadata where
  fields : List UserTaskFormField
  deriving Repr, DecidableEq

/-- Passive metadata copied through execution without contributing to occurrence identity. -/
structure UserTaskMetadata where
  assignment : UserTaskAssignmentMetadata
  form : Option UserTaskFormMetadata := none
  deriving Repr, DecidableEq

namespace UserTaskMetadata

/-- Exact Unicode boundary-space set selected by the compatibility profile. -/
def boundarySpaceCodePoint (value : Nat) : Bool :=
  (9 ≤ value && value ≤ 13) ||
    value = 0x20 || value = 0x85 || value = 0xa0 || value = 0x1680 ||
    (0x2000 ≤ value && value ≤ 0x200a) ||
    value = 0x2028 || value = 0x2029 || value = 0x202f ||
    value = 0x205f || value = 0x3000 || value = 0xfeff

private def containsExpressionOpener : List Char → Bool
  | []
  | [_] => false
  | '$' :: '{' :: _
  | '#' :: '{' :: _ => true
  | _ :: remaining => containsExpressionOpener remaining

/-- Nonempty scalar string whose first and last code points are outside the exact profile space set. -/
def boundaryClean (value : String) : Bool :=
  match value.toList with
  | [] => false
  | first :: remaining =>
      let last := remaining.getLastD first
      !boundarySpaceCodePoint first.toNat &&
        !boundarySpaceCodePoint last.toNat

/-- Literal group identity restriction. Internal content is preserved and only separators/openers refuse. -/
def candidateIdWellFormed (value : String) : Bool :=
  boundaryClean value &&
    !value.toList.contains ',' &&
    !containsExpressionOpener value.toList

/-- Field keys use the selected nonempty boundary rule without normalization or rewriting. -/
def fieldKeyWellFormed (value : String) : Bool :=
  boundaryClean value

/-- Exact singleton literal-group assignment shared by both passive metadata arms. -/
def assignmentWellFormed (assignment : UserTaskAssignmentMetadata) : Bool :=
  match assignment.candidates with
  | [{ kind := .group, id }] => candidateIdWellFormed id
  | _ => false

/-- Exact singleton form block retained by the legacy assignment-plus-form arm. -/
def formWellFormed (form : UserTaskFormMetadata) : Bool :=
  match form.fields with
  | [{ key, type := .string }]
  | [{ key, type := .boolean }] => fieldKeyWellFormed key
  | _ => false

/-- The M6 arm carries assignment only and physically omits the legacy form block. -/
def assignmentOnlyWellFormed (metadata : UserTaskMetadata) : Bool :=
  assignmentWellFormed metadata.assignment && metadata.form.isNone

/-- Legacy M3 profiles retain the exact assignment-plus-form arm. -/
def assignmentFormWellFormed (metadata : UserTaskMetadata) : Bool :=
  assignmentWellFormed metadata.assignment &&
    match metadata.form with
    | some form => formWellFormed form
    | none => false

/-- Closed union of the two exact passive metadata arms. -/
def wellFormed (metadata : UserTaskMetadata) : Bool :=
  assignmentOnlyWellFormed metadata || assignmentFormWellFormed metadata

def optionWellFormed : Option UserTaskMetadata → Bool
  | none => true
  | some metadata => wellFormed metadata

end UserTaskMetadata

end BpmnSemantics
