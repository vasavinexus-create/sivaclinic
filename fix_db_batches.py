# -*- coding: utf-8 -*-
import json
import urllib.request
import os

url = ""
key = ""

with open('.env.local', 'r') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
            url = line.strip().split('=', 1)[1]
        elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            key = line.strip().split('=', 1)[1]

req = urllib.request.Request(f"{url}/rest/v1/medicine_batches?select=id,batch_number,mrp,selling_rate,units_per_purchase_unit")
req.add_header("apikey", key)
req.add_header("Authorization", f"Bearer {key}")

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        updated = 0
        for b in data:
            units = b.get('units_per_purchase_unit') or 1
            expected = round(b.get('mrp', 0) / units, 2)
            actual = round(b.get('selling_rate', 0), 2)
            
            # If actual selling rate is wrong (either 0 or equal to full MRP when it should be per unit)
            if expected != actual and expected > 0:
                print(f"Fixing Batch {b['batch_number']}: Actual {actual} -> Expected {expected}")
                
                # Update it
                update_req = urllib.request.Request(f"{url}/rest/v1/medicine_batches?id=eq.{b['id']}", method='PATCH')
                update_req.add_header("apikey", key)
                update_req.add_header("Authorization", f"Bearer {key}")
                update_req.add_header("Content-Type", "application/json")
                update_req.add_header("Prefer", "return=minimal")
                
                payload = json.dumps({"selling_rate": expected}).encode('utf-8')
                with urllib.request.urlopen(update_req, data=payload) as patch_resp:
                    updated += 1

        print(f"Successfully fixed {updated} batches in the database!")
except Exception as e:
    print(e)
