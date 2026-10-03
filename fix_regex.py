import codecs
import re

with codecs.open('build-run-mobile.ps1', 'r', 'utf-8') as f:
    code = f.read()

pattern = r'\$capacitorGradleFiles = \@\([\s\S]*?\}\s*\}'
replacement = """$capacitorGradleFiles = @(
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

new_code = re.sub(pattern, replacement, code)
if new_code != code:
    with codecs.open('build-run-mobile.ps1', 'w', 'utf-8') as f:
        f.write(new_code)
    print("Regex patch successful!")
else:
    print("Regex failed to match!")
