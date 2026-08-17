import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteWorkRepository } from "@bpmn-lean/platform-work";

import { registerWorkRepositoryContract } from "./support/work-repository-contract.ts";

registerWorkRepositoryContract("SQLite Work repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-contract-"));
  const databaseFile = join(root, "work.sqlite");
  const first = new SqliteWorkRepository(databaseFile);
  const second = new SqliteWorkRepository(databaseFile);
  return {
    first,
    second,
    dispose: async () => {
      await first.close();
      await second.close();
      await rm(root, { recursive: true, force: true });
    },
  };
});
