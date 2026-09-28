import { test } from "node:test";
import assert from "node:assert/strict";
import { cashBalance } from "../lib/cash-balance.mjs";

test("cancelled receipt and its refund net to zero without changing payment records", () => {
  const payments = [{ id: "p1", sale_id: "s1", amount: 50 }];
  assert.equal(cashBalance(payments, []), 50);
  assert.equal(cashBalance(payments, [{ entry_type: "payment", amount: 50, reference_type: "sale_delete", reference_id: "s1" }]), 0);
});
test("inpatient receipt mirrored in cash book is not counted twice", () => {
  assert.equal(cashBalance([{ id: "p1", amount: 100 }], [{ entry_type: "receipt", amount: 100, reference_type: "inpatient_payment", reference_id: "p1" }]), 100);
});
test("purchase cancellation reverses its payment and preserves unrelated balances", () => {
  assert.equal(cashBalance([{ id: "p1", amount: 100 }], [
    { entry_type: "payment", amount: 40, reference_type: "purchase", reference_id: "b1" },
    { entry_type: "receipt", amount: 40, reference_type: "purchase_delete", reference_id: "b1" },
  ]), 100);
});
