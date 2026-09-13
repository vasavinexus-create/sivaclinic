Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType=WindowsRuntime]

function Await-Operation($operation) {
  $event = [System.Threading.ManualResetEvent]::new($false)
  $operation.Completed = {
    param($asyncInfo, $asyncStatus)
    $event.Set() | Out-Null
  }
  $event.WaitOne() | Out-Null
  return $operation.GetResults()
}

function Get-OcrText($path) {
  $fullPath = (Resolve-Path -LiteralPath $path).Path
  $file = Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($fullPath))
  $stream = Await-Operation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
  $decoder = Await-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
  $bitmap = Await-Operation ($decoder.GetSoftwareBitmapAsync())
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  $result = Await-Operation ($engine.RecognizeAsync($bitmap))
  return $result.Text
}

foreach ($path in $args) {
  "===== $path ====="
  Get-OcrText $path
}
