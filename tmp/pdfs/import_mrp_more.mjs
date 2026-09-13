import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.SIVA_ADMIN_PASSWORD;
if (!url || !anon || !password) throw new Error("Missing env.");

const supabase = createClient(url, anon);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: "sivasankarnagarajan199763@gmail.com",
  password,
});
if (authError) throw authError;
const { data: profile, error: profileError } = await supabase.from("profiles").select("id,organization_id").eq("id", auth.user.id).single();
if (profileError) throw profileError;
const { data: supplier, error: supplierError } = await supabase.from("suppliers").select("id").eq("organization_id", profile.organization_id).eq("supplier_id", "AKM-7448811335").single();
if (supplierError) throw supplierError;
const { data: purchase, error: purchaseError } = await supabase.from("purchases").select("id").eq("organization_id", profile.organization_id).eq("purchase_no", "D01000882").single();
if (purchaseError) throw purchaseError;

const rows = [
  ["LEE","OFRON EYE DROPS","10ML","30049099","LHLE26036","01/28",3,0,10.20,32.00,5],
  ["LEE","EYELET EYE DROPS","10ML","30049099","LHLE26002","01/28",3,0,24.00,84.00,5],
  ["ANA","ANAND 10CM X 20CM D","1S","30059010","23","06/29",5,0,22.80,75.00,5],
  ["ALK","KETOKEM SOAP","75GM","30000000","KKS25318ED","07/28",5,0,47.40,143.00,5],
  ["ROM","S V SET NO 22","1S","90183990","G26C010194","02/31",20,0,6.10,25.00,5],
  ["OTI","NS 100 ML OTUSKA","100ML","30045020","2254382","10/28",100,0,15.30,21.02,5],
  ["OTI","RL 500 ML OTUSKA","500ML","30045020","1260756","02/29",28,0,27.60,60.34,5],
  ["OTI","DNS 500 ML OTUSKA","500ML","30045020","1254969","08/28",9,0,25.74,40.81,5],
  ["OTI","DNS 500 ML OTUSKA","500ML","30045020","1256166","11/28",1,0,27.00,40.81,5],
  ["OTI","25% DEXTROSE 100 ML INJ IP","100ML","30045020","1255907","10/27",3,0,16.36,21.00,5],
  ["OTI","METRIS 0.5% IP","100ML","30049022","1254686","09/28",10,0,14.70,22.05,5],
  ["OTI","NS 500 ML OTSUKA","500ML","30045020","1260449","12/28",7,0,27.00,37.24,5],
  ["OTI","NS 500 ML OTSUKA","500ML","30045020","1262335","05/29",3,0,27.00,37.24,5],
  ["ROM","I V SET RMS","1S","90183990","G26B020137","01/31",50,0,13.20,201.00,5],
  ["CS","COVER 14*22","100S","33049990","-","09/28",5,0,34.97,47.16,18],
  ["ALK","ALZYME 200 ML SYP (PINEAPPLE)","200ML","30049084","AZPS26003S","06/27",2,0,39.33,150.00,5],
  ["DISP","DISPOVAN SYRINGE [24] 5ML","1S","90183100","607053SML","12/30",100,0,2.84,10.23,5],
  ["DISP","DISPOVAN SYRINGE 10ML","1S","90183100","625106JE2","05/31",50,0,5.28,14.30,5],
  ["DISP","DISPOVAN SYRINGE [24] 3 ML","1S","90183100","605032NK2","12/30",100,0,2.46,9.72,5],
  ["DISP","DISPOVAN NEEDLE 20*1","1S","90183290","53512R","11/30",100,0,0.81,2.60,5],
  ["DISP","DISPOVAN NEEDLE 22*1","1S","90183100","53522R","11/30",100,0,0.81,2.60,5],
  ["DISP","DISPOVAN NEEDLE 24*1","1S","90183290","07653N","12/30",100,0,0.82,2.86,5],
  ["BD","BD 1ML (6MM)","10S","90183100","5191122","07/30",1,0,100.02,115.00,5],
  ["CS","MB EUCALYPTUS OIL 20ML","20ML","33012924","9975","01/29",12,0,19.50,39.37,5],
  ["CIP","CLEARWAX EAR DROPS","10ML","30049099","N25V9053","05/27",1,0,33.42,88.50,5],
  ["CIP","CLEARWAX EAR DROPS","10ML","30049099","N25V9072","10/27",2,0,33.42,82.96,5],
  ["LEE","ANAS DEE GEL","30GM","30049099","B26B11","01/29",3,0,18.00,33.00,5],
  ["CIP","OKAMET 500MG TAB 20S","20S","30049099","CPLAL25253","07/28",10,0,12.77,28.08,5],
  ["ROM","ALCOHOL SWAP (ROM)","1S","90189099","G26B020458","01/31",100,0,1.10,2.75,5],
  ["DR.R","GLIMOBLE MV1 TAB","10S","30043919","G26GAM001","02/28",10,0,29.11,151.84,5],
  ["DR.R","GLIMOBLE MV2 TAB","10S","30043919","G26GAN002","02/28",10,0,30.49,192.06,5],
  ["LEE","SITALIPTIN 50 MG TAB","15S","30049099","SLN501J","09/27",10,0,33.00,135.00,5],
  ["CIP","OKAMET GM 501 TAB","15S","30049099","AMQ05AOA","11/27",10,0,29.28,130.38,5],
  ["SUR","SALIN STAND (I.V STAND)","1S","15042090","1234","09/29",1,0,750.00,1400.00,5],
  ["CS","SRI MEENA ABSORBENT COTTON","1S","30049092","-","08/27",2,0,147.00,350.00,5],
  ["CS","COVER 10*16","100S","33049910","-","06/28",5,0,18.72,28.00,18],
  ["CS","ON CALL PLUS KIT","1S","38220011","3369517","11/27",1,0,675.00,1124.00,5],
  ["CS","ON CALL PLUS TEST STRIP","50S","38220019","1695505","11/27",1,0,455.00,1170.00,5],
  ["CS","ON CALL PLUS TEST STRIP","50S","38220019","1695789","02/28",1,0,455.00,1170.00,5],
  ["ROM","NEBULIZER MASK (CHILD)","1S","30000000","G26C040077","02/31",5,0,63.12,662.00,5],
  ["ROM","NEBULIZER MASK (ADULT)","1S","30000000","G26C040072","02/31",10,0,60.60,662.00,5],
];

