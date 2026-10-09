import { FileArtifactStore } from "@bpmn-lean/platform-artifact-store";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteDefinitionRepository, SqliteConfirmedProcessInstanceRepository, ConfirmedProcessInstancePublicationService } from "@bpmn-lean/platform-definitions";
import { registerRetainedOverlayRecoveryContract } from "./support/definitions-repository-contract.ts";

registerRetainedOverlayRecoveryContract("SQLite retained overlay", async () => {
  const root = await mkdtemp(join(tmpdir(), "retained-overlay-recovery-"));
  const file = join(root, "definitions.sqlite");
  const artifactRoot = join(root, "artifacts");
  let definitions = new SqliteDefinitionRepository(file);
  let confirmed = new SqliteConfirmedProcessInstanceRepository(file);
  let artifacts = new FileArtifactStore(artifactRoot);
  return {
    get definitions() { return definitions; },
    get confirmed() { return confirmed; },
    get artifacts() { return artifacts; },
    reopen: async () => {
      definitions.close(); confirmed.close();
      definitions = new SqliteDefinitionRepository(file);
      confirmed = new SqliteConfirmedProcessInstanceRepository(file);
      artifacts = new FileArtifactStore(artifactRoot);
    },
    recover: async (host, processInstanceId) => {
      const publication = new ConfirmedProcessInstancePublicationService({ repository: confirmed, operate: { recordConfirmedProcessInstance: async () => {} }, work: { recordConfirmedProcessInstance: async () => {} } });
      await publication.reconcileDirectProcessInstance(processInstanceId, host);
    },
    removeArtifact: async (sha256) => { await unlink(join(artifactRoot, "sha256", sha256)); },
    corruptArtifact: async (sha256, bytes) => { await writeFile(join(artifactRoot, "sha256", sha256), bytes); },
    dispose: async () => { definitions.close(); confirmed.close(); await rm(root, { recursive: true, force: true }); },
  };
});
