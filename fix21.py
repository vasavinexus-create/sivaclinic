import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_update = '''    if (pending) {
      await supabase.from("consultations").update({
        doctor_fee_collected: true,
        fee_receipt_id: sale.id
      }).eq("id", pending.id);
    }'''
new_update = '''    if (pending) {
      await supabase.rpc("collect_consultation_fee", {
        p_consultation_id: pending.id,
        p_sale_id: sale.id
      });
    }'''

code = code.replace(old_update, new_update)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")
