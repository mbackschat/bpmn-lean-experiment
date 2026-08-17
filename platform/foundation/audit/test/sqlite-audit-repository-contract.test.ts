import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteAuditRepository,
  SqliteIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";

import { registerAuditRepositoryContract } from "./support/audit-repository-contract.ts";

registerAuditRepositoryContract("SQLite audit repositories", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-contract-"));
  const work = new SqliteAuditRepository(join(directory, "work.sqlite"));
  const incident = new SqliteIncidentAuditRepository(join(directory, "incident.sqlite"));
  return {
    work,
    incident,
    publishWork: async () => undefined,
    publishIncident: async () => undefined,
    dispose: async () => {
      work.close();
      incident.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
});
