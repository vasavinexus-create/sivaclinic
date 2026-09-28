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

req = urllib.request.Request(f"{url}/rest/v1/medicine_batches?select=*&limit=1")
req.add_header("apikey", key)
req.add_header("Authorization", f"Bearer {key}")

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        if data:
            print("Columns in medicine_batches:")
            print(list(data[0].keys()))
        else:
            print("No rows found. But we can still ask for schema!")
except Exception as e:
    print(e)
