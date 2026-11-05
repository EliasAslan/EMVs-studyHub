Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $repoRoot 'public\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Icon {
  param(
    [int]$Size,
    [string]$Path,
    [double]$InsetRatio = 0
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = [System.Drawing.ColorTranslator]::FromHtml('#4f46e5')
  $fg = [System.Drawing.ColorTranslator]::FromHtml('#faf9f7')

  $g.Clear($bg)

  $inset = [int]($Size * $InsetRatio)
  $box = $Size - (2 * $inset)
  $fontSize = [single]($box * 0.56)
  $font = New-Object System.Drawing.Font('Georgia', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush($fg)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF([single]$inset, [single]($inset - ($box * 0.03)), [single]$box, [single]$box)
  $g.DrawString('S', $font, $brush, $rect, $format)

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $font.Dispose()
  $brush.Dispose()
  $format.Dispose()
}

New-Icon -Size 192 -Path (Join-Path $outDir 'icon-192.png')
New-Icon -Size 512 -Path (Join-Path $outDir 'icon-512.png')
New-Icon -Size 512 -Path (Join-Path $outDir 'icon-maskable-512.png') -InsetRatio 0.16
New-Icon -Size 180 -Path (Join-Path $outDir 'apple-touch-icon.png')

Get-ChildItem $outDir | Select-Object Name, Length
