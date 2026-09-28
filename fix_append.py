# -*- coding: utf-8 -*-
import codecs
with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

search = """    setUploadProgress("Appending new pages...");
    setExtractionError("");
    try {"""

replace = """    setUploadProgress("Appending new pages...");
    setExtractionError("");
    setStep("extracting");
    try {"""

code = code.replace(search, replace)

# Wait, there's another bug with handleSaveApiKeyAndRetry!
# If pendingBase64, it calls callExtractionApi but it also needs setStep("extracting") which it does have!
# Let me verify what happens if callExtractionApi FAILS on append:
# it sets step to "upload" which kicks the user out of the review screen!
# That's very bad! If I append and it fails, it shouldn't kick them back to "upload", they'll lose their mapping UI.
# In callExtractionApi:
#     if (!responseOk || !resData.success) {
#       ...
#       setStep("upload");
#       notify(errMsg);
#       return;
#     }
# And in the catch block:
#     } catch (error) {
#       ...
#       setStep("upload");
#       notify(message);
#     }
# We should change `setStep("upload")` to `setStep(isAppending ? "review" : "upload")` in callExtractionApi.

search_api = 'setStep("upload");'
replace_api = 'setStep(isAppending ? "review" : "upload");'

code = code.replace(search_api, replace_api)


with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Fixed handleAppendUpload UI step and callExtractionApi error recovery")
