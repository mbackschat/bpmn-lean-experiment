# Inclusive Gateway region scenarios

The [Inclusive regions specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the models are witnesses for the [`cibseven-2.2.0-scope-chain` profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [account opening](account-opening.bpmn) with its [handler](account-opening-overlay.json) assesses the applicant in a Sub-Process whose output mappings return `riskRating`, `residency` and `channel`, then splits at the root *Required checks* into the Sub-Process *Enhanced due diligence*, the User Task *Collect tax residency form* and the Service Task *Verify identity document*, each under a condition, with *Standard verification* as default; *Checks complete* joins them before *Open account*.
- The [event booking](event-booking.bpmn) with its [handler](event-booking-overlay.json) quotes the event and forks into *Book venue* and the Inclusive split *Order extras*, whose conditioned *Order catering* and *Arrange technology* and unconditioned *Confirm attendee list* join at *Extras ordered*; *Arrange technology* is a nested Parallel fork and join, and *Event ready* joins the venue with the extras.

Eight answer-free schedules:

- [All checks, funds last](account-all-checks-funds-last.scenario.json) selects the three conditioned branches and completes the source-of-funds check last.
- [All checks, identity last](account-all-checks-identity-last.scenario.json) selects the same branches and completes the identity check last.
- [Residency only](account-residency-only.scenario.json) selects the tax residency branch alone, so the join waits for that one input.
- [Standard only](account-standard-only.scenario.json) selects no conditioned branch, so the default runs alone.
- [Risk and online](account-risk-and-online.scenario.json) selects due diligence and the identity check and skips the residency form.
- [Extras, venue first](booking-extras-venue-first.scenario.json) selects every extra and books the venue before any of them.
- [Extras, venue last](booking-extras-venue-last.scenario.json) selects every extra and books the venue after the extras join.
- [No extras](booking-no-extras.scenario.json) selects only the unconditioned attendee list.