function expiryDate(value) {
  const [mm, yy] = value.split("/").map(Number);
  return new Date(2000 + yy, mm, 0).toISOString().slice(0, 10);
}
function productId(name, hsn) {
  return `${name.replace(/[^A-Z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 34).toUpperCase()}-${hsn}`.slice(0, 48);
}

let products = 0;
let newBatches = 0;
for (const [mfr, name, pack, hsn, batch, exp, qty, free, rate, mrp, gst] of rows) {
  const productResult = await supabase.from("products").upsert({
    organization_id: profile.organization_id,
    product_id: productId(name, hsn),
    name,
    manufacturer: mfr,
    pack_size: pack,
    hsn_code: hsn,
    gst_percent: gst,
    purchase_rate: rate,
    selling_rate: mrp,
    mrp,
    active: true,
  }, { onConflict: "organization_id,product_id" }).select("id").single();
  if (productResult.error) throw productResult.error;
  products++;
  const exists = await supabase.from("medicine_batches").select("id").eq("organization_id", profile.organization_id).eq("product_id", productResult.data.id).eq("batch_number", batch).maybeSingle();
  if (exists.error) throw exists.error;
  if (exists.data) continue;
  const batchResult = await supabase.from("medicine_batches").insert({
    organization_id: profile.organization_id,
    product_id: productResult.data.id,
    batch_number: batch,
    expiry_date: expiryDate(exp),
    supplier_id: supplier.id,
    purchase_id: purchase.id,
    quantity_received: qty,
    free_quantity: free,
    current_stock: qty + free,
    purchase_rate: rate,
    mrp,
    selling_rate: mrp,
    gst_percent: gst,
  }).select("id").single();
  if (batchResult.error) throw batchResult.error;
  newBatches++;
  await supabase.from("purchase_items").insert({ organization_id: profile.organization_id, purchase_id: purchase.id, product_id: productResult.data.id, batch_id: batchResult.data.id, quantity: qty, free_quantity: free, rate, gst_percent: gst, line_total: Number((rate * qty).toFixed(2)) });
  await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: productResult.data.id, batch_id: batchResult.data.id, movement_type: "purchase", reference_type: "purchase", reference_id: purchase.id, reference_number: "D01000882", in_quantity: qty + free, balance_quantity: qty + free, created_by: profile.id });
}

console.log(JSON.stringify({ products, newBatches }, null, 2));
