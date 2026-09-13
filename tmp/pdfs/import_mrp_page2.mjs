import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = "sivasankarnagarajan199763@gmail.com";
const password = process.env.SIVA_ADMIN_PASSWORD || "123456";

if (!url || !anon || !password) throw new Error("Missing Supabase env or admin password env.");

const supabase = createClient(url, anon);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) throw authError;

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("id,organization_id,full_name")
  .eq("id", auth.user.id)
  .single();
if (profileError) throw profileError;

const supplier = {
  supplier_id: "AKM-7448811335",
  name: "AKM PHARMA AND SURGICALS",
  mobile: "7448811335",
  email: "akmpharmaandsurgicals@gmail.com",
  address: "No. A-45, 9th Cross Street Anna Nagar, Chengalpattu-603001",
  gst_number: "33BENPH2493J1Z9",
  drug_license_details: "TN/CPU/20B/01307, TN/CPU/21B/01307",
};

const rows = [
  ["CIP","VOMISTOP TAB","10S","30049039","G25VSA010","08/27",10,0,8.04,24.67,5],
  ["ALK","OROGARD MOUTH ULCER TABL","10S","30049099","RFLT25011","09/27",3,0,14.00,65.60,5],
  ["CS","IBUPROFEN 200MG TAB","10S","30049069","25344","10/27",5,0,4.23,6.50,5],
  ["CS","IBUPROFEN 400","10S","30049069","25255","07/27",5,0,6.36,10.00,5],
  ["LEE","MIGRAFEN TAB","10S","30049099","ECH601D","03/28",2,0,39.00,120.00,5],
  ["DR.R","ORO CV TAB 10S","10S","30041090","BHE83AJA","11/27",10,0,77.32,195.33,5],
  ["DR.R","SUPAMOVE MR TAB","10S","30049099","GG405002","09/27",6,0,15.02,63.28,5],
  ["CIP","PARACIP 500MG TAB 10S","10S","30049069","CH50301","08/28",20,0,6.81,10.30,5],
  ["CIP","PARACIP 650MG TAB 10S","10S","30049069","ICHT5609","09/28",4,0,10.37,21.41,5],
  ["CIP","PARACIP 650MG TAB 10S","10S","30049069","CH50363","11/28",16,0,10.37,21.41,5],
  ["DR.R","CEFIWOK CV TAB","10S","30049099","CVC260502","10/27",5,0,139.99,300.46,5],
  ["LEE","CEFREDROX CV TAB","10S","30042019","LPL2507","05/27",5,0,111.00,280.00,5],
  ["CIP","FLUKA 150MG TAB","1S","30049029","5N40567","07/28",30,0,7.13,13.73,5],
  ["CIP","BENDEX 400MG ATB","1S","30049024","AMQ06AGA","02/27",20,0,4.00,7.38,5],
  ["ALK","METRON 400MG TAB","15S","30049022","STA26072","02/29",3,0,15.96,24.41,5],
  ["CAD","DEMISONE 0.5 TAB","10S","30049039","UKBH25132","10/28",10,0,1.64,2.31,5],
  ["SUR","TORNIQUETS (SHASHICO)","1S","90189099","","09/28",6,0,12.35,45.00,5],
  ["HP","BUDEHEAL RESPULES","2ML","30049095","K1090370","10/27",10,0,9.40,127.10,5],
  ["HP","BUDEHEAL RESPULES","2ML","30049095","K1090384","12/27",5,0,9.40,127.10,5],
  ["HP","IPRAHEAL RESPULES","5ML","30049099","K1060320","11/27",10,0,9.22,127.10,5],
  ["HP","IPRAHEAL RESPULES","5ML","30049099","K1060368","12/27",5,0,9.22,127.10,5],
  ["DR.R","NICETAMOL SP TAB","10S","30049069","GH086014","04/28",10,0,22.71,153.39,5],
  ["ALK","FLOCHEK MF TAB","10S","30049099","FMT25004ES","06/27",2,0,69.12,285.00,5],
  ["LAB","DOXYLAB CAP","10S","30049099","DXLDC5006","11/27",6,0,21.42,70.00,5],
  ["ALK","ALMOX 500MG CAP","15S","30041030","26860018","12/27",4,0,39.60,117.85,5],
  ["CIP","CHESTONCOLD TAB","10S","30049031","CND26113","01/28",5,0,23.06,72.36,5],
  ["ALK","OMEE CHEW TAB (MINT)","12S","30049034","OMMT25028S","11/28",9,0,8.34,16.85,5],
  ["HP","URIHEAL 100 SR","10S","30041090","AKW01APA","10/27",5,0,29.90,86.63,5],
  ["CIP","OKACET L TAB","10S","30049031","KAT26002","02/28",10,0,5.45,78.22,5],
  ["LAB","CIP TZ TAB","10S","30041010","CIPDT5005","06/28",5,0,27.90,192.50,5],
  ["CS","NORBLUE 400MG TAB","10S","30049099","NEU25003","01/28",3,0,19.56,66.55,5],
  ["LUP","LUPICAL 500MG","15S","30049069","020E26PK","04/28",20,0,13.20,92.90,5],
  ["LEE","ESOMEFOL DSR CAP","10S","30049039","6156001","12/27",10,0,27.00,89.00,5],
  ["LUP","PANTOLUP DSR 10S CAPSULE","10S","30049039","PUE-26009","04/28",20,0,28.35,156.95,5],
  ["AQU","ALRELAX 0.5 TAB","10S","30049099","PAOTA006","09/27",3,0,6.56,27.00,5],
  ["LEE","LEE BIOTIC CAPS","10S","30049021","9913004","12/27",10,0,39.00,125.00,5],
  ["GIFT","WATER BOTTLE","1S","15042090","",null,0,1,0.10,1.00,5],
  ["CS","ARISTOVERT 20 TAB","15S","30049099","AMT2605110","05/28",10,0,21.45,200.10,5],
];

