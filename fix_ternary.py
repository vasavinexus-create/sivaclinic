# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Fix the ternary by replacing the exact block
old_block = """                  ))}
                </tbody>
            </table>
          )}
        </div>"""
new_block = """                  ))}
                </tbody>
            </table>
            </div>
          )}
        </div>"""

code = code.replace(old_block, new_block)

with codecs.open('app/v2/components/AdvancedPurchaseImportWorkflow.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Fixed ternary div")
