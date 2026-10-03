# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/V2App.tsx', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    'import { useEffect, useMemo, useState } from "react";',
    'import { useEffect, useMemo, useState } from "react";\nimport { App } from "@capacitor/app";'
)

with codecs.open('app/v2/V2App.tsx', 'w', 'utf-8') as f:
    f.write(code)

print('Added App import correctly')
