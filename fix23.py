import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_end = '''    } catch {}
  };'''

new_end = '''    } catch {}
    setSaving(false);
    setCart([]);
    setSpecialDiscountPercent(0);
    setPending(null);
    notify(`${invoice} saved`);
  };'''

code = code.replace(old_end, new_end)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")
