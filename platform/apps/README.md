# Platform applications

Applications are deployable composition roots. They wire modules and infrastructure without owning business rules.

- [Server](server/README.md) composes the public HTTP API and runtime configuration.
- [Web](web/README.md) is the static React client and communicates only through the public HTTP API.

[ARCHITECTURE.md](../../docs/ARCHITECTURE.md#applications) owns the complete application boundary.
