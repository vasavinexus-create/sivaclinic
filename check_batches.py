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

# Query all batches where selling_rate != mrp / units_per_purchase_unit
req = urllib.request.Request(f"{url}/rest/v1/medicine_batches?select=id,batch_number,mrp,selling_rate,units_per_purchase_unit")
req.add_header("apikey", key)
req.add_header("Authorization", f"Bearer {key}")

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        incorrect = 0
        for b in data:
            units = b.get('units_per_purchase_unit') or 1
            expected = round(b.get('mrp', 0) / units, 2)
            actual = round(b.get('selling_rate', 0), 2)
            if expected != actual:
                incorrect += 1
                print(f"Batch {b['batch_number']}: MRP {b['mrp']}, Units {units}, Expected SR {expected}, Actual SR {actual}")
        print(f"Total incorrect: {incorrect}")
except Exception as e:
    print(e)
