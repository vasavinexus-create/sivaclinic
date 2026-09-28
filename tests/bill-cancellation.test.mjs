import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const initial = await migration("migrations/202608110001_initial_sivacare.sql");
  await db.exec(initial.replace("create extension if not exists pgcrypto;", "").split("insert into storage.buckets")[0]);
  for (const file of ["migrations/202609130000_account_ledgers.sql", "migrations/202609130001_deleted_bill_audit.sql", "migrations/202609130003_journal_accounting.sql", "sql-editor-inpatient-fees-ledger.sql", "migrations/202609220000_atomic_bill_cancellation.sql"]) await db.exec(await migration(file));
  await db.exec(`grant usage on schema public,auth to authenticated; grant all on all tables in schema public to authenticated; grant usage on all sequences in schema public to authenticated;`);
});
after(async () => { await db.close(); });

async function fixture({ old = false, credit = false, bank = false, role = "pharmacist", returned = 0 } = {}) {
  await db.exec("reset role");
  const f = Object.fromEntries(["org", "user", "admin", "patient", "doctor", "consult", "product", "batch", "sale", "journal"].map((key) => [key, randomUUID()]));
  await db.query("insert into organizations(id,name,clinic_name) values($1,'Test','Test')", [f.org]);
  for (const [user, userRole] of [[f.user, role], [f.admin, "admin"]]) {
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("insert into profiles(id,organization_id,full_name,role) values($1,$2,'Tester',$3)", [user, f.org, userRole]);
  }
  await db.query("insert into patients(id,organization_id,patient_id,name,mobile,address) values($1,$2,'P','Patient','','')", [f.patient, f.org]);
  await db.query("insert into doctors(id,organization_id,doctor_id,name) values($1,$2,'D','Doctor')", [f.doctor, f.org]);
  await db.query("insert into consultations(id,organization_id,patient_id,doctor_id,doctor_fee) values($1,$2,$3,$4,20)", [f.consult,f.org,f.patient,f.doctor]);
  await db.query("insert into products(id,organization_id,product_id,name) values($1,$2,'MED','Medicine')", [f.product, f.org]);
  await db.query("insert into medicine_batches(id,organization_id,product_id,batch_number,expiry_date,current_stock,purchase_rate,mrp,selling_rate) values($1,$2,$3,'B','2030-01-01',7,5,10,10)", [f.batch, f.org, f.product]);
  await db.query(`insert into sales(id,organization_id,invoice_no,patient_id,consultation_id,sold_at,grand_total,pharmacy_revenue,doctor_fee,payment_mode,sale_type)
    values($1,$2,'INV',$3,$4,now()-($5::int * interval '1 day'),50,30,20,$6,$7)`, [f.sale,f.org,f.patient,f.consult,old ? 2 : 0,credit ? "credit" : bank ? "bank" : "cash", credit ? "inpatient" : "outpatient"]);
  await db.query("update consultations set doctor_fee_collected=true,doctor_fee_collected_bill_id=$1 where id=$2", [f.sale,f.consult]);
  // Repeated batch rows and partial returns must not over-restore stock.
  for (const [qty, ret] of [[2, returned], [1, 0]]) await db.query("insert into sale_items(organization_id,sale_id,product_id,batch_id,quantity,returned_quantity,unit_rate,mrp,line_total) values($1,$2,$3,$4,$5::numeric,$6,10,10,$5::numeric*10)", [f.org,f.sale,f.product,f.batch,qty,ret]);
  if (!credit) await db.query("insert into payments(organization_id,sale_id,amount,mode) values($1,$2,50,$3)", [f.org,f.sale,bank ? "bank" : "cash"]);
  if (credit) await db.query("insert into patient_ledger(organization_id,patient_id,particulars,reference_type,reference_id,debit) values($1,$2,'Bill','inpatient_bill',$3,50)", [f.org,f.patient,f.sale]);
  await db.query("insert into journal_entries(id,organization_id,voucher_no,voucher_type,entry_date,reference_type,reference_id) values($1,$2,'J','sale',current_date,$3,$4)", [f.journal,f.org,credit ? "inpatient_bill" : "sale",f.sale]);
  await db.query("insert into journal_lines(organization_id,journal_entry_id,ledger_name,debit,credit) values($1,$2,$3,50,0),($1,$2,'Pharmacy Sales',0,30),($1,$2,'Doctor Fee Income',0,20)", [f.org,f.journal,credit ? "Patient Receivable" : bank ? "Bank" : "Cash"]);
  await login(f.user);
  return f;
}
async function login(user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
const cancel = (f, kind = "sale") => db.query("select cancel_bill($1,$2,'Test cancellation')", [kind, kind === "sale" ? f.sale : f.purchase]);

test("same-day sale restores stock once, offsets cash, releases fees and queues audit", async () => {
  const f = await fixture();
  await cancel(f);
  assert.equal(Number(await scalar("select current_stock from medicine_batches where id=$1", [f.batch])), 10);
  assert.equal(await scalar("select doctor_fee_collected from consultations where id=$1", [f.consult]), false);
  assert.equal(Number(await scalar("select sum(amount) from cash_ledger where reference_id=$1 and entry_type='payment'", [f.sale])), 50);
  assert.equal(Number(await scalar("select sum(debit-credit) from journal_lines where ledger_name='Cash'")), 0);
  assert.equal(Number(await scalar("select count(*) from deleted_sales_audit where not audited")), 1);
  await assert.rejects(cancel(f), /already cancelled/);
  assert.equal(Number(await scalar("select current_stock from medicine_batches where id=$1", [f.batch])), 10);
  await assert.rejects(db.query("update sales set status='completed' where id=$1", [f.sale]), /cannot be changed/);
});

test("old bills require admin even for direct status updates", async () => {
  const f = await fixture({ old: true });
  await assert.rejects(cancel(f), /Only admin/);
  await assert.rejects(db.query("update sales set status='cancelled' where id=$1", [f.sale]), /Only admin/);
  await assert.rejects(db.query("update sales set sold_at=now() where id=$1", [f.sale]), /Only admin/);
  await login(f.admin); await cancel(f);
  assert.equal(await scalar("select status from sales where id=$1", [f.sale]), "cancelled");
});

test("only admin can mark audit; history remains but pending queue becomes empty", async () => {
  const f = await fixture(); await cancel(f);
  await assert.rejects(db.query("update deleted_sales_audit set audited=true where sale_id=$1", [f.sale]), /Only clinic admin/);
  await login(f.admin);
  await db.query("update deleted_sales_audit set audited=true where sale_id=$1", [f.sale]);
  assert.equal(Number(await scalar("select count(*) from deleted_sales_audit where not audited")), 0);
  assert.equal(await scalar("select audited_by from deleted_sales_audit where sale_id=$1", [f.sale]), f.admin);
  await assert.rejects(db.query("update deleted_sales_audit set deleted_reason='tampered' where sale_id=$1", [f.sale]), /history cannot/);
});

test("inpatient credit cancellation reverses receivable without refunding unrelated deposits", async () => {
  const f = await fixture({ credit: true });
  await db.query("insert into payments(organization_id,patient_id,amount,mode) values($1,$2,100,'cash')", [f.org,f.patient]);
  await cancel(f);
  assert.equal(Number(await scalar("select sum(debit-credit) from patient_ledger where patient_id=$1", [f.patient])), 0);
  assert.equal(Number(await scalar("select count(*) from cash_ledger where reference_id=$1", [f.sale])), 0);
  assert.equal(Number(await scalar("select sum(amount) from payments where patient_id=$1", [f.patient])), 100);
});

test("bank collections stay noncash and returned units are not restored twice", async () => {
  const f = await fixture({ bank: true, returned: 1 }); await cancel(f);
  assert.equal(Number(await scalar("select current_stock from medicine_batches where id=$1", [f.batch])), 9);
  assert.equal(await scalar("select payment_mode from cash_ledger where reference_id=$1", [f.sale]), "bank");
  assert.equal(Number(await scalar("select sum(debit-credit) from journal_lines where ledger_name='Bank'")), 0);
});

test("tenant isolation blocks cancellation of another clinic's bill", async () => {
  const f = await fixture(); const other = await fixture();
  await assert.rejects(cancel(f), /not found/);
  await login(f.user);
  assert.equal(await scalar("select status from sales where id=$1", [f.sale]), "completed");
  assert.ok(other.org !== f.org);
});

test("purchase cancellation reverses supplier balance and cash; insufficient stock rolls back audit", async () => {
  const f = await fixture({ role: "store_manager" });
  await db.exec("reset role");
  f.purchase = randomUUID(); const supplier = randomUUID();
  await db.query("insert into suppliers(id,organization_id,supplier_id,name) values($1,$2,'S','Supplier')", [supplier,f.org]);
  await db.query("insert into purchases(id,organization_id,purchase_no,supplier_id,supplier_invoice_no,invoice_date,subtotal,invoice_total,amount_paid) values($1,$2,'PUR',$3,'PI',(now() at time zone 'Asia/Kolkata')::date,100,100,40)", [f.purchase,f.org,supplier]);
  await db.query("insert into purchase_items(organization_id,purchase_id,product_id,batch_id,quantity,free_quantity,rate,line_total) values($1,$2,$3,$4,8,2,10,100)", [f.org,f.purchase,f.product,f.batch]);
  await db.query("insert into supplier_ledger(organization_id,supplier_id,occurred_on,particulars,reference_type,reference_id,debit,credit) values($1,$2,current_date,'Bill','purchase',$3,100,40)", [f.org,supplier,f.purchase]);
  await db.query("insert into cash_ledger(organization_id,entry_type,category,reference_type,reference_id,amount,payment_mode) values($1,'payment','Purchase','purchase',$2,40,'cash')", [f.org,f.purchase]);
  await login(f.user);
  await assert.rejects(cancel(f,"purchase"), /already been sold/);
  assert.equal(Number(await scalar("select count(*) from deleted_purchases_audit")), 0);
  assert.equal(await scalar("select status from purchases where id=$1", [f.purchase]), "completed");
  await db.query("update medicine_batches set current_stock=12 where id=$1", [f.batch]);
  await cancel(f,"purchase");
  assert.equal(Number(await scalar("select current_stock from medicine_batches where id=$1", [f.batch])), 2);
  assert.equal(Number(await scalar("select sum(debit-credit) from supplier_ledger where supplier_id=$1", [supplier])), 0);
  assert.equal(Number(await scalar("select sum(case when entry_type='receipt' then amount else -amount end) from cash_ledger where reference_id=$1", [f.purchase])), 0);
});
