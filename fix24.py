import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_end = '''    } catch {}
    notify(`${invoice} saved`);
  };'''

new_end = '''    } catch {}
    setSaving(false);
    setCart([]);
    setSpecialDiscountPercent(0);
    setPatientId("");
    setPending(null);
    notify(`${invoice} saved`);
  };'''

if old_end in code:
    code = code.replace(old_end, new_end)
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(code)
    print("Fixed!")
else:
    print("Could not find old_end")
