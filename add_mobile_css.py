# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/globals.css', 'r', 'utf-8') as f:
    code = f.read()

# Add global mobile table cards
css = """
@media(max-width:800px) {
  .app-shell .data-table thead, .crud-table-wrap thead { display: none !important; }
  .app-shell .data-table tbody, .crud-table-wrap tbody { display: grid; gap: 16px; background: transparent !important; }
  .app-shell .data-table tr, .crud-table-wrap tr { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--line) !important; border-radius: 12px; padding: 16px !important; background: #fff !important; box-shadow: 0 2px 10px rgba(0,0,0,0.03); }
  .app-shell .data-table td, .crud-table-wrap td { display: flex !important; justify-content: space-between; align-items: center; border: none !important; padding: 0 !important; font-size: 16px !important; text-align: right; }
  .app-shell .data-table td::before, .crud-table-wrap td::before { content: attr(data-label); font-weight: 700; color: var(--muted); font-size: 12px; float: left; text-align: left; padding-right: 12px; }
  .app-shell .data-table td:empty, .crud-table-wrap td:empty { display: none !important; }
  .app-shell .data-table td.no-print, .crud-table-wrap td.no-print { justify-content: flex-end; gap: 12px; margin-top: 6px; padding-top: 10px !important; border-top: 1px solid #f0f4f2 !important; }
  .app-shell .data-table td .table-edit { margin: 0 !important; width: 100%; justify-content: center; }
}
"""

code += css

with codecs.open('app/globals.css', 'w', 'utf-8') as f:
    f.write(code)

print("Added mobile card CSS")
