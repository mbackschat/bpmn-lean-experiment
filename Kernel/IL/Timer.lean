module

public import Kernel.IL.Types

/-! # Timer lexemes

The exact ISO 8601 grammar the profile admits for Timer literals (CIB-LIM-0003, CIB-AGR-0021), shared by
`Kernel.Admission.Subscriptions` and `Kernel.Feature.Subscriptions`: a duration is `PT[nH][nM][nS]` with non-negative
integer components in that order, each at most once, at least one present, totalling 1 ms to `maxDurationMs`. A cycle
is the unbounded repetition `R/<duration>`. Zero, fractional and nominal durations, dates, dated intervals and bounded
repetitions are conforming BPMN that the profile refuses.
-/

public section

namespace Kernel.Timer

/-- Ten Julian years (TED-BOUND-01). -/
def maxDurationMs : Nat := 315576000000

/-- Read `[nH][nM][nS]`, each unit after the previous one, accumulating milliseconds. -/
def components : Nat → List Char → List (Char × Nat) → Nat → Bool → Option Nat
  | 0, _, _, _, _ => none
  | _ + 1, [], _, total, seen => if seen then some total else none
  | fuel + 1, chars@(_ :: _), units, total, _ =>
    let digits := chars.takeWhile Char.isDigit
    match digits, chars.drop digits.length with
    | [], _ => none
    | _ :: _, [] => none
    | _ :: _, unit :: rest =>
      match units.dropWhile (·.1 != unit) with
      | (_, scale) :: later => components fuel rest later (total + (String.ofList digits).toNat! * scale) true
      | [] => none

/-- Milliseconds of an exact duration lexeme, `none` for any refused form. -/
def durationMs? (lexeme : String) : Option Nat :=
  match lexeme.toList with
  | 'P' :: 'T' :: rest =>
    (components (rest.length + 1) rest [('H', 3600000), ('M', 60000), ('S', 1000)] 0 false).bind fun total =>
      if 0 < total && total ≤ maxDurationMs then some total else none
  | _ => none

/-- The period of an unbounded cycle lexeme `R/<duration>`, `none` for any refused form. -/
def cyclePeriodMs? (lexeme : String) : Option Nat :=
  match lexeme.toList with
  | 'R' :: '/' :: rest => durationMs? (String.ofList rest)
  | _ => none

end Kernel.Timer
