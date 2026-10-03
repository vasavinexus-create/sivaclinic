import codecs

with codecs.open('build-run-mobile.ps1', 'r', 'utf-8') as f:
    code = f.read()

idx1 = code.find('$capacitorGradleFiles = @(')
idx2 = code.find('}', code.find('foreach ($capacitorGradle in $capacitorGradleFiles)')) + 1

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

new_code = code[:idx1] + replacement + code[idx2:]
with codecs.open('build-run-mobile.ps1', 'w', 'utf-8') as f:
    f.write(new_code)
print("Manual patch successful!")
