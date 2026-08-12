# Work module

This module owns Product 2 human-work registration, discovery, claim, completion, and audit behavior. At checkpoint 1 it implements only the durable confirmed-Process registration required by the Definitions subscriber. Task observation, actor policy, claims, completion, audit, HTTP, and UI remain paused until the checkpoint contract receives independent approval.

`SqliteConfirmedProcessWorkRepository` stores the exact public Process-instance snapshot with Product 1's private opaque locator in a dedicated `work.sqlite` database. Equivalent delivery is idempotent, changed identity or locator under one semantic Process-instance ID is an integrity failure, and every returned value is a defensive snapshot. The locator is never part of the public identity.
