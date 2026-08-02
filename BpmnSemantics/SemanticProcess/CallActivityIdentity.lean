import BpmnSemantics.SemanticProcessContract

/-! # Called-Process Call Activity identity

This module owns the byte-stable called-instance identity encoding and its injectivity laws. It does not own runtime associations, invocation or return transitions, source QName resolution, public observation, or Temporal hosting.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def calledProcessIdentityPrefix (callerId : SemanticId)
    (callActivityId : NodeId) : String :=
  "call:" ++ toString callerId.value.utf8ByteSize ++ ":" ++ callerId.value ++
    ":" ++ toString callActivityId.value.utf8ByteSize ++ ":" ++
    callActivityId.value ++ ":"

/-- Encode the caller, Call Activity, and activation with decimal UTF-8 byte lengths. -/
def deriveCalledProcessInstanceId (callerId : SemanticId)
    (callActivityId : NodeId) (activation : Nat) : SemanticId :=
  ⟨calledProcessIdentityPrefix callerId callActivityId ++ toString activation⟩

private theorem natToString_injective : Function.Injective (toString : Nat → String) := by
  intro left right equal
  have digits : Nat.toDigits 10 left = Nat.toDigits 10 right := by
    have lists := congrArg String.toList equal
    simpa [Nat.toString_eq_ofList_toDigits] using lists
  have decoded := congrArg (fun value => Nat.ofDigitChars 10 value 0) digits
  simpa [Nat.ofDigitChars_ten_toDigits] using decoded

private def lengthFrame (value suffix : String) : String :=
  toString value.utf8ByteSize ++ ":" ++ value ++ suffix

private theorem colon_absent_from_nat_string (value : Nat) :
    ∀ character ∈ (toString value).toList, (character == ':') = false := by
  intro character member
  have digit : character.isDigit := by
    apply Nat.isDigit_of_mem_toDigits (b := 10) (by decide) (by decide)
    simpa [Nat.toString_eq_ofList_toDigits] using member
  by_cases equal : character = ':'
  · subst character
    have colonNotDigit : (':').isDigit = false := by decide
    rw [colonNotDigit] at digit
    contradiction
  · exact Bool.eq_false_iff.mpr fun beqTrue =>
      equal (beq_iff_eq.mp beqTrue)

private theorem first_colon_of_length_frame (value suffix : String) :
    (lengthFrame value suffix).toList.findIdx (· == ':') =
      (toString value.utf8ByteSize).toList.length := by
  have representation :
      (lengthFrame value suffix).toList =
        (toString value.utf8ByteSize).toList ++
          ':' :: (value.toList ++ suffix.toList) := by
    simp [lengthFrame, String.toList_append, List.append_assoc]
  rw [representation, List.findIdx_append,
    List.findIdx_eq_length_of_false (colon_absent_from_nat_string _)]
  simp [List.findIdx_cons]

private theorem lengthFrame_injective {leftValue rightValue leftSuffix rightSuffix : String}
    (equal : lengthFrame leftValue leftSuffix =
      lengthFrame rightValue rightSuffix) :
    leftValue = rightValue ∧ leftSuffix = rightSuffix := by
  have firstColonEqual := congrArg
    (fun value : String => value.toList.findIdx (· == ':')) equal
  rw [first_colon_of_length_frame, first_colon_of_length_frame] at firstColonEqual
  have listEqual := congrArg String.toList equal
  have lengthDigitsEqual :
      (toString leftValue.utf8ByteSize).toList =
        (toString rightValue.utf8ByteSize).toList := by
    calc
      (toString leftValue.utf8ByteSize).toList =
          (lengthFrame leftValue leftSuffix).toList.take
            (toString leftValue.utf8ByteSize).toList.length := by
        simp [lengthFrame, String.toList_append]
      _ = (lengthFrame rightValue rightSuffix).toList.take
            (toString leftValue.utf8ByteSize).toList.length :=
        congrArg
          (fun characters => characters.take
            (toString leftValue.utf8ByteSize).toList.length) listEqual
      _ = (lengthFrame rightValue rightSuffix).toList.take
            (toString rightValue.utf8ByteSize).toList.length := by
        rw [firstColonEqual]
      _ = (toString rightValue.utf8ByteSize).toList := by
        simp [lengthFrame, String.toList_append]
  have byteSizesEqual : leftValue.utf8ByteSize = rightValue.utf8ByteSize :=
    natToString_injective (String.toList_injective lengthDigitsEqual)
  have tailsEqual : leftValue ++ leftSuffix = rightValue ++ rightSuffix := by
    apply String.toList_injective
    simp only [lengthFrame, String.toList_append] at listEqual
    rw [lengthDigitsEqual] at listEqual
    have framedTails :
        (toString rightValue.utf8ByteSize).toList ++
            (":".toList ++ (leftValue.toList ++ leftSuffix.toList)) =
          (toString rightValue.utf8ByteSize).toList ++
            (":".toList ++ (rightValue.toList ++ rightSuffix.toList)) := by
      simpa [List.append_assoc] using listEqual
    simpa only [String.toList_append] using List.append_cancel_left
      (List.append_cancel_left framedTails)
  have byteTailsEqual := congrArg String.toByteArray tailsEqual
  simp only [String.toByteArray_append] at byteTailsEqual
  have valueBytesEqual : leftValue.toByteArray = rightValue.toByteArray := by
    have prefixes := congrArg
      (fun bytes : ByteArray => bytes.extract 0 leftValue.toByteArray.size)
      byteTailsEqual
    simpa [ByteArray.extract_append_eq_left, String.size_toByteArray,
      byteSizesEqual] using prefixes
  have valuesEqual : leftValue = rightValue :=
    String.toByteArray_inj.mp valueBytesEqual
  subst rightValue
  refine ⟨rfl, ?_⟩
  have tailsListEqual := congrArg String.toList tailsEqual
  simp only [String.toList_append] at tailsListEqual
  exact String.toList_injective (List.append_cancel_left tailsListEqual)

