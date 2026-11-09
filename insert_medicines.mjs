
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ORG_ID = "6a035887-507b-4125-b468-e58904c54738";

const TSV = `almox 500mg	15
amoxclav 625 mg	10
cefredrox-cv	10
CIP-Tz	10
Norblue	10
azax-500	3
azithral-500	5
azithral-250	10
cefiwork cv	10
doxylab 100 mg	10
metron 400 mg	15
urivron 400mg	14
paracip-650	10
paracip-500	10
brustan 400 mg	10
aceray p	10
Ibuprofen 200mg	10
viaflrx sp	10
Acceclowoc MR	10
chymopas fothe	15
zincotop	15
multivitamin 	10
lupical 500	15
cipcal D3	3
lee-biotic	10
lemoncee	15
gluta quick 	1
orogord	10
folic acid	15
demisone 0.5mg	10
broncofil-N	10
bilaford -M	10
amval	10
dericip	10
cetcip 10mg	10
levozett 5mg	10
dihista al	10
l-hist mont	10
alzad 400mg	1
vomistop	10
lo-par	10
spasmonil	10
freelex 5mg	10
pantosec-D	10
esomefol-dsr	10
sitaliptin-50	10
glimoble mv1	10
glimoble mv2	10
okamet- gm 	15
okamet 500mg	20
lipvas 20mg	10
lipvas 40mg	10
rozumaze 40	15
rozumaze 10	10
gabanyl-m	10
gabanyl-nt 100	10
gabanyl-300	10
pregabalin-nt	10
pregabanyl -75	10
amilp-5mg 	10
amilp-2.5mg	10
telmista 40mg	15
telmista20mg	15
dilvas 5	10
dilvas 2.5	10
Ecosprin -75	14
clopicard 75mg	15
rozumaze gold10	15
fluka-150	1
migrafen	10
aristovert 16mg	15
sinarzine	10
actigrain 10 mg	10
tryptoford 25mg	10
ursolid 300	10
urilosin 0.4	15
flochek MF	10
ultra king 	15
lircetam500	10
oseltaflu 75mg	10
suhgra 100 mg	4
frucax 40	10
app- up	10
alrelax 0.5	10`;

async function run() {
  const lines = TSV.split("\n").filter(l => l.trim() !== "");
  let index = Date.now() % 100000;
  
  const productsToInsert = lines.map(line => {
    const parts = line.split("\t");
    const name = parts[0].trim();
    const count = parseInt(parts[1] || "10");
    
    index++;
    const productId = `MED${index}`;
    
    return {
      organization_id: ORG_ID,
      product_id: productId,
      name: name,
      sale_unit: "tablet",
      purchase_unit: "strip",
      default_units_per_purchase_unit: count,
      active: true,
      minimum_stock: 10,
      gst_percent: 0,
      purchase_rate: 0,
      selling_rate: 0,
      mrp: 0
    };
  });
  
  const { data, error } = await supabase.from("products").insert(productsToInsert);
  if (error) {
    console.error("Insert failed:", error);
  } else {
    console.log(`Inserted ${productsToInsert.length} medicines successfully.`);
  }
}

run();
