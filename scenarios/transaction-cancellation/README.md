# Reservation withdrawal Transaction scenarios

The [profile](../../profiles/bpmn-2.0.2-transaction-cancellation-checkpoint-draft/README.md) selects the approved [Transaction cancellation account](../../docs/capsules/TRANSACTION-CANCELLATION-PROPOSAL.md). The exact [reservation model](reservation-withdrawal.bpmn) lets a reservation proceed while a withdrawal decision waits independently. A completed reservation is released before the parent acknowledges withdrawal; an unfinished reservation is interrupted without becoming compensation-eligible.

- [Empty cancellation](empty.scenario.json): withdraw before reserving and acknowledge without a handler.
- [Completed reservation with preparation open](retained-active.scenario.json): retain the completed reservation, interrupt preparation, release the resource, then acknowledge.
- [Completed ordinary branch](retained-ended.scenario.json): complete preparation first; the withdrawal wait keeps the Transaction active until cancellation and release.
- [Handler failure](handler-failed.scenario.json): a typed release failure terminates the Process without acknowledgement.

Each input binds the exact XML digest and profile, submits a stale reservation completion after Cancel, and uses the production content-bound command identity for handler completion. Inputs contain no expected results. The [differential tests](../../packages/differential/test/transaction-cancellation-pipeline-cases.test.ts) independently check stale-command state preservation, interruption, eligibility, delayed continuation and failure cleanup, with comparator mutations for missing continuation, early acknowledgement, lost compensation and failure misprojection.

These scenarios select no CIB Transaction oracle and establish no successful protocol-controlled Transaction, hazard recovery, multi-subject compensation, generic Transaction control flow or Product 2 browser-catalog eligibility.
