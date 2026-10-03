# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('build-run-mobile.ps1', 'r', 'utf-8') as f:
    code = f.read()

# Replace the capacitorGradleFiles array definition block
old_block = """$capacitorGradleFiles = @(
  "android\\app\\build.gradle",
  "android\\app\\capacitor.build.gradle",
  "node_modules\\@capacitor\\android\\capacitor\\build.gradle"
)
Write-Host "Patching Capacitor Java target to match installed JDK 17..."
foreach ($capacitorGradle in $capacitorGradleFiles) {
  if (Test-Path $capacitorGradle) {
    $gradleText = Get-Content -Raw -LiteralPath $capacitorGradle
    $gradleText = $gradleText.Replace("JavaVersion.VERSION_21", "JavaVersion.VERSION_17")
    Set-Content -LiteralPath $capacitorGradle -Value $gradleText
  }
}"""

new_block = """$capacitorGradleFiles = @(
  "android\\app\\build.gradle",
  "android\\app\\capacitor.build.gradle",
  "node_modules\\@capacitor\\android\\capacitor\\build.gradle"
)
if (Test-Path "node_modules\\@capacitor") {
  Get-ChildItem -Path "node_modules\\@capacitor" -Recurse -Filter "build.gradle" | ForEach-Object {
    $capacitorGradleFiles += $_.FullName
  }
}
Write-Host "Patching Capacitor Java target to match installed JDK 17..."
foreach ($capacitorGradle in $capacitorGradleFiles) {
  if (Test-Path $capacitorGradle) {
    $gradleText = Get-Content -Raw -LiteralPath $capacitorGradle
    $gradleText = $gradleText.Replace("JavaVersion.VERSION_21", "JavaVersion.VERSION_17")
    Set-Content -LiteralPath $capacitorGradle -Value $gradleText
  }
}"""

code = code.replace(old_block, new_block)

with codecs.open('build-run-mobile.ps1', 'w', 'utf-8') as f:
    f.write(code)

print("Patched build-run-mobile.ps1")
