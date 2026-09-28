# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

# REVERT the bad replace!
code = code.replace('setStep(isAppending ? "review" : "upload");', 'setStep("upload");')

# Now apply carefully:

# 1. Fix handleAppendUpload step
search_1 = """    setUploadProgress("Appending new pages...");
    setExtractionError("");
    try {"""

replace_1 = """    setUploadProgress("Appending new pages...");
    setExtractionError("");
    setStep("extracting");
    try {"""
if search_1 in code:
    code = code.replace(search_1, replace_1)

# 2. Fix callExtractionApi specifically
code = re.sub(r'(if \(!responseOk \|\| !resData\.success\) \{.*?)(setStep\("upload"\);)', r'\1setStep(isAppending ? "review" : "upload");', code, flags=re.DOTALL)
code = re.sub(r'(\} catch \(error\) \{.*?const message = error instanceof Error \? error\.message : "Failed to process the invoice\. Please retry\.";.*?setExtractionError\(message\);.*?)(setStep\("upload"\);)', r'\1setStep(isAppending ? "review" : "upload");', code, flags=re.DOTALL)


with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Safely fixed append state")
