module

/-! # Java's lexical rules for numeric text

The one place each Java text-to-number rule the kernel reproduces is stated, so the expression, Multi-Instance and
decision sites that read text as a number share one reading. Every rule covers ASCII text only: Java reads digits
through `Character.digit`, which also accepts other Unicode digits, so a caller first refuses non-ASCII text with
`isAscii` and its own stable code. Part of `Kernel.IL.Types`, which re-exports it.
-/

public section

namespace Kernel

/-- Java `int` (`Integer.MIN_VALUE` to `Integer.MAX_VALUE`): the range of `Integer.parseInt`, of a DMN `integer` value
(`IntegerDataTypeTransformer.java:32-44`) and of a Multi-Instance count CIB reads through `intValue`. -/
def withinJavaInt (value : Int) : Bool := decide (-2147483648 ≤ value) && decide (value ≤ 2147483647)

def isAscii (text : String) : Bool := text.toList.all fun char => decide (char.toNat < 128)

/-- The sign of `Integer.parseInt`, `Long.parseLong` and `new BigDecimal(String)`: at most one leading `-` or `+`,
reported as whether the value is negative, then the rest. -/
def unsign : List Char → Bool × List Char
  | '-' :: rest => (true, rest)
  | '+' :: rest => (false, rest)
  | rest => (false, rest)

/-- The grammar `Integer.parseInt` and `Long.parseLong` share, before their range: an optional sign and at least one
ASCII digit. -/
def signedDigits? (chars : List Char) : Option Int :=
  let (negative, body) := unsign chars
  if body.isEmpty || !body.all Char.isDigit then none
  else
    let magnitude : Int := body.foldl (fun total char => total * 10 + (char.toNat - '0'.toNat)) 0
    some (if negative then -magnitude else magnitude)

/-- `Integer.parseInt` over ASCII text: `signedDigits?` within Java's `int`. -/
def parseJavaInt? (text : String) : Option Int :=
  (signedDigits? text.toList).filter withinJavaInt

/-- `Long.parseLong` over ASCII text: `signedDigits?` within Java's `long`. -/
def parseJavaLong? (text : String) : Option Int :=
  (signedDigits? text.toList).filter fun value => decide (-9223372036854775808 ≤ value) && decide (value ≤ 9223372036854775807)

/-- A JUEL integer literal: digits only, since a leading minus is the unary operator, within `Long.valueOf`'s range
(`Parser.java:140`); unlike `signedDigits?` it refuses a sign. -/
def integerLexeme? (digits : String) : Option Int :=
  if digits.isEmpty || !digits.all Char.isDigit then none
  else
    let value : Int := digits.foldl (fun total char => total * 10 + (char.toNat - '0'.toNat)) 0
    if value ≤ 9223372036854775807 then some value else none

end Kernel
