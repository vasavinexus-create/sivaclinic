# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Fix the syntax error at the end of the file
if code.endswith('    </div>\n  );\n}\n'):
    code = code[:-len('    </div>\n  );\n}\n')] + '    </div>\n;\n}\n'
elif code.endswith('    </div>\n  );\n}'):
    code = code[:-len('    </div>\n  );\n}')] + '    </div>\n;\n}'
elif '</div>\n  );\n}' in code:
    code = code.replace('</div>\n  );\n}', '</div>\n;\n}')
else:
    # Let's just find the last ); and remove the parenthesis
    import re
    code = re.sub(r'<\/div>\s*\);\s*\}\s*$', '</div>\n;\n}\n', code)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Syntax error fixed")
