import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteConfirmedProcessInstanceRepository,
  SqliteDefinitionPresentationRepository,
  SqliteDefinitionRepository,
  SqliteDefinitionScheduleRepository,
  SqliteMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";

import { registerDefinitionsRepositoryContract } from "./support/definitions-repository-contract.ts";

registerDefinitionsRepositoryContract("SQLite Definitions repositories", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-definitions-contract-"));
  const databaseFile = join(root, "definitions.sqlite");
  const definitions = new SqliteDefinitionRepository(databaseFile);
  const presentations = new SqliteDefinitionPresentationRepository(databaseFile);
  const confirmed = new SqliteConfirmedProcessInstanceRepository(databaseFile);
  const schedules = new SqliteDefinitionScheduleRepository(databaseFile);
  const messages = new SqliteMessageStartPublicationRepository(databaseFile);
  return {
    definitions,
    presentations,
    confirmed,
    schedules,
    messages,
    dispose: async () => {
      messages.close();
      schedules.close();
      confirmed.close();
      presentations.close();
      definitions.close();
      await rm(root, { recursive: true, force: true });
    },
  };
});
