# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Inject state and fetch
inject_str = """const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const editable = module.editable !== false && module.fields.length > 0;
  const state = usePagedQuery({ module, page, pageSize, search, filters, organizationId: profile.organization_id });

  useEffect(() => {
    if (module.key === 'low-stock') {
      supabase?.from('suppliers').select('id,name,address,email,mobile,gst_number,supplier_id').eq('organization_id', profile.organization_id!).order('name').then(({data}) => {
         if (data) setSuppliers(data);
      });
    }
  }, [module.key, profile.organization_id]);"""

code = re.sub(r'const \[orderQuantities,\s*setOrderQuantities\]\s*=\s*useState<Record<string,\s*number>>\(\{\}\);\s*const editable\s*=\s*module\.editable\s*!==\s*false\s*&&\s*module\.fields\.length\s*>\s*0;\s*const state\s*=\s*usePagedQuery\(\{ module, page, pageSize, search, filters, organizationId: profile\.organization_id \}\);', inject_str, code)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Injected suppliers state successfully")
