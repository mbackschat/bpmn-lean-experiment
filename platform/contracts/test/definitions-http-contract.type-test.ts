import type {
  DefinitionDeployResult,
  DefinitionListResponse,
  PublicApiErrorResponse,
} from "../src/index.js";

declare const discriminantDeployment: DefinitionDeployResult;

// @ts-expect-error Public response discriminants are immutable.
discriminantDeployment.status = "rejected";

declare const deployment: DefinitionDeployResult;

if (deployment.status === "deployed") {
  // @ts-expect-error Definition fields are immutable.
  deployment.definition.version = 3;
  // @ts-expect-error Nested source identity is immutable.
  deployment.definition.source.sha256 = "0".repeat(64);
}

declare const listed: DefinitionListResponse;

// @ts-expect-error Definition arrays are immutable.
listed.definitions.push();

if (listed.definitions[0] !== undefined) {
  // @ts-expect-error Objects inside response arrays are immutable.
  listed.definitions[0].source.id = "replacement.bpmn";
}

declare const apiError: PublicApiErrorResponse;

// @ts-expect-error API error discriminants are immutable.
apiError.error.code = "invalidRequest";
