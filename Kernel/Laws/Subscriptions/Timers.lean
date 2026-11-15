module

public import Kernel.IL.Timer

/-! # Laws of subscriptions: Timer lexemes

A lexeme is malformed only where CIB's parser certainly fails, and outside wherever that is uncertain (I-T1;
[subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#timers)). Each law is followed by its
non-vacuity witness. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Subscriptions

open Kernel

/-- A `/` duration whose first two parts start with `P` is malformed: CIB reads the second as the interval's end, a
date, which Joda's ISO parser cannot read. -/
def PeriodEndedInterval (parts : List (List Char)) (verdict : Timer.Classified) : Prop :=
  ∀ first second rest, parts = ('P' :: first) :: ('P' :: second) :: rest → verdict = .malformed .duration

/-- `PT<digits>.<fraction>S` with digits on one side of the point only is outside, never malformed: the JDK's
`BigDecimal` reads it, so CIB commits it. -/
def LooseSeconds (chars : List Char) (verdict : Timer.Classified) : Prop :=
  ∀ digits fraction, chars = ['P', 'T'] ++ digits ++ '.' :: fraction ++ ['S'] → (∀ c ∈ digits ++ fraction, c.isDigit) →
    (digits = [] ∨ fraction = []) → digits ++ fraction ≠ [] → verdict = .outside .duration

/-- A Cron seconds field that breaks a rule retained evidence certifies there: `?`, a letter, more than one `/`, a step
of 0, or a range without its end. -/
def CertifiedSecondsRule (field : List Char) : Prop :=
  field = ['?'] ∨ (∃ c ∈ field, c.isAlpha) ∨ (∃ a b c, field = a ++ '/' :: b ++ '/' :: c ∧ ∃ x ∈ c, x ≠ '/') ∨
    (∃ start zeros, field = start ++ '/' :: zeros ∧ '/' ∉ start ∧ zeros ≠ [] ∧ ∀ x ∈ zeros, x = '0') ∨
    (∃ before digits after, field = before ++ digits ++ '-' :: after ∧ digits ≠ [] ∧ (∀ x ∈ digits, x.isDigit) ∧
      (before = [] ∨ before.getLast? = some ',') ∧ (after = [] ∨ after.head? = some ','))

/-- A six-field Cron whose seconds field breaks a certified rule is malformed. The same text in another field is not
claimed malformed by this rule. -/
def CronSecondsVerdict (fields : List (List Char)) (verdict : Timer.Classified) : Prop :=
  ∀ seconds rest, fields = seconds :: rest → rest.length = 5 → CertifiedSecondsRule seconds → verdict = .malformed .cron

theorem interval_malformed : PeriodEndedInterval [['P', 'T', '1', 'H'], ['P', 'T', '2', 'H']] (.malformed .duration) :=
  fun _ _ _ _ => rfl

theorem interval_outside_rejected : ¬ PeriodEndedInterval [['P', 'T', '1', 'H'], ['P', 'T', '2', 'H']] (.outside .duration) :=
  fun law => nomatch law ['T', '1', 'H'] ['T', '2', 'H'] [] rfl

theorem loose_seconds_outside : LooseSeconds ['P', 'T', '1', '.', 'S'] (.outside .duration) :=
  fun _ _ _ _ _ _ => rfl

theorem loose_seconds_malformed_rejected : ¬ LooseSeconds ['P', 'T', '1', '.', 'S'] (.malformed .duration) :=
  fun law => nomatch law ['1'] [] rfl (by decide +kernel) (.inr rfl) (by simp)

theorem cron_letter_malformed :
    CronSecondsVerdict [['5', 'x'], ['*'], ['*'], ['*'], ['*'], ['?']] (.malformed .cron) :=
  fun _ _ _ _ _ => rfl

theorem cron_letter_outside_rejected :
    ¬ CronSecondsVerdict [['5', 'x'], ['*'], ['*'], ['*'], ['*'], ['?']] (.outside .cron) :=
  fun law => nomatch law ['5', 'x'] _ rfl rfl (.inr (.inl ⟨'x', by simp, by decide +kernel⟩))

theorem cron_zero_step_malformed : CertifiedSecondsRule ['*', '/', '0'] :=
  .inr (.inr (.inr (.inl ⟨['*'], ['0'], rfl, by simp, by simp, by simp⟩)))

theorem cron_open_range_malformed : CertifiedSecondsRule ['5', '-'] :=
  .inr (.inr (.inr (.inr ⟨[], ['5'], [], rfl, by simp, by decide +kernel, .inl rfl, .inl rfl⟩)))

end Kernel.Laws.Subscriptions