/-- Decimal UTF-8-byte framing makes the complete caller, Call Activity, and activation tuple injective. -/
theorem calledProcessIdentityTuple_injective
    (callerA callerB : SemanticId) (activityA activityB : NodeId)
    (activationA activationB : Nat)
    (equal : deriveCalledProcessInstanceId callerA activityA activationA =
      deriveCalledProcessInstanceId callerB activityB activationB) :
    callerA = callerB ∧ activityA = activityB ∧ activationA = activationB := by
  have strings := congrArg SemanticId.value equal
  simp only [deriveCalledProcessInstanceId, calledProcessIdentityPrefix] at strings
  have framedStrings :
      "call:" ++ lengthFrame callerA.value
        (":" ++ lengthFrame activityA.value (":" ++ toString activationA)) =
      "call:" ++ lengthFrame callerB.value
        (":" ++ lengthFrame activityB.value (":" ++ toString activationB)) := by
    simpa [lengthFrame, String.append_assoc] using strings
  have callerFrameEqual :
      lengthFrame callerA.value
          (":" ++ lengthFrame activityA.value (":" ++ toString activationA)) =
        lengthFrame callerB.value
          (":" ++ lengthFrame activityB.value (":" ++ toString activationB)) := by
    exact (String.append_right_inj "call:").mp framedStrings
  obtain ⟨callerValuesEqual, activityFramesEqual⟩ :=
    lengthFrame_injective callerFrameEqual
  have activityFrameEqual :
      lengthFrame activityA.value (":" ++ toString activationA) =
        lengthFrame activityB.value (":" ++ toString activationB) := by
    exact (String.append_right_inj ":").mp activityFramesEqual
  obtain ⟨activityValuesEqual, activationsFramedEqual⟩ :=
    lengthFrame_injective activityFrameEqual
  have activationStringsEqual : toString activationA = toString activationB := by
    exact (String.append_right_inj ":").mp activationsFramedEqual
  have callersEqual : callerA = callerB := by
    cases callerA
    cases callerB
    simp_all
  have activitiesEqual : activityA = activityB := by
    cases activityA
    cases activityB
    simp_all
  exact ⟨callersEqual, activitiesEqual,
    natToString_injective activationStringsEqual⟩

/-- Repeated activation of one exact Call identity cannot reuse a called Process-instance ID. -/
theorem calledProcessActivationIdentity_injective
    (callerId : SemanticId) (callActivityId : NodeId) :
    Function.Injective (deriveCalledProcessInstanceId callerId callActivityId) := by
  intro left right equal
  exact (calledProcessIdentityTuple_injective callerId callerId callActivityId
    callActivityId left right equal).2.2

/-- Every derived called identity is distinct from the caller identity it qualifies. -/
theorem calledProcessIdentity_differs_from_caller
    (callerId : SemanticId) (callActivityId : NodeId) (activation : Nat) :
    deriveCalledProcessInstanceId callerId callActivityId activation ≠ callerId := by
  intro equal
  have sizes := congrArg (fun value : SemanticId => value.value.utf8ByteSize) equal
  simp [deriveCalledProcessInstanceId, calledProcessIdentityPrefix,
    String.utf8ByteSize_append] at sizes
  have callTagSize : "call:".utf8ByteSize = 5 := by decide
  have separatorSize : ":".utf8ByteSize = 1 := by decide
  rw [callTagSize, separatorSize] at sizes
  omega

end BpmnSemantics.SemanticProcess
