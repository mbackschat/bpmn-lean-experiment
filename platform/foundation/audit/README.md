# Platform audit foundation

This package owns append-only Product 2 audit storage and ascending insertion-order search. Work self-audit retains its exact `work_audit_events` epoch-1 database, event bytes, required actor filter, and cursor behavior.

Incident operations use a separate event factory and incident-action types, a separate exact epoch-1 `incident_audit_events` database, idempotent event identity, unique action-outcome facts, exact optional actor, hosting Process, complete incident, and action-kind filters, and an exclusive canonical opaque cursor. Neither repository assigns BPMN meaning or exposes its private insertion ordinal. Authorization remains in the identity-policy foundation and callers must apply it before search or mutation.

[ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#foundation-packages) owns the package boundary.
