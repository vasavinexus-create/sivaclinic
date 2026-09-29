# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

old_td = """<td>{valueAt(r, "current_stock")}</td>"""
new_td = """<td>{(() => {
  const v = valueAt(r, "current_stock") || 0;
  const c = r.product?.default_units_per_purchase_unit || 1;
  const p = Math.floor(v / c);
  const m = v % c;
  const u = r.product?.purchase_unit || "Pack";
  return m > 0 ? `${p} ${u} + ${m}` : `${p} ${u}`;
})()}</td>"""

# I need to be careful not to replace it everywhere if there are multiple occurrences.
# Let's replace ONLY inside the modal's map function.
# Wait, `<td>{valueAt(r, "current_stock")}</td>` ONLY appears once in the file, inside that modal!
code = code.replace(old_td, new_td)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Updated modal current stock display")
