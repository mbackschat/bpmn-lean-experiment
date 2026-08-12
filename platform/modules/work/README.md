# Work module

This module owns Product 2 human-work registration, discovery, claim, completion, and audit behavior. Checkpoint 2 includes durable claim and release compare-and-set transitions, completion reservations and outcomes, a same-transaction audit outbox, fresh all-or-error task aggregation before actor-policy filtering, exact task detail, retry-safe mutations, and strict HTTP routes. The React inbox/form and live/browser evidence remain active work.

`SqliteConfirmedProcessWorkRepository` stores the exact public Process-instance snapshot with Product 1's private opaque locator in a dedicated `work.sqlite` database. Equivalent delivery is idempotent, changed identity or locator under one semantic Process-instance ID is an integrity failure, and every returned value is a defensive snapshot. The locator is never part of the public identity.

`SqliteWorkRepository` is the epoch-2 state owner. It persists registrations, positive observation classification, monotonic claim generations, exact retained action bindings, the closed completion lifecycle, and audit outbox acknowledgement. It stores no task row or engine history as semantic truth.

`WorkService` queries every nonclosed confirmed registration through its private engine locator, fails the complete snapshot when any registration is unresolved or a configured ceiling is exceeded, and applies actor policy only after the exact system task set is assembled. `WorkAuditOutboxService` idempotently delivers Work-owned audit snapshots before acknowledging their outbox rows.

`WorkTaskDetailService` projects the single declared field without collapsing absence, null, string, or Boolean. `WorkMutationService` binds every action to the resolved actor, exact task occurrence, generation, and submitted value before a host call; retains response-loss outcomes for exact retry; and keeps hidden or foreign tasks audit-silent. `WorkHttpRoutes` owns the strict global task, detail, claim, release, completion, and self-audit transport boundary.
