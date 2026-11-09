
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ORG_ID = "6a035887-507b-4125-b468-e58904c54738";

async function run() {
  const { data: products, error: fetchError } = await supabase
    .from("products")
    .select("id, name")
    .eq("organization_id", ORG_ID);
    
  if (fetchError) {
    console.error("Fetch failed:", fetchError);
    return;
  }
  
  let updatedCount = 0;
  
  for (const p of products) {
    const upperName = p.name.toUpperCase();
    if (p.name !== upperName) {
      await supabase.from("products").update({ name: upperName }).eq("id", p.id);
      updatedCount++;
    }
  }
  
  console.log(`Successfully updated ${updatedCount} medicines to uppercase.`);
}

run();
