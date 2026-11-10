module

public import Kernel.Hooks

/-! # Data: Java values and EL coercions for the Core JUEL evaluator

Java's carriers for portable values, the UTF-16 view of a String that Java's rules count in, and the EL coercions
between them (`TypeConverterImpl`; EL §1.18), as the pinned `cibseven-juel` applies them
([expression semantics](../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#evaluation)).
-/

public section

namespace Kernel.Feature.Data.Juel

/-- Which Java class carries an Integer during one evaluation; only Java `equals` observes it. -/
inductive Carrier where
  | long
  | integer
  | unknown
  deriving DecidableEq, Repr

/-- A value during evaluation: a portable value with Java's carrier, a Decimal at any scale. -/
inductive JVal where
  | null
  | bool (value : Bool)
  | int (value : Int) (carrier : Carrier)
  | decimal (coefficient scale : Int)
  | string (value : String)
  | list (items : List Value)
  | map (entries : List (String × Value))

/-- Why an evaluation stopped: an EL error the site decides on, or a surface the kernel does not represent. -/
inductive Stop where
  | failure (code : String)
  | unsupported (code : String)

abbrev Eval (α : Type) := Except Stop α

def fail {α : Type} (code : String) : Eval α := .error (.failure code)
def limit {α : Type} (code : String) : Eval α := .error (.unsupported code)

/-- `ELException` and every other Java exception but `PropertyNotFoundException` and `ArithmeticException`
(`JuelExpression.java:62-76`). -/
def elError : String := "juel.error"
def malformed {α : Type} : Eval α := limit "expression.juel.malformed"

def wrap64 (value : Int) : Int := (value + 9223372036854775808) % 18446744073709551616 - 9223372036854775808
def wrap32 (value : Int) : Int := (value + 2147483648) % 4294967296 - 2147483648
def long (value : Int) : JVal := .int (wrap64 value) .long
def integer (value : Int) : JVal := .int value .integer
/-- Decimal scales beyond this bound are a kernel limit: exact arithmetic on them is unbounded work. -/
def scaleBound : Int := 4096

/-! ## UTF-16 -/

def utf16 (text : String) : List Nat :=
  text.toList.flatMap fun char =>
    let code := char.toNat
    if code < 0x10000 then [code] else [0xD800 + (code - 0x10000) / 0x400, 0xDC00 + (code - 0x10000) % 0x400]

/-- The String of `units`, unless one is a lone surrogate. -/
def decodeUtf16 : List Nat → Option (List Char)
  | [] => some []
  | high :: rest =>
    if high < 0xD800 || high > 0xDFFF then (Char.ofNat high :: ·) <$> decodeUtf16 rest
    else if high ≤ 0xDBFF then
      match rest with
      | low :: tail =>
        if 0xDC00 ≤ low && low ≤ 0xDFFF then
          (Char.ofNat (0x10000 + (high - 0xD800) * 0x400 + (low - 0xDC00)) :: ·) <$> decodeUtf16 tail
        else none
      | [] => none
    else none

/-- Java `String.compareTo`: lexicographic by UTF-16 code unit. -/
def compareUnits : List Nat → List Nat → Ordering
  | [], [] => .eq
  | [], _ :: _ => .lt
  | _ :: _, [] => .gt
  | a :: left, b :: right => if a < b then .lt else if a > b then .gt else compareUnits left right

def firstIndex (needle haystack : List Nat) : Option Nat :=
  (List.range (haystack.length + 1)).find? fun index => needle.isPrefixOf (haystack.drop index)

def lastIndex (needle haystack : List Nat) : Option Nat :=
  (List.range (haystack.length + 1)).reverse.find? fun index => needle.isPrefixOf (haystack.drop index)

/-- Every non-overlapping occurrence of a non-empty `target`, left to right. -/
def replaceUnits (target replacement : List Nat) : List Nat → List Nat
  | [] => []
  | unit :: rest =>
    if target.isPrefixOf (unit :: rest) then replacement ++ replaceUnits target replacement (rest.drop (target.length - 1))
    else unit :: replaceUnits target replacement rest
  termination_by units => units.length
  decreasing_by all_goals (simp_all [List.length_drop] <;> omega)

/-- Java `String.trim`: strip characters up to U+0020 at both ends. -/
def javaTrim (chars : List Char) : List Char :=
  let blank (char : Char) : Bool := char.toNat ≤ 0x20
  ((chars.dropWhile blank).reverse.dropWhile blank).reverse

def isAscii (text : String) : Bool := text.toList.all fun char => char.toNat < 128

/-! ## Numeric text -/

def unsign : List Char → Bool × List Char
  | '-' :: rest => (true, rest)
  | '+' :: rest => (false, rest)
  | rest => (false, rest)

/-- `Long.parseLong`'s ASCII grammar: an optional sign and at least one digit. -/
def signedDigits? (chars : List Char) : Option Int :=
  let (negative, body) := unsign chars
  if body.isEmpty || !body.all Char.isDigit then none
  else
    let magnitude : Int := body.foldl (fun total char => total * 10 + (char.toNat - '0'.toNat)) 0
    some (if negative then -magnitude else magnitude)

/-- Digits, then the rest. -/
def digitRun (chars : List Char) (digit : Char → Bool) : List Char × List Char :=
  (chars.takeWhile digit, chars.dropWhile digit)

/-- An optional point and its digits, then the rest. -/
def fractionRun (chars : List Char) (digit : Char → Bool) : List Char × List Char :=
  match chars with
  | '.' :: rest => digitRun rest digit
  | rest => ([], rest)

def isHex (char : Char) : Bool := char.isDigit || ('a' ≤ char && char ≤ 'f') || ('A' ≤ char && char ≤ 'F')

/-- An exponent marker in `markers`, an optional sign and digits, and nothing else. -/
def exponentOnly (markers : List Char) : List Char → Bool
  | marker :: rest => markers.contains marker && (signedDigits? rest).isSome
  | [] => false

def decimalFloat (chars : List Char) : Bool :=
  let (whole, afterWhole) := digitRun chars Char.isDigit
  let (fraction, rest) := fractionRun afterWhole Char.isDigit
  (!whole.isEmpty || !fraction.isEmpty) && (rest.isEmpty || exponentOnly ['e', 'E'] rest)

def hexFloat : List Char → Bool
  | '0' :: marker :: chars =>
    let (whole, afterWhole) := digitRun chars isHex
    let (fraction, rest) := fractionRun afterWhole isHex
    (marker == 'x' || marker == 'X') && (!whole.isEmpty || !fraction.isEmpty) && exponentOnly ['p', 'P'] rest
  | _ => false

/-- `Double.valueOf` acceptance after `String.trim`; the Double itself is never built. -/
def doubleText (text : String) : Bool :=
  let (_, body) := unsign (javaTrim text.toList)
  let numeral := match body.getLast? with
    | some suffix => if ['f', 'F', 'd', 'D'].contains suffix then body.dropLast else body
    | none => body
  body == "NaN".toList || body == "Infinity".toList || decimalFloat numeral || hexFloat numeral

/-- `new BigDecimal(String)`: sign, digits with at most one point and at least one digit, an optional exponent. -/
def decimalText (text : String) : Eval (Int × Int) :=
  let (negative, body) := unsign text.toList
  let (whole, afterWhole) := digitRun body Char.isDigit
  let (fraction, rest) := fractionRun afterWhole Char.isDigit
  let exponent? : Option Int := match rest with
    | [] => some 0
    | marker :: tail => if marker == 'e' || marker == 'E' then signedDigits? tail else none
  match exponent? with
  | none => fail elError
  | some exponent =>
    let scale : Int := fraction.length - exponent
    if whole.isEmpty && fraction.isEmpty then fail elError
    else if scale < -2147483648 || scale > 2147483647 then fail elError
    -- dynamic-only: a scale this large is exact in Java but unbounded work here.
    else if scale > scaleBound || scale < -scaleBound then limit "juel.decimalRange"
    else
      let magnitude : Int := (whole ++ fraction).foldl (fun total char => total * 10 + (char.toNat - '0'.toNat)) 0
      .ok (if negative then -magnitude else magnitude, scale)

/-! ## Values -/

/-- A context value as Java sees it: Integers of unknown class, a `stringList` as the ArrayList of Strings it is in CIB. -/
def fromValue : Value → JVal
  | .null => .null
  | .bool value => .bool value
  | .int value => .int value .unknown
  | .decimal coefficient scale => .decimal coefficient scale
  | .string value => .string value
  | .stringList items => .list (items.map Value.string)
  | .list items => .list items
  | .map entries => .map entries

/-- A result as the Multi-Instance count and collection sites read it, before the domain predicate: any Integer within
±(2^53−1), the bound the TypeScript kernel's numbers share, and a Decimal at any scale, a negative one rescaled to 0. -/
def siteValue : JVal → Option Value
  | .null => some .null
  | .bool value => some (.bool value)
  | .int value _ => if value.natAbs ≤ 9007199254740991 then some (.int value) else none
  | .decimal coefficient scale =>
    some (if scale < 0 then .decimal (coefficient * 10 ^ scale.natAbs) 0 else .decimal coefficient scale.toNat)
  | .string value => some (.string value)
  | .list items => some (.list items)
  | .map entries => some (.map entries)

/-- The portable value of a result, or `none` outside the domain (DATA-SEMANTICS-SPEC "Values"). -/
def portable : JVal → Option Value
  | .null => some .null
  | .bool value => some (.bool value)
  | .int value _ => if 0 ≤ value && value ≤ 9007199254740991 then some (.int value) else none
  | .decimal coefficient scale =>
    if canonicalDecimal coefficient scale then some (.decimal coefficient scale.toNat) else none
  | .string value => if value.utf8ByteSize ≤ 1024 then some (.string value) else none
  | .list items => some (.list items)
  | .map entries => some (.map entries)

def isBlank : JVal → Bool
  | .null => true
  | .string value => value.isEmpty
  | _ => false

/-! ## Coercions (`TypeConverterImpl`; EL §1.18) -/

def toBool (value : JVal) : Eval Bool :=
  if isBlank value then .ok false
  else match value with
    | .bool value => .ok value
    | .string value => .ok (isAscii value && value.toLower == "true")
    | .null | .int _ _ | .decimal _ _ | .list _ | .map _ => fail elError

/-- `coefficient × 10^-scale` truncated toward zero. -/
def truncated (coefficient scale : Int) : Int :=
  if scale ≥ 0 then coefficient.tdiv (10 ^ scale.toNat) else coefficient * 10 ^ (-scale).toNat

def toLong (value : JVal) : Eval Int :=
  if isBlank value then .ok 0
  else match value with
    | .int value _ => .ok value
    | .decimal coefficient scale => .ok (wrap64 (truncated coefficient scale))
    | .string text =>
      -- dynamic-only: `Long.valueOf` reads Unicode digits the kernel does not model.
      if !isAscii text then limit "juel.nonAsciiText"
      else match signedDigits? text.toList with
        | some parsed => if wrap64 parsed == parsed then .ok parsed else fail elError
        | none => fail elError
    | .null | .bool _ | .list _ | .map _ => fail elError

def toDecimal (value : JVal) : Eval (Int × Int) :=
  if isBlank value then .ok (0, 0)
  else match value with
    | .decimal coefficient scale => .ok (coefficient, scale)
    -- dynamic-only: `new BigDecimal(double)` first rounds an Integer beyond 2^53 to a double.
    | .int value _ => if value.natAbs ≤ 9007199254740992 then .ok (value, 0) else limit "juel.double"
    | .string text =>
      -- dynamic-only: `new BigDecimal(String)` reads Unicode digits the kernel does not model.
      if !isAscii text then limit "juel.nonAsciiText" else decimalText text
    | .null | .bool _ | .list _ | .map _ => fail elError

def convertsToDouble (value : JVal) : Bool :=
  if isBlank value then true
  else match value with
    | .int _ _ | .decimal _ _ => true
    | .string text => doubleText text
    | .null | .bool _ | .list _ | .map _ => false

/-- A rule whose result is a Double: either conversion fails as Java's does, or the Double is a kernel limit. -/
def double (left right : JVal) : Eval JVal :=
  -- dynamic-only: whether an operand converts to a Double depends on the run's data.
  if convertsToDouble left && convertsToDouble right then limit "juel.double" else fail elError

/-- `BigDecimal.toString`: plain notation unless the scale is negative or the adjusted exponent is below −6. -/
def decimalString (coefficient scale : Int) : String :=
  let sign := if coefficient < 0 then "-" else ""
  let digits := (toString coefficient.natAbs).toList
  let count : Int := digits.length
  let adjusted := -scale + (count - 1)
  if scale ≥ 0 && adjusted ≥ -6 then
    if scale == 0 then sign ++ String.ofList digits
    else
      let point := count - scale
      if point > 0 then
        sign ++ String.ofList (digits.take point.toNat) ++ "." ++ String.ofList (digits.drop point.toNat)
      else sign ++ "0." ++ String.ofList (List.replicate (-point).toNat '0') ++ String.ofList digits
  else
    let mantissa := if count > 1 then String.ofList (digits.take 1) ++ "." ++ String.ofList (digits.drop 1)
      else String.ofList digits
    sign ++ mantissa ++ "E" ++ (if adjusted > 0 then "+" else "") ++ toString adjusted

def toText : JVal → Eval String
  | .null => .ok ""
  | .bool value => .ok (if value then "true" else "false")
  | .int value _ => .ok (toString value)
  | .decimal coefficient scale => .ok (decimalString coefficient scale)
  | .string value => .ok value
  -- dynamic-only: Java renders a collection by its host class.
  | .list _ | .map _ => limit "juel.collectionText"

/-- A String with `.`, `e` or `E` (`NumberOperations.isDotEe`). -/
def dotEe : JVal → Bool
  | .string value => value.any fun char => char == '.' || char == 'e' || char == 'E'
  | _ => false

end Kernel.Feature.Data.Juel
