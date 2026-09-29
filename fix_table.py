# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Fix the table class
old_table = """<table className="table">"""
new_table = """<div className="crud-table-wrap" style={{ overflowX: "auto" }}>\n            <table className="data-table">"""
code = code.replace(old_table, new_table)

# Close the div
old_table_close = """</table>"""
new_table_close = """</table>\n            </div>"""
code = code.replace(old_table_close, new_table_close)

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Fixed table on AdvPurchaseImportWorkflow")
