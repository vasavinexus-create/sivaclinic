# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/V2Sidebar.tsx', 'r', 'utf-8') as f:
    sidebar_code = f.read()

sidebar_code = re.sub(r'<p className="nav-title">CURRENT APP</p>\s*<a className="nav-item" href="/">Open existing app</a>', '', sidebar_code)

with codecs.open('app/v2/components/V2Sidebar.tsx', 'w', 'utf-8') as f:
    f.write(sidebar_code)

with codecs.open('app/v2/lib/modules.ts', 'r', 'utf-8') as f:
    modules_code = f.read()

# Let's inspect where expiry-alerts is
lines = modules_code.split('\n')
new_lines = []
for line in lines:
    if '{ label: "Expiry Alerts", key: "expiry-alerts" }' in line:
        pass # omit it everywhere first
    else:
        new_lines.append(line)
        if '{ label: "Low Stock", key: "low-stock" }' in line:
            new_lines.append('    { label: "Expiry Alerts", key: "expiry-alerts" },')

with codecs.open('app/v2/lib/modules.ts', 'w', 'utf-8') as f:
    f.write('\n'.join(new_lines))

print("Fixed menu")
