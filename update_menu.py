# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/lib/modules.ts', 'r', 'utf-8') as f:
    modules_code = f.read()

# Remove Expiry Alerts from under Inpatient Ledger
modules_code = modules_code.replace(
    '    { label: "Inpatient Ledger", key: "inpatient-ledger" },\n    { label: "Expiry Alerts", key: "expiry-alerts" },',
    '    { label: "Inpatient Ledger", key: "inpatient-ledger" },'
)

# Insert Expiry Alerts under Low Stock
modules_code = modules_code.replace(
    '    { label: "Low Stock", key: "low-stock" },',
    '    { label: "Low Stock", key: "low-stock" },\n    { label: "Expiry Alerts", key: "expiry-alerts" },'
)

with codecs.open('app/v2/lib/modules.ts', 'w', 'utf-8') as f:
    f.write(modules_code)


with codecs.open('app/v2/components/V2Sidebar.tsx', 'r', 'utf-8') as f:
    sidebar_code = f.read()

sidebar_code = sidebar_code.replace(
    '          <p className="nav-title">CURRENT APP</p>\n          <a className="nav-item" href="/">Open existing app</a>\n',
    ''
)

with codecs.open('app/v2/components/V2Sidebar.tsx', 'w', 'utf-8') as f:
    f.write(sidebar_code)

print("Updated menu")
