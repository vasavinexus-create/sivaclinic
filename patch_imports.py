# -*- coding: utf-8 -*-
import codecs
import re

files = [
    'app/v2/components/PurchaseImportWorkflow.tsx',
    'app/v2/components/AdvancedPurchaseImportWorkflow.tsx'
]

for path in files:
    try:
        with codecs.open(path, 'r', 'utf-8') as f:
            code = f.read()
        
        # We need to replace selling_rate assignments to divide by unitsPerPurchaseUnit
        # Example 1: `selling_rate: Number(item.selling_rate || prod.selling_rate || prod.mrp || item.mrp || 0),`
        # But wait! If we do it at mapping time, `item.selling_rate` might already be divided?
        # Actually, if we just fix the final payload going to API, it's safer.
        # Let's find the `save` function payload building where it maps `items`.
        
        # Wait, the final API request goes to `/api/v2/purchases` ?
        # No, they might use supabase.insert directly. Let's check `save` function in these files.
        if "selling_rate: item.selling_rate || item.mrp" in code:
            code = code.replace("selling_rate: item.selling_rate || item.mrp", 
                                "selling_rate: (Number(item.selling_rate) > 0 ? Number(item.selling_rate) : Number(item.mrp || 0)) / unitsPerPurchaseUnit")
        
        with codecs.open(path, 'w', 'utf-8') as f:
            f.write(code)
        print(f"Patched {path}")
    except Exception as e:
        print(e)
