import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = "sivasankarnagarajan199763@gmail.com";
const password = process.env.SIVA_ADMIN_PASSWORD;

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
  ["LUP","PANTOLUP 40MG INJ","40MG","30049039","A26DP092","04/28",25,0,13.00,54.15,5],
  ["AMR","PARACAN-150 INJ","2ML","30049099","25AR030","08/27",80,0,4.88,8.48,5],
  ["LUP","DEFENAC INJ 3ML","3ML","30049029","U045052","11/27",100,0,3.51,5.30,5],
  ["TOR","TORCORT H 100 INJ","1S","30042019","TBDE01","04/27",20,0,20.16,47.00,5],
  ["ZYD","CADICEFT 1G","1GM","30049099","GSM0187","12/27",25,0,24.05,66.62,5],
  ["DR.R","ONZEN INJ","2ML","30049035","NL31626003","03/28",30,0,4.73,12.80,5],
  ["LAB","GENTALAB INJ 2ML","2ML","30043913","QUELI007","02/28",20,0,7.50,10.30,5],
  ["TIM","TIMTAK INJ","2ML","30049099","RH505","03/27",10,0,2.52,6.02,5],
  ["ZYD","ZYDEXA PLUS INJ","2ML","30043911","GSK0115","12/27",16,0,8.00,10.86,5],
  ["ZYD","ZYDEXA PLUS INJ","2ML","30043911","GSK0126","05/28",8,0,8.00,10.93,5],
  ["ZYD","IRON INJ (CADFOL-S)","5ML","30045010","GFPI228","11/27",5,0,33.28,306.59,5],
  ["AMR","SPASMOCAN INJ","1ML","30049099","25AR035","08/27",20,0,8.45,12.00,5],
  ["LAB","TRAMADEX 2ML INJ","2ML","30049069","PTDIL020","11/27",10,0,5.70,25.00,5],
  ["AMR","THIACAN-200 INJ 2ML","1S","30045032","25AR072","11/27",10,0,15.60,57.00,5],
  ["LEE","BILAFORD M TAB","10S","30049039","21456001","01/28",5,0,39.00,140.00,5],
  ["ANA","ANAND 7.5CM X 7.5CM GAUZE","1S","30059010","10","12/28",2,0,213.60,450.00,5],
  ["CS","IODINE TINCTURE I.P 66","20ML","30049099","IT33","12/27",12,0,16.50,60.00,5],
  ["ANA","ANAND 10CM X 7.5CM D","1S","30059010","15","09/28",10,0,11.98,33.00,5],
  ["CIP","CIPLADINE 250 MG JAR","25GM","30049099","N0260301","04/28",1,0,244.63,542.76,5],
  ["ANA","ANAND 15CM X 3M OPEN WEAV","1S","30059010","021","05/29",1,0,172.80,375.00,5],
  ["ANA","ANAND 10CM X 3M OPEN WEAV","1S","30049069","030","06/29",1,0,115.20,250.00,5],
  ["CS","AMVIL TAB","10S","30049099","T-5258","07/27",10,0,1.93,3.43,5],
  ["SMIT","BACTIGRAS","1S","30059090","AGD0384","03/28",1,0,195.60,350.00,5],
  ["MED","ADHESIVE TAPE 1INCH","1S","30059060","5127480S","11/28",3,0,14.88,85.92,5],
  ["3M","TRANSPORE PLAST 1 INCH","1S","30051020","R06261103","05/31",2,0,62.40,219.25,5],
  ["MED","ADHE TAPE USP 07.CM X 05MT","1S","30051020","C5099182","08/28",2,0,69.60,200.00,5],
  ["LEE","BRONOCOFIL-N TAB","10S","30049099","ALA17AWA","11/27",9,0,78.00,205.00,5],
  ["CIP","CIPLADINE 500ML SOLUTION","500ML","30049099","N0260159","02/28",2,0,161.78,229.67,5],
  ["PRS","H2O2 450ML PRS","450ML","30049099","H798","04/28",2,0,27.60,85.00,18],
  ["CS","STERILLIUM 500 ML","500ML","38089400","ST3-25153","11/28",1,0,258.00,958.00,18],
  ["ALK","ENTISEP 1 LTR","1LTR","30049099","ETL26003NP","01/29",1,0,110.50,319.65,5],
  ["NEO","LOX 2% INJ","30ML","30039034","SM144744","01/28",2,0,31.20,33.30,5],
  ["LAB","DEXAMETHASONE 30ML INJ","30ML","30043913","QDIL003","12/27",2,0,27.00,28.96,5],
  ["CS","REPRAMOL INJ","30ML","30049069","IPCF611","05/28",2,0,17.22,56.60,5],
  ["LAB","CYANOCOBALAMINE 30ML INJE","30ML","30045034","PLVIL017","11/27",2,0,25.20,70.00,5],
  ["LAB","GENTAMYCIN 30ML INJECTION","30ML","30049099","PGNIL072","10/27",2,0,33.00,34.69,5],
  ["LAB","CPM INJ 30ML","30ML","30049093","PLDIL014","11/27",2,0,11.40,74.50,5],
  ["CIP","ROKO CAP","10S","30049099","G5875014","04/28",3,0,12.54,25.92,5],
];

function expiryDate(value) {
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
const invoiceTotal = Number((subtotal + tax).toFixed(2));
let { data: purchase } = await supabase
  .from("purchases")
  .select("id")
  .eq("organization_id", profile.organization_id)
  .eq("purchase_no", purchaseNo)
  .maybeSingle();
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
      invoice_total: invoiceTotal,
      amount_paid: 0,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  purchase = created.data;
}

let products = 0;
let batches = 0;
for (const [mfr, name, pack, hsn, batch, exp, qty, free, rate, mrp, gst] of rows) {
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
  if (existingBatch.data) continue;

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

  await supabase.from("purchase_items").insert({
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
  await supabase.from("stock_movements").insert({
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
}

console.log(JSON.stringify({ clinic: "SIVA CLINIC", supplier: supplier.name, purchaseNo, products, newBatches: batches }, null, 2));
