# -*- coding: utf-8 -*-
import codecs

with codecs.open('build-run-mobile.ps1', 'r', 'utf-8') as f:
    code = f.read()

code = code.replace(
    '$keytoolOutput = & keytool.exe -importcert -noprompt -storetype JKS -keystore $trustStore -storepass changeit -alias "winroot-$index" -file $certPath 2>&1',
    '& keytool.exe -importcert -noprompt -storetype JKS -keystore $trustStore -storepass changeit -alias "winroot-$index" -file $certPath *>$null'
)

with codecs.open('build-run-mobile.ps1', 'w', 'utf-8') as f:
    f.write(code)

print("Fixed build-run-mobile.ps1 keytool error handling")
