import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: "sivasankarnagarajan199763@gmail.com", password: process.env.SIVA_ADMIN_PASSWORD });
if (authError) throw authError;
const { data: profile } = await supabase.from("profiles").select("id,organization_id").eq("id", auth.user.id).single();
const { data: supplier } = await supabase.from("suppliers").select("id").eq("organization_id", profile.organization_id).eq("supplier_id", "AKM-7448811335").single();
const { data: purchase } = await supabase.from("purchases").select("id").eq("organization_id", profile.organization_id).eq("purchase_no", "D01000882").single();

const rows = [
  ["LUCI","KOJICID FACEWASH 70ML","70ML","33049990","4185","01/28",1,0,90.72,252.00,18],
  ["LUCI","KOJICID HC SERUM 30ML","30ML","33049990","4284","03/28",1,0,167.83,996.00,18],
  ["MIC","GASTRIUM SUS 200ML","200ML","30049099","GASE014","03/28",2,0,125.24,210.90,5],
  ["MIC","MICRO NS DROPS","10ML","30049099","MS2538","01/28",10,0,19.05,52.80,5],
  ["CIP","NASELIN 10ML NASAL SPRAY","10ML","30049099","NSL25012","10/28",3,0,56.53,95.25,5],
  ["LUP","ORS POWDER 21G LUPIN","21G","30049086","OG26015","03/29",10,0,6.93,20.50,5],
  ["LEE","CLINSOL OINT","15GM","30042095","DLPA5052","11/27",10,0,30.00,92.00,5],
  ["CIP","FOURDERM 20GM OINT","20GM","30049029","51181","08/27",4,0,48.48,172.99,5],
  ["CIP","FOURDERM 20GM OINT","20GM","30049029","51231","10/27",5,0,48.48,190.27,5],
  ["ALK","OMEE MPS 170ML COOL (MINT)","170ML","30049039","OME26141RH","05/28",2,0,26.17,113.40,5],
  ["MOR","GLUTAQUICK GLO TAB","10S","21069099","MOTF-26F01","05/28",2,0,111.80,750.00,5],
  ["CAD","GENVOL PLUS CAPSULES 10S","10S","30049099","DSHY25032","11/28",10,0,14.50,93.52,5],
  ["MOR","OSELTAPEN 75MG TAB","10S","30049099","DC510028","09/27",4,0,165.00,769.50,5],
  ["LEE","LEE BIOTIC SACHET","1GM","30049039","123SLM014","10/27",20,0,9.00,25.00,5],
  ["LAB","ULTRAKING TAB","15S","30049069","QUKTL006","12/27",2,0,31.20,226.80,5],
  ["UNI","ACTIGRAIN 10","10S","30049099","17653001","12/27",2,0,10.99,51.45,5],
  ["LEE","LIRCETAM 500 MG","10S","30049082","LCM601A","12/27",2,0,57.84,135.00,5],
  ["LEE","LEE BIOTIC SACHET","1GM","30049039","123SLD034","04/28",15,0,9.00,25.00,5],
  ["BHA","MAGNESIUM SULPHATE","20GM","30049069","2201","01/30",4,0,2.04,34.00,5],
  ["INT","APP UP TAB","10S","30049099","IN25J047","11/27",1,0,4.50,17.34,5],
  ["LUCI","VOMBIT MD TAB","10S","30049035","T5083","12/27",2,0,6.19,54.90,5],
  ["LEE","SINARZINE TAB","10S","30049099","9855003","08/27",1,0,7.20,26.00,5],
  ["LUP","LUPILIV DS SYP 200ML","200ML","30049011","ALI26005","12/28",3,0,40.30,205.00,5],
  ["LUP","CANAZOLE VG GEL 30GM","1S","30049099","N0460074","04/28",2,0,31.20,83.50,5],
  ["WOC","MERIMOL I.V.","100ML","30049061","WTE26004","02/28",4,0,34.45,328.98,5],
  ["LEE","ETAZYME SYP","200ML","30049084","BZLH26005","08/27",2,0,54.00,150.00,5],
  ["LEE","VOVEDIC PLUS GEL 15GM","15GM","30049069","DLQO5016","11/27",19,1,18.00,50.00,5],
  ["ROM","LATEX GLOVES SOFT MEDIUM","100S","30000000","46350","11/30",1,0,324.00,1500.00,5],
  ["MED","MEDIWRAP 10CM","1S","30059040","SC018","02/31",1,0,104.40,384.00,5],
  ["MED","MEDIWRAP 15 CM","1S","30059040","ST1510","10/30",1,0,130.20,506.00,5],
  ["LEE","PURADINE GARGLES","1S","30049099","DSU6009","01/28",2,0,54.00,125.00,5],
  ["IBL","GLYCERINE I.P.","100ML","33049910","053","06/28",2,0,43.20,100.00,18],
  ["ZYD","FOLIC ACID TABLET (ZYFOLY)","10S","30045010","GCH1890","10/27",30,0,3.45,16.11,5],
  ["CIP","SUHAGRA 100MG TAB","4S","30049099","5NA0553","07/28",3,0,21.68,217.80,5],
  ["CS","TETANUS TOXACID (AMP)","0.5ML","30019099","2532C","06/28",50,0,10.55,13.32,5],
  ["AMR","BISACAN 10 SUPPOSITORIES","5S","30049099","108","08/28",2,0,59.15,154.88,5],
  ["AMR","PARACAN-170 SUPPOSITORIES","5S","30049099","036","04/28",2,0,34.78,42.47,5],
  ["AMR","PARACAN-125 SUPPOSITORIES","5S","30045090","088","07/28",2,0,32.50,45.00,5],
  ["LEE","SCRABIC LOTION","50ML","30012010","DLSV5024","10/27",2,0,28.80,51.00,5],
  ["LEE","MOXIFORD","5ML","30042039","LHLE26063","03/28",3,0,23.40,75.00,5],
  ["LEE","URIVRON TAB","10S","30042099","AUV10AAA","10/27",4,0,36.00,105.00,5],
  ["LEE","HB FORD SYP","200ML","30045010","CQLH25031","03/27",3,0,48.00,138.00,5],
  ["NOE","ZINCOTOP 200ML","1S","30045039","WHL-033107","05/28",3,0,44.20,135.00,5],
  ["CIP","CLOCIP B 10GM ONT","10GM","30049029","N0250979","11/28",3,0,29.39,65.48,5],
  ["ALK","KETOKEM 110ML SHAMPOO","110ML","30049029","N25212","10/27",2,0,82.80,242.30,5],
  ["ALK","KETOKEM 15GM CREAM","15GM","30049029","K25004CB","08/27",2,0,18.60,105.00,5],
  ["CIP","OKACET SYP 30ML","30ML","30049031","GSL50436","11/27",1,0,13.62,21.10,5],
  ["CIP","OKACET SYP 30ML","30ML","30049031","GSL50436","11/27",4,0,13.62,21.10,5],
  ["LEE","COLDMINE DROPS","15ML","30049031","GSLH26001","12/27",10,0,26.40,70.00,5],
  ["LEE","VOMIFORD DROPS","30ML","30049035","ETLH26002","01/28",1,0,18.96,39.00,5],
  ["LEE","VOMIFORD DROPS","30ML","30049035","ETLH26004","01/28",9,0,18.96,39.00,5],
  ["ETHI","3328 ETHILON 3.0 NW JJHS","1S","90183210","V6004","12/30",5,0,197.26,289.00,5],
  ["ETHI","3336 ETHILON 2.0 MW JJHS","1S","90189099","V5065","07/30",5,0,185.71,310.00,5],
  ["ETHI","3319 ETHILON 4.0 NW JJHS","1S","90189099","V5012","03/30",1,0,251.51,405.00,5],
  ["GLP","ASCODEX-D SYRUP 100ML","100ML","30049039","P2ECZ001","12/27",5,0,47.94,158.43,5],
  ["LEE","ALKAZIP SYP","100ML","30049039","AELH26007","02/28",3,0,30.00,85.00,5],
  ["AMR","PARACAN INFUSION","100ML","30049061","AC2595007","06/27",4,0,33.80,599.00,5],
  ["CIP","PARACIP DROPS","15ML","30049061","ICH6152","05/28",10,0,22.24,37.50,5],
  ["CIP","PARACIP 250 SYRUP 60ML","60ML","30049069","ICHL5156","09/27",10,0,17.66,42.83,5],
  ["CIP","NOCOLD SYRUP NF 60ML","60ML","30049069","GSL50375","09/27",10,0,17.17,77.70,5],
  ["ALK","NEW OROGARD MOUTH WASH 100ML","100ML","30049099","NOB25023ED","11/27",3,0,42.12,126.55,5],
  ["ALK","NEW OROGARD MOUTH WASH 100ML","100ML","30049099","NOB26015ED","04/28",2,0,42.12,126.55,5],
  ["ALK","NEW OROGARD MOUTH WASH","100ML","30049099","NOR25005ED","07/27",2,0,39.00,135.00,5],
  ["ALK","NEW OROGARD MOUTH WASH","100ML","30049099","NOR25006ED","08/27",3,0,43.20,126.55,5],
  ["LAB","SILVEZ PLUS","15GM","30049099","QZL002","01/28",3,0,21.00,95.00,5],
  ["ALK","L HIST MONT 30ML SYP","30ML","30049099","P2CUY037","10/27",5,0,27.72,75.00,5],
  ["ALK","L HIST MONT 30ML SYP","30ML","30049099","P2CUZ002","12/27",5,0,27.72,75.00,5],
  ["LEE","AMROX LS JUNIOR SYP","60ML","30049099","ALLH25033","11/27",4,0,26.40,70.00,5],
  ["LEE","AMROX LS SYRUP","60ML","30049099","AJLH26001","12/27",3,0,26.40,70.00,5],
  ["LEE","AMROX LS SYRUP","60ML","30049099","AJLH26015","01/28",2,0,26.40,70.00,5],
  ["GLP","ASCODEX LS SYRUP 100ML","100ML","30049099","P2EEY022","11/27",10,0,51.22,144.85,5],
  ["CIP","CIPLADINE OINT 10GM","10GM","30049099","N0260285","03/28",12,0,26.47,36.22,5],
  ["PRS","WHITEFIELD OINTMENT 20GM","20GM","30049099","SBA617","12/28",5,0,10.29,37.00,5],
  ["PRS","LIQ.PARAFFIN (PRS)","100ML","30049099","RL-182","05/29",1,0,41.40,160.00,5],
  ["PRS","CALAMINE LOTION 100ML (PRS)","100ML","30049099","CME369","03/29",2,0,21.74,65.00,5],
];

