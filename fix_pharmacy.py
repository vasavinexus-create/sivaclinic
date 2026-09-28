# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Fix BillingWorkflow which has an EXTRA } before </div></div></div>;
# The error was: `Unexpected token. Did you mean {'}'} or &rbrace;?`
# Let's check exactly what BillingWorkflow ends with.
# Actually I'll just print out the last 200 chars of BillingWorkflow to see it!
