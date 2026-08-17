# Platform applications

Applications are deployable composition roots. They wire modules and infrastructure without owning business rules.

- [Server](server/README.md) composes the public HTTP API in one explicit local or shared storage mode.
- [PostgreSQL migration application](postgresql-migrate/README.md) is the explicit checksum-bound shared-database migration command and accepts only its dedicated migration credential.
- [PostgreSQL recovery worker](recovery-worker/README.md) supervises the eleven bounded shared-mode recovery families without serving HTTP or applying migrations.
- [Web](web/README.md) is the static React client and communicates only through the public HTTP API.

The root [evaluation Compose distribution](../../compose.yaml) deploys these Product 2 applications beside the separately owned Product 1 BPMN Worker. It changes no application ownership: migration remains one-shot, recovery remains non-HTTP, the web bundle stays static, and the API alone exposes the public origin.

[ARCHITECTURE.md](../../docs/ARCHITECTURE.md#applications) owns the complete application boundary.
