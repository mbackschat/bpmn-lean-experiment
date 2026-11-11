/** A stand-in for the engine's registration of deployed definition versions in the definitions module's tests. */
import {
  DefinitionRegistrationStatus,
  type DefinitionVersionRegistrar,
  type DefinitionVersionRegistrationRequest,
} from "@bpmn-lean/platform-engine-gateway";

/** A registrar that registers every version, recording each request in `registered`. */
export function registeringEngine(): DefinitionVersionRegistrar & Readonly<{ registered: DefinitionVersionRegistrationRequest[] }> {
  const registered: DefinitionVersionRegistrationRequest[] = [];
  return {
    registered,
    registerDefinitionVersion: async (request) => {
      registered.push(request);
      return { status: DefinitionRegistrationStatus.Registered };
    },
  };
}
