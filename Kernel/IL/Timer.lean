module

public import Kernel.IL.Types

/-! # Timer lexemes

The one classification of a Timer lexeme, shared by `Kernel.Admission.Subscriptions` (literals) and
`Kernel.Feature.Subscriptions` (literals and evaluated values), with what arming it needs
([subscriptions semantics](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#timers)). A lexeme is admitted,
outside the subset (conforming ISO 8601 or committed by CIB, but refused), or malformed for CIB's parser (CIB rolls back
the command that arms it). The kernel calls a lexeme malformed only where the pinned parser certainly fails; anything
uncertain is outside, since a static refusal claims nothing about CIB's run.

Every calendar computation is over UTC with logical time as milliseconds after `1970-01-01T00:00:00Z`; no time-zone
data enters the kernel. Each integer component is at most `maxComponent`, because the JDK's `Duration` getters
truncate to `int` (`DurationImpl.java:1162-1169`), and every deadline is at most `maxDeadlineMs`.
-/

public section

namespace Kernel.Timer

/-- Java's `Integer.MAX_VALUE`. -/
def maxComponent : Nat := 2147483647

/-- The canonical schema's safe integer, `2^53 - 1`. -/
def maxDeadlineMs : Nat := 9007199254740991

def msPerDay : Nat := 86400000

/-- Which Timer definition a lexeme fills. A cycle's dialect is read from the lexeme, as CIB does
(`CycleBusinessCalendar.java:55`: a leading `R` is ISO 8601, anything else Cron), never from `CycleDialect`. -/
inductive Kind where
  | duration
  | date
  | cycle
  deriving DecidableEq, Repr

/-- A refusal family: admission answers its static code (`Admission.Subscriptions.timerRefusal`), a run-time value its
dynamic-only twin. -/
inductive Code where
  | duration
  | date
  | cycle
  | cron
  deriving DecidableEq, Repr

def Code.dynamic : Code → String
  | .duration => "timer-duration"
  | .date => "timer-date"
  | .cycle => "timer-cycle"
  | .cron => "timer-cron"

/-- Calendar duration components; `PnW` is `7n` days. -/
structure Duration where
  years : Nat := 0
  months : Nat := 0
  days : Nat := 0
  hours : Nat := 0
  minutes : Nat := 0
  seconds : Nat := 0
  millis : Nat := 0
  deriving DecidableEq, Repr

/-- The allowed values of each Cron field in ascending order; a day field is `none` when it does not restrict. -/
structure CronFields where
  seconds : List Nat
  minutes : List Nat
  hours : List Nat
  daysOfMonth : Option (List Nat)
  months : List Nat
  daysOfWeek : Option (List Nat)
  deriving DecidableEq, Repr

/-- An admitted lexeme, independent of the arming instant. -/
inductive Parsed where
  | duration (value : Duration)
  | date (instantMs : Nat)
  /-- An undated ISO 8601 cycle with an exact period; `count = none` is unbounded. -/
  | cycle (periodMs : Nat) (count : Option Nat)
  | cron (text : String) (fields : CronFields)
  deriving Repr

inductive Classified where
  | admitted (parsed : Parsed)
  | outside (code : Code)
  | malformed (code : Code)
  deriving Repr

/-! ## Calendar -/

def leap (year : Nat) : Bool := year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)

def daysInMonth (year month : Nat) : Nat :=
  match month with
  | 2 => if leap year then 29 else 28
  | 4 | 6 | 9 | 11 => 30
  | _ => 31

