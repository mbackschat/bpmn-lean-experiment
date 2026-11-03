# Single-scope model scenarios

The [single-scope models proposal](../../docs/capsules/SINGLE-SCOPE-MODELS-SPEC.md#separating-witnesses) owns the bounded account; the models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) without an embedded Sub-Process, each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [purchase request](purchase-request.bpmn) with its [handler](purchase-request-overlay.json) reviews a request and forks at the root into the mapped Service Task *Check budget*, followed by the plain Task *Log budget check*, and the Manual Task *Collect signature*, followed by the User Task *Approve purchase*; the join throws *Purchase approved* before *Place order*.
- The [invoice clearing](invoice-clearing.bpmn) with its [handler](invoice-clearing-overlay.json) reviews an invoice and validates it through a mapped Service Task into `verdict`; an invalid invoice passes the Manual Task *Contact supplier* back to the review round, and a valid one throws *Invoice cleared* before *Pay invoice*.

Four answer-free schedules:

- [Approval first](purchase-approval-first.scenario.json) approves the purchase before the *Check budget* result.
- [Budget first](purchase-budget-first.scenario.json) takes the *Check budget* result before the approval.
- [Valid at once](invoice-valid.scenario.json) validates the invoice in the first round.
- [Corrected](invoice-corrected.scenario.json) finds the invoice invalid, contacts the supplier and validates it in a second round.
