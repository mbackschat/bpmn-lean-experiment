export const currentProcessInstanceDatabaseSchemaEpoch = 4;

/** Raised before row access when the complete Operate store needs a pre-release reset. */
export class OperateSchemaResetRequiredError extends Error {
  constructor() {
    super(
      "Operate SQLite schema is from an incompatible pre-release; reset the Operate database before restarting",
    );
    this.name = "OperateSchemaResetRequiredError";
  }
}