function expiryDate(value) {
  if (!value) return "2099-12-31";
  const [mm, yy] = value.split("/").map(Number);
  return new Date(2000 + yy, mm, 0).toISOString().slice(0, 10);
}

function productId(name, hsn) {
  return `${name.replace(/[^A-Z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 34).toUpperCase()}-${hsn}`.slice(0, 48);
}

const { data: supplierRow, error: supplierError } = await supabase
  .from("suppliers")
  .upsert({ organization_id: profile.organization_id, ...supplier }, { onConflict: "organization_id,supplier_id" })
  .select("id")
  .single();
if (supplierError) throw supplierError;

const purchaseNo = "D01000882";
const subtotal = rows.reduce((sum, r) => sum + r[8] * r[6], 0);
const tax = rows.reduce((sum, r) => sum + r[8] * r[6] * r[10] / 100, 0);

let { data: purchase, error: purchaseError } = await supabase
  .from("purchases")
  .select("id,subtotal,tax_total,invoice_total")
  .eq("organization_id", profile.organization_id)
  .eq("purchase_no", purchaseNo)
  .maybeSingle();
if (purchaseError) throw purchaseError;
if (!purchase) {
  const created = await supabase
    .from("purchases")
    .insert({
      organization_id: profile.organization_id,
      purchase_no: purchaseNo,
      supplier_id: supplierRow.id,
      supplier_invoice_no: purchaseNo,
      invoice_date: "2026-09-10",
      due_date: "2026-09-10",
      subtotal: Number(subtotal.toFixed(2)),
      tax_total: Number(tax.toFixed(2)),
      invoice_total: Number((subtotal + tax).toFixed(2)),
      amount_paid: 0,
      created_by: profile.id,
    })
    .select("id,subtotal,tax_total,invoice_total")
    .single();
  if (created.error) throw created.error;
  purchase = created.data;
}

let products = 0;
let batches = 0;
let skippedBatches = 0;
for (const [mfr, name, pack, hsn, rawBatch, exp, qty, free, rate, mrp, gst] of rows) {
  const batch = rawBatch || `${productId(name, hsn)}-NO-BATCH`;
  const pid = productId(name, hsn);
  const productResult = await supabase
    .from("products")
    .upsert({
      organization_id: profile.organization_id,
      product_id: pid,
      name,
      manufacturer: mfr,
      pack_size: pack,
      hsn_code: hsn,
      gst_percent: gst,
      purchase_rate: rate,
      selling_rate: mrp,
      mrp,
      minimum_stock: 0,
      reorder_level: 0,
      active: true,
    }, { onConflict: "organization_id,product_id" })
    .select("id")
    .single();
  if (productResult.error) throw productResult.error;
  products++;

  const existingBatch = await supabase
    .from("medicine_batches")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("product_id", productResult.data.id)
    .eq("batch_number", batch)
    .maybeSingle();
  if (existingBatch.error) throw existingBatch.error;
  if (existingBatch.data) {
    skippedBatches++;
    continue;
  }

  const batchResult = await supabase
    .from("medicine_batches")
    .insert({
      organization_id: profile.organization_id,
      product_id: productResult.data.id,
      batch_number: batch,
      expiry_date: expiryDate(exp),
      supplier_id: supplierRow.id,
      purchase_id: purchase.id,
      quantity_received: qty,
      free_quantity: free,
      current_stock: qty + free,
      purchase_rate: rate,
      mrp,
      selling_rate: mrp,
      gst_percent: gst,
    })
    .select("id")
    .single();
  if (batchResult.error) throw batchResult.error;
  batches++;

  if (qty > 0) {
    const itemResult = await supabase.from("purchase_items").insert({
      organization_id: profile.organization_id,
      purchase_id: purchase.id,
      product_id: productResult.data.id,
      batch_id: batchResult.data.id,
      quantity: qty,
      free_quantity: free,
      rate,
      gst_percent: gst,
      line_total: Number((rate * qty).toFixed(2)),
    });
    if (itemResult.error) throw itemResult.error;
  }

  const movementResult = await supabase.from("stock_movements").insert({
    organization_id: profile.organization_id,
    product_id: productResult.data.id,
    batch_id: batchResult.data.id,
    movement_type: "purchase",
    reference_type: "purchase",
    reference_id: purchase.id,
    reference_number: purchaseNo,
    in_quantity: qty + free,
    balance_quantity: qty + free,
    created_by: profile.id,
  });
  if (movementResult.error) throw movementResult.error;
}

console.log(JSON.stringify({ clinic: "SIVA CLINIC", supplier: supplier.name, purchaseNo, products, newBatches: batches, skippedBatches }, null, 2));
