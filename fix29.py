import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_resets = """    setSaving(false);
    setCart([]);
    setSpecialDiscountPercent(0);
    setPatientId("");
    setPending([]);
    notify(`${invoice} saved`);"""

new_resets = """    setSaving(false);
    setCart([]);
    setSpecialDiscountPercent(0);
    setPatientId("");
    setPending([]);
    setProductId("");
    setProduct(null);
    setQty(1);
    setRatePreview(null);
    notify(`${invoice} saved`);"""

if old_resets in code:
    code = code.replace(old_resets, new_resets)
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(code)
    print("Added extra resets!")
else:
    print("Could not find old_resets block")
