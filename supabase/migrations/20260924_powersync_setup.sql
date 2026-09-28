-- PowerSync requires a publication for logical replication
-- This script prepares the Supabase database for PowerSync without affecting the existing app.

-- Create a publication for PowerSync if it doesn't exist
DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE 
  patients, 
  products, 
  sales,
  sale_items,
  purchases,
  purchase_items,
  expenses;
-- Add any other tables you want to sync to the list above

-- PowerSync needs a way to know what data a user is allowed to sync.
-- We create a sync rules table and function to filter data per user (e.g. by organization_id)
-- PowerSync's typical setup involves bucket definitions.

-- Example Sync Rules (to be used in powersync.yaml in the PowerSync dashboard)
/*
bucket_definitions:
  user_data:
    data:
      - SELECT * FROM patients WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = request.user_id)
      - SELECT * FROM products WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = request.user_id)
      - SELECT * FROM sales WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = request.user_id)
*/

-- Make sure logical replication is enabled (Wal level = logical)
-- Note: In Supabase, this is enabled by default for the `supabase_admin` and usually requires you to just create the publication.
