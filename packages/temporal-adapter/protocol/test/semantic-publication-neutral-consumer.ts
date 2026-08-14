import {
  requireCanonicalExecutionPublicationExport,
  serializeExecutionPublicationExport,
} from "../dist/index.js";
import type {
  ExecutionPublicationValidationContext,
} from "../dist/index.js";

declare const context: ExecutionPublicationValidationContext;
declare const publication: unknown;

const bytes: Uint8Array = serializeExecutionPublicationExport(publication, context);
const decoded = requireCanonicalExecutionPublicationExport(bytes, context);

void decoded;
