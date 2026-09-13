import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: "sivasankarnagarajan199763@gmail.com", password: process.env.SIVA_ADMIN_PASSWORD });
if (authError) throw authError;
const { data: profile } = await supabase.from("profiles").select("id,organization_id").eq("id", auth.user.id).single();
const { data: supplier } = await supabase.from("suppliers").select("id").eq("organization_id", profile.organization_id).eq("supplier_id", "AKM-7448811335").single();
const { data: purchase } = await supabase.from("purchases").select("id").eq("organization_id", profile.organization_id).eq("purchase_no", "D01000882").single();

const rows = [
  ["CIP","VOMISTOP TAB","10S","30049039","G25VSA010","08/27",10,0,8.04,24.67,5],
  ["ALK","OROGARD MOUTH ULCER TAB","10S","30049099","RFLI25011","09/27",3,0,14.00,65.60,5],
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
  ["SUR","TORNIQUETS (SHASHICO)","1S","90189099","-","09/28",6,0,12.35,45.00,5],
  ["HP","BUDHEAL RESPULES","2ML","30049095","K1090370","10/27",10,0,9.40,127.10,5],
  ["HP","BUDHEAL RESPULES","2ML","30049095","K1090384","12/27",5,0,9.40,127.10,5],
  ["HP","IPRAHEAL RESPULES","5ML","30049099","K10603620","11/27",10,0,9.22,127.10,5],
  ["HP","IPRAHEAL RESPULES","5ML","30049099","K1060368","12/27",5,0,9.22,127.10,5],
  ["DR.R","NICETAMOL SP TAB","10S","30049069","GH086014","04/28",10,0,22.71,153.39,5],
  ["ALK","FLOCHEK MF TAB","10S","30049099","FMT25004ES","06/27",2,0,69.12,285.00,5],
  ["LAB","DOXYLAB CAP","10S","30049099","DXLDC5006","11/27",6,0,21.42,70.00,5],
  ["ALK","ALMOX 500MG CAP","15S","30041030","26860018","12/27",4,0,39.60,117.85,5],
  ["CIP","CHESTONCOLD TAB","10S","30049031","CND26113","01/28",5,0,23.06,72.36,5],
  ["ALK","OMEE CHEW TAB (MINT)","12S","30049034","OMMT25028S","11/28",9,0,8.34,16.85,5],
  ["HP","URIHEAL 100 SR","10S","30041090","AKW01APA","10/27",5,0,29.90,86.63,5],
  ["CIP","OKACET L TAB","10S","30049031","KAT26002","02/28",10,0,5.45,78.22,5],
  ["LAB","CIP TZ TAB","10S","30041010","CIPDTS005","06/28",5,0,27.90,192.50,5],
  ["CS","NORBLUE 400MG TAB","10S","30049099","NEU25003","01/28",3,0,19.56,66.55,5],
  ["LUP","LUPICAL 500MG","15S","30049069","020E26PK","04/28",20,0,13.20,92.90,5],
  ["LEE","ESOMEFOL DSR CAP","10S","30049039","6156001","12/27",10,0,27.00,89.00,5],
  ["LUP","PANTOLUP DSR 10S CAPSULE","10S","30049039","PUE-26009","04/28",20,0,28.35,156.95,5],
  ["AQU","ALRELAX 0.5 TAB","10S","30049099","PAOTA006","09/27",3,0,6.56,27.00,5],
  ["LEE","LEE BIOTIC CAPS","10S","30049021","9913004","12/27",10,0,39.00,125.00,5],
  ["GIFT","WATER BOTTLE","1S","15042090","-","12/27",0,1,0.10,1.00,5],
  ["CS","ARISTOVERT 20 TAB","15S","30049099","AMT2605110","05/28",10,0,21.45,200.10,5],
  ["LEE","PREGABANYL 75 CAP","10S","30049099","5686007","04/28",3,0,24.00,89.00,5],
  ["CIP","SPASMONIL TAB","10S","30049061","GST60380","04/28",5,0,13.32,32.93,5],
  ["LEE","URSOLID 300MG","10S","30049036","5636001","12/27",3,0,129.00,350.00,5],
  ["LEE","PREGABANYL NT TAB","10S","30049029","PGL603A","12/27",3,0,30.00,145.00,5],
  ["CS","FRUCIX TAB 40MG","20S","30049079","FRU-2505","07/28",1,0,11.88,19.31,5],
  ["NOE","ZINCOTOP TAB","15S","30049099","WHT18076","02/28",6,0,38.40,101.25,5],
  ["CIP","LIPVAS 40MG TAB","10S","30049099","5BA1500","06/27",3,0,56.92,219.96,5],
  ["CIP","VITOMIN D3 DROPS","30MG","30045036","VDP26002","06/27",1,0,37.15,83.77,5],
  ["CIP","LIPVAS 20MG TAB","10S","30049099","5BA1945","06/27",3,0,39.84,134.18,5],
  ["SIPA","B-COMPEX MULTIVIT CAPS","10S","30045090","SBC35","01/28",20,0,4.56,15.00,5],
  ["LEE","GABANYL M TAB","10S","30049081","GBL501L","11/27",3,0,33.00,112.00,5],
  ["LEE","DIGITAL THERMOMETER LEEFO","1S","90251910","LE250601","05/35",1,0,114.00,250.00,5],
  ["CAD","THYRORITE 100 MCG","1S","30045032","HB25007","07/27",1,0,69.54,147.68,5],
  ["CIP","CIPCAL D3 SOFTGEL CAP","20S","30049099","AMQ05CNA","10/27",5,0,26.84,131.53,5],
  ["DR.R","ROZUMEZE GOLD 10 CAP","10S","30049099","AKS01BHA","09/27",3,0,77.49,264.14,5],
  ["WOC","ALZAD TAB","1S","30049021","WBI25008","09/28",20,0,3.32,8.66,5],
  ["DR.R","ROZUMAZE F 10 TAB","10S","30049099","RFZ251002","09/27",3,0,40.57,341.95,5],
  ["CIP","CLOPICARD TAB","15S","30049099","CPSIF529","10/27",2,0,32.82,106.77,5],
  ["HP","HEALTROXIN 50MCG","120S","30049099","6050401","04/28",1,0,45.50,132.30,5],
  ["HP","HEALTROXIN 75MCG","120S","30049099","26070911","06/28",1,0,54.60,186.48,5],
  ["LEE","TRYPTOPORD 25MG TAB","10S","30049069","21345003","09/27",3,0,12.60,26.00,5],
  ["KNO","TELKONOL-AM TAB","10S","30049079","TLAM26001","12/27",5,0,21.12,89.00,5],
  ["CIP","DILVAS-5MG TAB","10S","30049071","AMQ22AZA","10/27",5,0,7.98,39.47,5],
  ["CIP","DILVAS-2 MG TAB","10S","30049071","AMQ01AYB","12/27",4,0,7.14,23.40,5],
  ["CIP","AMLIP 2.5MG TAB","10S","30049074","5C11532","11/28",5,0,5.74,19.10,5],
  ["CIP","AMLIP 5MG TAB","10S","30049074","CU26B28","01/29",5,0,8.26,26.66,5],
  ["CS","ECOPRIN 75 TAB","14S","30049062","04012027","03/28",2,0,4.77,5.29,5],
  ["LEE","FREELEX TAB","10S","30049029","4416001","03/28",5,0,5.04,12.00,5],
  ["DR.R","TELMISTA 40MG TAB","15S","30049079","E2601305","04/29",5,0,24.07,108.95,5],
  ["LEE","URILOSIN CAPS","15S","30049099","8585003","08/27",3,0,30.00,120.00,5],
  ["DR.R","ROZUMAZE 40MG TAB","15S","30049099","EV250077","10/27",3,0,84.17,707.34,5],
  ["DR.R","TELMISTA 20MG TAB","15S","30049099","E2502229","08/28",5,0,15.50,61.99,5],
  ["DR.R","CEFIWOK 100 DRY SYP 30ML","30ML","30042019","48046003","07/27",14,0,38.68,75.28,5],
  ["LEE","FREELEX PLUS SYP","170ML","30049039","CHLH26038","06/28",2,0,60.00,150.00,5],
  ["HP","GUTRATE D/S","30ML","30049069","NFL-29528","07/27",7,0,32.50,79.20,5],
  ["LEE","T-MUCE OINT 5 GM","5GM","30042099","DLPM6004","05/28",19,1,30.00,105.00,5],
  ["CS","LEMONCEE TABS","15S","21069099","ULC2605","05/28",20,0,22.68,75.00,5],
  ["LUCI","KOJICID GEL 15GM","15GM","33049990","BCC6216","03/28",1,0,49.21,150.00,18],
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
