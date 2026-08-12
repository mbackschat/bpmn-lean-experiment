# Work module

This module owns Product 2 human-work registration, discovery, claim, completion, and audit behavior. Checkpoint 2 now adds durable claim and release compare-and-set transitions, completion reservations and outcomes, and a same-transaction audit outbox. Task observation, HTTP, and UI remain active work.

`SqliteConfirmedProcessWorkRepository` stores the exact public Process-instance snapshot with Product 1's private opaque locator in a dedicated `work.sqlite` database. Equivalent delivery is idempotent, changed identity or locator under one semantic Process-instance ID is an integrity failure, and every returned value is a defensive snapshot. The locator is never part of the public identity.

`SqliteWorkRepository` is the epoch-2 state owner. It persists registrations, positive observation classification, monotonic claim generations, exact retained action bindings, the closed completion lifecycle, and audit outbox acknowledgement. It stores no task row or engine history as semantic truth.
