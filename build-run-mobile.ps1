# Builds the SivaCare Capacitor Android app.
# Usage:
#   .\build-run-mobile.ps1          # build web assets, sync Android, build debug APK
#   .\build-run-mobile.ps1 -Run     # build and run on connected Android device/emulator
#   .\build-run-mobile.ps1 -Open    # build and open Android Studio

param(
  [switch]$Run,
  [switch]$Open
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @()
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

function Ensure-GradleTrustStore {
  $trustDir = Join-Path $env:TEMP "sivacare-gradle"
  $trustStore = Join-Path $trustDir "windows-roots.jks"
  $certDir = Join-Path $trustDir "certs"
  if (Test-Path $trustStore) { return (Resolve-Path -LiteralPath $trustStore).Path }

  Write-Host "Creating Java truststore from Windows root certificates..."
  New-Item -ItemType Directory -Path $trustDir -Force | Out-Null
  New-Item -ItemType Directory -Path $certDir -Force | Out-Null
  $certs = @()
  foreach ($store in @("Cert:\CurrentUser\Root", "Cert:\LocalMachine\Root")) {
    if (Test-Path $store) {
      $certs += Get-ChildItem -Path $store -ErrorAction SilentlyContinue |
        Where-Object { $_.NotAfter -gt (Get-Date) -and $_.HasPrivateKey -eq $false }
    }
  }
  $certs = $certs | Sort-Object Thumbprint -Unique
  if (-not $certs.Count) { throw "No Windows root certificates could be read for Java truststore creation." }

  $index = 0
  foreach ($cert in $certs) {
    $index++
    $certPath = Join-Path $certDir "$($cert.Thumbprint).cer"
    [System.IO.File]::WriteAllBytes($certPath, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    & keytool.exe -importcert -noprompt -storetype JKS -keystore $trustStore -storepass changeit -alias "winroot-$index" -file $certPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to import certificate into Java truststore: $($cert.Subject)" }
  }
  return (Resolve-Path -LiteralPath $trustStore).Path
}

function Ensure-AndroidLicenses {
  $sdkRoot = "C:\Users\HP\AppData\Local\Android\Sdk"
  $licensesDir = Join-Path $sdkRoot "licenses"
  if (-not (Test-Path $sdkRoot)) { return }
  Write-Host "Ensuring Android SDK license files exist..."
  try {
    New-Item -ItemType Directory -Path $licensesDir -Force | Out-Null
    if (-not (Test-Path (Join-Path $licensesDir "android-sdk-license"))) {
      Set-Content -LiteralPath (Join-Path $licensesDir "android-sdk-license") -Value @(
        "8933bad161af4178b1185d1a37fbf41ea5269c55",
        "d56f5187479451eabf01fb78af6dfcb131a6481e",
        "24333f8a63b6825ea9c5514f83c2829b004d1fee"
      )
    }
    if (-not (Test-Path (Join-Path $licensesDir "android-sdk-preview-license"))) {
      Set-Content -LiteralPath (Join-Path $licensesDir "android-sdk-preview-license") -Value @(
        "84831b9409646a918e30573bab4c9c91346d8abd"
      )
    }
  } catch {
    Write-Host "Could not write SDK license files, continuing because they may already exist: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host "Starting SivaCare Capacitor mobile build..."

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing npm dependencies..."
  Invoke-Checked "npm.cmd" @("install", "--strict-ssl=false")
}

if (-not (Test-Path "android")) {
  Write-Host "Adding Android platform..."
  Invoke-Checked "npx.cmd" @("cap", "add", "android")
}

Write-Host "Building static Next.js app and syncing Capacitor..."
Invoke-Checked "npm.cmd" @("run", "mobile:build")

$capacitorGradleFiles = @(
  "android\app\capacitor.build.gradle",
  "node_modules\@capacitor\android\capacitor\build.gradle"
)
Write-Host "Patching Capacitor Java target to match installed JDK 17..."
foreach ($capacitorGradle in $capacitorGradleFiles) {
  if (Test-Path $capacitorGradle) {
    $gradleText = Get-Content -Raw -LiteralPath $capacitorGradle
    $gradleText = $gradleText.Replace("JavaVersion.VERSION_21", "JavaVersion.VERSION_17")
    Set-Content -LiteralPath $capacitorGradle -Value $gradleText
  }
}

$androidVariables = "android\variables.gradle"
if (Test-Path $androidVariables) {
  Write-Host "Patching Android SDK target to AndroidX-required SDK 36..."
  $variablesText = Get-Content -Raw -LiteralPath $androidVariables
  $variablesText = $variablesText -replace "compileSdkVersion = \d+", "compileSdkVersion = 36"
  $variablesText = $variablesText -replace "targetSdkVersion = \d+", "targetSdkVersion = 36"
  Set-Content -LiteralPath $androidVariables -Value $variablesText
}

$appBuildGradle = "android\app\build.gradle"
if (Test-Path $appBuildGradle) {
  $appBuildText = Get-Content -Raw -LiteralPath $appBuildGradle
  $appBuildText = $appBuildText -replace "\r?\n\s*buildToolsVersion\s+`"34\.0\.0`"", ""
  Set-Content -LiteralPath $appBuildGradle -Value $appBuildText
}

$gradleTrustStore = Ensure-GradleTrustStore
Ensure-AndroidLicenses
$gradleProperties = "android\gradle.properties"
if (Test-Path $gradleProperties) {
  Write-Host "Patching Gradle JVM args to use local Java truststore..."
  $propertiesText = Get-Content -Raw -LiteralPath $gradleProperties
  $trustStoreForGradle = $gradleTrustStore.Replace("\", "/")
  $propertiesText = $propertiesText -replace "org\.gradle\.jvmargs=.*", "org.gradle.jvmargs=-Xmx1536m -Djavax.net.ssl.trustStore=$trustStoreForGradle -Djavax.net.ssl.trustStorePassword=changeit -Djavax.net.ssl.trustStoreType=JKS -Dcom.sun.net.ssl.checkRevocation=false"
  Set-Content -LiteralPath $gradleProperties -Value $propertiesText
}

$wrapperProperties = "android\gradle\wrapper\gradle-wrapper.properties"
$localGradleDir = ".gradle-local"
$localGradleZip = Join-Path $localGradleDir "gradle-8.14.3-all.zip"
if (Test-Path $wrapperProperties) {
  if (-not (Test-Path $localGradleZip)) {
    Write-Host "Gradle ZIP not found locally: $localGradleZip" -ForegroundColor Yellow
    Write-Host "Trying to download it. If this fails, download this URL in your browser and save it to that path:" -ForegroundColor Yellow
    Write-Host "https://services.gradle.org/distributions/gradle-8.14.3-all.zip" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $localGradleDir -Force | Out-Null
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    try {
      Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-8.14.3-all.zip" -OutFile $localGradleZip -UseBasicParsing
    } catch {
      throw "Could not download Gradle automatically. Browser-download https://services.gradle.org/distributions/gradle-8.14.3-all.zip and save it as $localGradleZip, then run this script again. Original error: $($_.Exception.Message)"
    }
  }
  $absoluteGradleZip = (Resolve-Path -LiteralPath $localGradleZip).Path
  $gradleFileUrl = ([System.Uri]$absoluteGradleZip).AbsoluteUri
  $wrapperText = Get-Content -Raw -LiteralPath $wrapperProperties
  $wrapperText = $wrapperText -replace "distributionUrl=.*", "distributionUrl=$gradleFileUrl"
  $wrapperText = $wrapperText -replace "validateDistributionUrl=.*", "validateDistributionUrl=false"
  Set-Content -LiteralPath $wrapperProperties -Value $wrapperText
}

Write-Host "Building Android debug APK..."
Push-Location android
try {
  Invoke-Checked ".\gradlew.bat" @("assembleDebug")
} finally {
  Pop-Location
}

$apk = "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
  Write-Host "APK ready: $apk" -ForegroundColor Green
} else {
  throw "Gradle finished but APK was not found at $apk"
}

if ($Run) {
  Write-Host "Installing/running on connected Android device or emulator..."
  Invoke-Checked "npx.cmd" @("cap", "run", "android")
} elseif ($Open) {
  Write-Host "Opening Android Studio..."
  Invoke-Checked "npx.cmd" @("cap", "open", "android")
} else {
  Write-Host "Done. Use -Run to install on a connected phone/emulator, or -Open to open Android Studio."
}