function expiryDate(value){const [mm,yy]=value.split("/").map(Number);return new Date(2000+yy,mm,0).toISOString().slice(0,10)}
function productId(name,hsn){return `${name.replace(/[^A-Z0-9]+/gi,"-").replace(/^-|-$/g,"").slice(0,34).toUpperCase()}-${hsn}`.slice(0,48)}
let products=0,newBatches=0;
for(const [mfr,name,pack,hsn,batch,exp,qty,free,rate,mrp,gst] of rows){
  const productResult=await supabase.from("products").upsert({organization_id:profile.organization_id,product_id:productId(name,hsn),name,manufacturer:mfr,pack_size:pack,hsn_code:hsn,gst_percent:gst,purchase_rate:rate,selling_rate:mrp,mrp,active:true},{onConflict:"organization_id,product_id"}).select("id").single();
  if(productResult.error)throw productResult.error; products++;
  const exists=await supabase.from("medicine_batches").select("id").eq("organization_id",profile.organization_id).eq("product_id",productResult.data.id).eq("batch_number",batch).maybeSingle();
  if(exists.error)throw exists.error; if(exists.data)continue;
  const batchResult=await supabase.from("medicine_batches").insert({organization_id:profile.organization_id,product_id:productResult.data.id,batch_number:batch,expiry_date:expiryDate(exp),supplier_id:supplier.id,purchase_id:purchase.id,quantity_received:qty,free_quantity:free,current_stock:qty+free,purchase_rate:rate,mrp,selling_rate:mrp,gst_percent:gst}).select("id").single();
  if(batchResult.error)throw batchResult.error; newBatches++;
  await supabase.from("purchase_items").insert({organization_id:profile.organization_id,purchase_id:purchase.id,product_id:productResult.data.id,batch_id:batchResult.data.id,quantity:qty,free_quantity:free,rate,gst_percent:gst,line_total:Number((rate*qty).toFixed(2))});
  await supabase.from("stock_movements").insert({organization_id:profile.organization_id,product_id:productResult.data.id,batch_id:batchResult.data.id,movement_type:"purchase",reference_type:"purchase",reference_id:purchase.id,reference_number:"D01000882",in_quantity:qty+free,balance_quantity:qty+free,created_by:profile.id});
}
console.log(JSON.stringify({products,newBatches},null,2));
