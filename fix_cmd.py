# -*- coding: utf-8 -*-
import codecs

with codecs.open('build-run-mobile.ps1', 'r', 'utf-8') as f:
    code = f.read()

# Use cmd /c to run keytool so powershell doesn't panic on stderr
old_cmd = '& keytool.exe -importcert -noprompt -storetype JKS -keystore $trustStore -storepass changeit -alias "winroot-$index" -file $certPath *>$null'
new_cmd = '$cmdArgs = "-importcert -noprompt -storetype JKS -keystore `"$trustStore`" -storepass changeit -alias `"winroot-$index`" -file `"$certPath`""; cmd.exe /c "keytool.exe $cmdArgs 2>nul"'

code = code.replace(old_cmd, new_cmd)

with codecs.open('build-run-mobile.ps1', 'w', 'utf-8') as f:
    f.write(code)

print("Fixed build-run-mobile.ps1 using cmd.exe")