/-- Days from the epoch to a proleptic Gregorian date of a year from 1 (H. Hinnant's `days_from_civil`). -/
def daysFromCivil (year month day : Nat) : Int :=
  let y := if month ≤ 2 then year - 1 else year
  let era := y / 400
  let yoe := y - era * 400
  let mp := if month > 2 then month - 3 else month + 9
  let doy := (153 * mp + 2) / 5 + day - 1
  let doe := yoe * 365 + yoe / 4 - yoe / 100 + doy
  (era * 146097 + doe : Nat) - 719468

/-- The date of a day counted from the epoch (H. Hinnant's `civil_from_days`). -/
def civilFromDays (days : Nat) : Nat × Nat × Nat :=
  let z := days + 719468
  let era := z / 146097
  let doe := z - era * 146097
  let yoe := (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
  let doy := doe - (365 * yoe + yoe / 4 - yoe / 100)
  let mp := (5 * doy + 2) / 153
  let day := doy - (153 * mp + 2) / 5 + 1
  let month := if mp < 10 then mp + 3 else mp - 9
  (if month ≤ 2 then yoe + era * 400 + 1 else yoe + era * 400, month, day)

/-- `duration` added at `now`: years, then months (each a calendar step clamping the day of month, as
`GregorianCalendar.add`), then days, hours, minutes, seconds and milliseconds (`DurationImpl.java:1790-1803`). -/
def addDuration (now : Nat) (duration : Duration) : Nat :=
  let (year, month, day) := civilFromDays (now / msPerDay)
  let year := year + duration.years
  let day := min day (daysInMonth year month)
  let months := month - 1 + duration.months
  let year := year + months / 12
  let month := months % 12 + 1
  let day := min day (daysInMonth year month)
  (daysFromCivil year month day).toNat * msPerDay + now % msPerDay + duration.days * msPerDay +
    duration.hours * 3600000 + duration.minutes * 60000 + duration.seconds * 1000 + duration.millis

/-! ## Lexical helpers -/

def digitsValue (digits : List Char) : Nat :=
  digits.foldl (fun value char => value * 10 + (char.toNat - '0'.toNat)) 0

/-- The leading digits and the rest. -/
def spanDigits (chars : List Char) : List Char × List Char :=
  (chars.takeWhile Char.isDigit, chars.dropWhile Char.isDigit)

/-- `chars` split at every `separator`. -/
def splitAt (chars : List Char) (separator : Char) : List (List Char) :=
  let (last, done) := chars.foldl (fun (current, done) char =>
    if char == separator then ([], current.reverse :: done) else (char :: current, done)) ([], [])
  (last.reverse :: done).reverse

/-- `chars` split at `separator`, dropping trailing empty parts as Java's `String#split` does. -/
def splitJava (chars : List Char) (separator : Char) : List (List Char) :=
  ((splitAt chars separator).reverse.dropWhile List.isEmpty).reverse

/-! ## Durations -/

/-- One component: designator, integer digits, fraction digits. -/
abbrev Component := Char × List Char × List Char

/-- Read components whose designators come from `units` in order, until the input ends or reaches `T`. A fraction is
read here and checked by the caller. -/
def readUnits : Nat → List Char → List Char → Option (List Component × List Char)
  | 0, _, _ => none
  | _ + 1, [], _ => some ([], [])
  | _ + 1, chars@('T' :: _), _ => some ([], chars)
  | fuel + 1, chars@(_ :: _), units =>
    match spanDigits chars with
    | ([], _) => none
    | (digits, '.' :: rest) =>
      match spanDigits rest with
      | ([], _) => none
      | (fraction, unit :: rest) =>
        match units.dropWhile (· != unit) with
        | _ :: later => (readUnits fuel rest later).map fun (list, rest) => ((unit, digits, fraction) :: list, rest)
        | [] => none
      | (_, []) => none
    | (digits, unit :: rest) =>
      match units.dropWhile (· != unit) with
      | _ :: later => (readUnits fuel rest later).map fun (list, rest) => ((unit, digits, []) :: list, rest)
      | [] => none
    | (_, []) => none

/-- The `xsd:duration` lexical form after `P` (fraction only on seconds), as date and time components. -/
def xsdDuration (chars : List Char) : Option (List Component × List Component) := do
  let (date, rest) ← readUnits (chars.length + 1) chars ['Y', 'M', 'D']
  match rest with
  | [] => if date.isEmpty then none else some (date, [])
  | 'T' :: time =>
    match readUnits (time.length + 1) time ['H', 'M', 'S'] with
    | some (components@(_ :: _), []) => some (date, components)
    | _ => none
  | _ => none

/-- The value of the component with `unit`. -/
def componentValue (components : List Component) (unit : Char) : Nat :=
  match components.find? (·.1 == unit) with
  | some (_, digits, _) => digitsValue digits
  | none => 0

def classifyDuration (lexeme : String) : Classified :=
  let chars := lexeme.toList
  if chars.contains '/' then
    if (splitJava chars '/').length > 3 then .malformed .duration else .outside .duration
  else
    match chars with
    | 'P' :: rest =>
      match spanDigits rest with
      | (weeks@(_ :: _), ['W']) =>
        if digitsValue weeks > maxComponent then .outside .duration
        else .admitted (.duration { days := 7 * digitsValue weeks })
      | _ =>
        match xsdDuration rest with
        | none => .malformed .duration
        | some (date, time) =>
          let all := date ++ time
          let fraction := (time.find? (·.1 == 'S')).map (·.2.2) |>.getD []
          if all.any fun (unit, _, fraction) => unit != 'S' && !fraction.isEmpty then .malformed .duration
          else if fraction.length > 3 || all.any (fun (_, digits, _) => digitsValue digits > maxComponent) then
            .outside .duration
          else
            .admitted (.duration {
              years := componentValue date 'Y', months := componentValue date 'M', days := componentValue date 'D',
              hours := componentValue time 'H', minutes := componentValue time 'M',
              seconds := componentValue time 'S', millis := digitsValue (fraction ++ List.replicate (3 - fraction.length) '0') })
    | _ => .malformed .duration

/-! ## Dates -/

/-- The characters an ISO 8601 date lexeme can contain. -/
def dateAlphabet (char : Char) : Bool := char.isDigit || "+-:.,TtZzWw".toList.contains char

/-- `chars` against `template`, where `d` is a digit and `T` either case of the designator. -/
def shaped (template : String) (chars : List Char) : Bool :=
  template.length == chars.length && (template.toList.zip chars).all fun (expected, char) =>
    match expected with
    | 'd' => char.isDigit
    | 'T' => char == 'T' || char == 't'
    | other => other == char

def fieldDigits (chars : List Char) (start count : Nat) : Nat := digitsValue ((chars.drop start).take count)

/-- The offset in minutes east of UTC, `none` when the zone designator is not `Z` or `±hh:mm`; malformed ranges
answer `some (none)`. -/
def offsetMinutes : List Char → Option (Option Int)
  | ['Z'] | ['z'] => some (some 0)
  | zone@(sign :: _ :: _ :: ':' :: _ :: _ :: []) =>
    if (sign == '+' || sign == '-') && shaped "+dd:dd" ('+' :: zone.drop 1) then
      let hours := fieldDigits zone 1 2
      let minutes := fieldDigits zone 4 2
      if hours > 23 || minutes > 59 then some none
      else some (some ((if sign == '-' then -1 else 1) * ((hours * 60 + minutes : Nat) : Int)))
    else none
  | _ => none

def classifyDate (lexeme : String) : Classified :=
  let chars := lexeme.toList
  match chars with
  | [] => .malformed .date
  | 'P' :: _ => .outside .date
  | _ =>
    if !chars.all dateAlphabet then .malformed .date
    else if !shaped "dddd-dd-ddTdd:dd:dd" (chars.take 19) then .outside .date
    else
      let rest := chars.drop 19
      let (fraction, zone) := match rest with
        | '.' :: more => spanDigits more
        | _ => ([], rest)
      let fractionOk := match rest with
        | '.' :: _ => !fraction.isEmpty
        | _ => true
      match fractionOk, offsetMinutes zone with
      | true, some (some offset) =>
        let (year, month, day) := (fieldDigits chars 0 4, fieldDigits chars 5 2, fieldDigits chars 8 2)
        let (hour, minute, second) := (fieldDigits chars 11 2, fieldDigits chars 14 2, fieldDigits chars 17 2)
        if month < 1 || month > 12 || day < 1 || day > daysInMonth year month || hour > 23 || minute > 59 ||
            second > 59 then .malformed .date
        else if fraction.length > 3 || year < 1 then .outside .date
        else
          let millis := digitsValue (fraction ++ List.replicate (3 - fraction.length) '0')
          let instant := daysFromCivil year month day * (msPerDay : Int) +
            ((hour * 3600000 + minute * 60000 + second * 1000 + millis : Nat) : Int) - offset * 60000
          if instant < 0 || instant > (maxDeadlineMs : Int) then .outside .date else .admitted (.date instant.toNat)
      | true, some none => .malformed .date
      | _, _ => .outside .date

/-! ## Cron (Quartz as CIB parses it by default, CIB-CFG; owner decision 2026-11-08) -/

/-- One field read in the subset: its values, a wildcard `*`, `?`, outside the subset, or certainly malformed. -/
inductive CronField where
  | values (list : List Nat)
  | any
  | unspecified
  | outside
  | malformed
  deriving Repr

def cronItems (low high : Nat) (items : List (List Char)) : CronField :=
  let read : List Char → Option (Nat × Nat) := fun item =>
    match spanDigits item with
    | (first@(_ :: _), []) => some (digitsValue first, digitsValue first)
    | (first@(_ :: _), '-' :: rest) =>
      match spanDigits rest with
      | (last@(_ :: _), []) => some (digitsValue first, digitsValue last)
      | _ => none
    | _ => none
  match items.mapM read with
  | none => .outside
  | some ranges =>
    if ranges.any fun (first, last) => first < low || last > high || first > high || last < low then .malformed
    else if ranges.any fun (first, last) => first > last then .outside
    else .values ((List.range (high + 1)).filter fun value =>
      ranges.any fun (first, last) => first ≤ value && value ≤ last)

def cronField (low high : Nat) (text : List Char) : CronField :=
  match text with
  | ['*'] => .any
  | ['?'] => .unspecified
  | _ =>
    match splitJava text '/' with
    | [start, step] =>
      match start, spanDigits step with
      | ['*'], (digits@(_ :: _), []) =>
        if digitsValue digits == 0 then .outside
        else .values ((List.range (high + 1)).filter fun value => low ≤ value && (value - low) % digitsValue digits == 0)
      | first, (digits@(_ :: _), []) =>
        match spanDigits first with
        | (from_@(_ :: _), []) =>
          if digitsValue from_ < low || digitsValue from_ > high then .malformed
          else if digitsValue digits == 0 then .outside
          else .values ((List.range (high + 1)).filter fun value =>
            digitsValue from_ ≤ value && (value - digitsValue from_) % digitsValue digits == 0)
        | _ => .outside
      | _, _ => .outside
    | [_] => cronItems low high (splitAt text ',')
    | _ => .outside

def cronAlphabet (char : Char) : Bool := char.isAlphanum || "*?/,-# ".toList.contains char

/-- The Quartz day of week (1 = Sunday) of a day counted from the epoch, a Thursday. -/
def weekday (day : Nat) : Nat := (day + 4) % 7 + 1

def dayMatches (fields : CronFields) (day : Nat) : Bool :=
  let (_, month, dayOfMonth) := civilFromDays day
  fields.months.contains month &&
    (match fields.daysOfMonth with | some days => days.contains dayOfMonth | none => true) &&
    (match fields.daysOfWeek with | some days => days.contains (weekday day) | none => true)

/-- The first second of a day at or after `fromSecond` the time fields allow. -/
def secondOfDay (fields : CronFields) (fromSecond : Nat) : Option Nat :=
  fields.hours.findSome? fun hour => fields.minutes.findSome? fun minute =>
    (fields.seconds.find? fun second => hour * 3600 + minute * 60 + second ≥ fromSecond).map
      (hour * 3600 + minute * 60 + ·)

/-- The Gregorian calendar repeats every 146,097 days, so a Cron that matches nothing in that many days never does. -/
def scanDays (fields : CronFields) : Nat → Nat → Nat → Option Nat
  | 0, _, _ => none
  | fuel + 1, day, fromSecond =>
    match (if dayMatches fields day then secondOfDay fields fromSecond else none) with
    | some second => some (day * msPerDay + second * 1000)
    | none => scanDays fields fuel (day + 1) 0

/-- The first matching instant strictly after `afterMs` (`CronTimer.java:45-53`, over UTC). -/
def cronNext (fields : CronFields) (afterMs : Nat) : Option Nat :=
  let start := (afterMs / 1000 + 1) * 1000
  scanDays fields 146098 (start / msPerDay) ((start % msPerDay) / 1000)

def classifyCron (lexeme : String) : Classified :=
  let chars := lexeme.toList
  if !chars.all cronAlphabet then .malformed .cron
  else
    let parts := (splitAt chars ' ').filter (!·.isEmpty)
    match parts with
    | [seconds, minutes, hours, daysOfMonth, months, daysOfWeek] =>
      let (seconds, minutes, hours) := (cronField 0 59 seconds, cronField 0 59 minutes, cronField 0 23 hours)
      let (daysOfMonth, months, daysOfWeek) := (cronField 1 31 daysOfMonth, cronField 1 12 months, cronField 1 7 daysOfWeek)
      let malformed : CronField → Bool
        | .malformed => true
        | .values _ | .any | .unspecified | .outside => false
      if [seconds, minutes, hours, daysOfMonth, months, daysOfWeek].any malformed then .malformed .cron
      else
        let full (low high : Nat) : CronField → Option (List Nat)
          | .values list => some list
          | .any => some ((List.range (high + 1)).filter (low ≤ ·))
          | .unspecified | .outside | .malformed => none
        let day : CronField → Option (Option (List Nat))
          | .values list => some (some list)
          | .any | .unspecified => some none
          | .outside | .malformed => none
        match full 0 59 seconds, full 0 59 minutes, full 0 23 hours, day daysOfMonth, full 1 12 months,
            day daysOfWeek with
        | some seconds, some minutes, some hours, some daysOfMonth, some months, some daysOfWeek =>
          if daysOfMonth.isSome && daysOfWeek.isSome then .outside .cron
          else
            let fields := { seconds, minutes, hours, daysOfMonth, months, daysOfWeek }
            if (cronNext fields 0).isNone then .outside .cron else .admitted (.cron lexeme fields)
        | _, _, _, _, _, _ => .outside .cron
    | [_, _, _, _, _, _, _] => .outside .cron
    | _ => .malformed .cron

/-! ## Cycles -/

def classifyCycle (lexeme : String) : Classified :=
  let chars := lexeme.toList
  match chars with
  | 'R' :: _ =>
    match splitJava chars '/' with
    | ('R' :: count) :: [period] =>
      let repetitions : Option (Option Nat) := match count, spanDigits count with
        | [], _ => some none
        | _, (digits@(_ :: _), []) => if digitsValue digits > maxComponent then none else some (some (digitsValue digits))
        | _, _ => none
      match repetitions with
      | none =>
        -- `Integer.parseInt` also takes a sign, which the subset refuses; anything else throws.
        match count with
        | sign :: digits@(_ :: _) =>
          if (sign == '+' || sign == '-') && digits.all Char.isDigit && digitsValue digits ≤ maxComponent then
            .outside .cycle
          else .malformed .cycle
        | _ => .malformed .cycle
      | some (some 0) => .outside .cycle
      | some count =>
        match period with
        | 'P' :: _ =>
          match classifyDuration (String.ofList period) with
          | .admitted (.duration value) =>
            let periodMs := addDuration 0 { value with years := 0, months := 0 }
            if value.years != 0 || value.months != 0 || periodMs == 0 || periodMs > maxDeadlineMs then .outside .cycle
            else .admitted (.cycle periodMs count)
          | .admitted _ => .outside .cycle
          | .outside _ => .outside .cycle
          | .malformed _ => .malformed .cycle
        | _ => .malformed .cycle
    | [_, _, _] => .outside .cycle
    | _ => .malformed .cycle
  | _ => classifyCron lexeme

/-- The one classification of a Timer lexeme. -/
def classify : Kind → String → Classified
  | .duration => classifyDuration
  | .date => classifyDate
  | .cycle => classifyCycle

/-! ## Arming -/

/-- How an armed Timer repeats; the fields of `TimerRecurrence`. `remaining` counts the firings left including the
open one, `none` unbounded. -/
structure Repeat where
  periodMs : Option Nat := none
  cron : Option String := none
  remaining : Option Nat := none
  deriving Repr

structure Armed where
  deadlineMs : Nat
  recurrence : Option Repeat := none
  deriving Repr

def bounded (deadlineMs : Nat) : Option Nat := if deadlineMs ≤ maxDeadlineMs then some deadlineMs else none

/-- Arm an admitted lexeme at `now`; `none` when the deadline exceeds `maxDeadlineMs`, which is outside the subset at
run time. A date not after `now` is due at once and keeps its own instant (I2, item 5). -/
def armAt (now : Nat) : Parsed → Option Armed
  | .duration value => (bounded (addDuration now value)).map ({ deadlineMs := · })
  | .date instant => (bounded instant).map ({ deadlineMs := · })
  | .cycle periodMs count =>
    (bounded (now + periodMs)).map ({ deadlineMs := ·, recurrence := some { periodMs := some periodMs, remaining := count } })
  | .cron text fields =>
    ((cronNext fields now).bind bounded).map ({ deadlineMs := ·, recurrence := some { cron := some text } })

/-- The successor of a repeating Timer that fired at `deadlineMs`, one period or the next Cron match after it, never
after the firing's own time (no drift); `none` when the cycle ends. -/
def successor (deadlineMs : Nat) (recurrence : Repeat) : Option (Nat × Repeat) :=
  let remaining := recurrence.remaining.map (· - 1)
  if remaining == some 0 then none
  else
    let next := match recurrence.periodMs, recurrence.cron with
      | some period, _ => bounded (deadlineMs + period)
      | none, some text =>
        match classifyCron text with
        | .admitted (.cron _ fields) => (cronNext fields deadlineMs).bind bounded
        | .admitted _ | .outside _ | .malformed _ => none
      | none, none => none
    next.map (·, { recurrence with remaining })

/-! ## Host offers -/

/-- A Timer schedule resolved to what a host arms: one duration, an absolute instant, a cycle's period and its
repetitions (`none` unbounded), or a Cron expression. A duration, a cycle and a Cron expression count from their
deployment's deploy time, an instant does not (population contract, M8-INT-A). -/
inductive Resolved where
  | duration (ms : Nat)
  | date (instantMs : Nat)
  | cycle (periodMs : Nat) (repetitions : Option Nat)
  | cron (text : String)
  deriving Repr

/-- The resolution `Kernel.Host.definitionCapabilities` offers for a Timer start: an exact literal duration (no years
or months), a literal date, an undated ISO cycle or a literal Cron expression; every other form yields its dynamic-only
code, and admission refuses each at a root start first. -/
def resolve : TimerSchedule → Except String Resolved
  | .duration value =>
    match (ValueSource.literal? value).map (classify .duration) with
    | some (.admitted (.duration duration)) =>
      match duration.years == 0 && duration.months == 0, bounded (addDuration 0 duration) with
      | true, some ms => .ok (.duration ms)
      | _, _ => .error Code.duration.dynamic
    | _ => .error Code.duration.dynamic
  | .date value =>
    match (ValueSource.literal? value).map (classify .date) with
    | some (.admitted (.date instantMs)) => .ok (.date instantMs)
    | _ => .error Code.date.dynamic
  | .cycle value _ =>
    match (ValueSource.literal? value).map (classify .cycle) with
    | some (.admitted (.cycle periodMs count)) => .ok (.cycle periodMs count)
    | some (.admitted (.cron text _)) => .ok (.cron text)
    | some (.outside .cron) | some (.malformed .cron) => .error Code.cron.dynamic
    | _ => .error Code.cycle.dynamic

/-- Whether a Cron match strictly after `afterMs`, or a successor of one, is `dueMs`; each match is a whole second
after the one before, so `fuel` of `(dueMs - afterMs) / 1000 + 2` reaches every match up to `dueMs`. -/
def cronOccurs (fields : CronFields) (dueMs : Nat) : Nat → Nat → Bool
  | 0, _ => false
  | fuel + 1, afterMs =>
    match cronNext fields afterMs with
    | some next => next == dueMs || (next < dueMs && cronOccurs fields dueMs fuel next)
    | none => false

/-- Whether `dueMs` is an occurrence of a root Timer start resolved as `resolved` whose schedule counts from
`originMs`, its deployment's deploy time (M8-INT-A): a duration `originMs + d`; a date its own instant, also before the
origin; the `k`-th period after the origin for `1 ≤ k ≤ n`, every `k ≥ 1` when unbounded (CIB-INT-0008); a Cron match
strictly after the origin or after the match before it, as `successor` repeats it. -/
def occurs (originMs dueMs : Nat) : Resolved → Bool
  | .duration ms => dueMs == originMs + ms
  | .date instantMs => dueMs == instantMs
  | .cycle periodMs repetitions =>
    periodMs > 0 && dueMs > originMs && (dueMs - originMs) % periodMs == 0 &&
      repetitions.all ((dueMs - originMs) / periodMs ≤ ·)
  | .cron text =>
    match classifyCron text with
    | .admitted (.cron _ fields) => dueMs > originMs && cronOccurs fields dueMs ((dueMs - originMs) / 1000 + 2) originMs
    | .admitted _ | .outside _ | .malformed _ => false

end Kernel.Timer
