import { test } from "@playwright/test";

import { completeInvoiceJourney } from "./business-invoice-journey.ts";

test("caught invoice and policy errors return to fresh reviews and complete publicly", async ({ page }) => {
  await completeInvoiceJourney(page, {
    fixture: "invoice-error-recovery",
    scenario: "mixed-task-business-error",
    profile: "cibseven-2.2.0-mixed-task-business-error-draft",
    processId: "Invoice",
    initialVariables: [["request", "initial"], ["result", "parent-result"]],
    tasks: [
      { elementId: "Review", activation: 1, name: "Review invoice", initial: "initial", submitted: "missing-reference" },
      { elementId: "CorrectData", activation: 1, name: "Correct invoice data", initial: "missing-reference", submitted: "policy-review" },
      { elementId: "Review", activation: 2, name: "Review invoice", initial: "policy-review", submitted: "policy-review" },
      { elementId: "ReviewPolicy", activation: 1, name: "Review purchasing policy", initial: "policy-review", submitted: "INV-42" },
      { elementId: "Review", activation: 3, name: "Review invoice", initial: "INV-42", submitted: "INV-42" },
      { elementId: "Finalize", activation: 1, name: "Finalize invoice", initial: "INV-42", submitted: "INV-42" },
    ],
    effects: [["Validate", 1, "bpmnError"], ["Validate", 2, "success"], ["Authorize", 1, "bpmnError"], ["Validate", 3, "success"], ["Authorize", 2, "success"]],
    finalVariables: [["decision", "valid"], ["request", "INV-42"], ["result", "parent-result"]],
  });
});
