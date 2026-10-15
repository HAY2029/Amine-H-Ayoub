Add-Type -AssemblyName System.Drawing

$srcPath = "h:\Amine-H-Ayoub\user_upload.jpg"
$destPath = "h:\Amine-H-Ayoub\public\feature_graphic_1024x500.png"

$src = [System.Drawing.Image]::FromFile($srcPath)
$canvas = New-Object System.Drawing.Bitmap(1024, 500)
$g = [System.Drawing.Graphics]::FromImage($canvas)

$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# Fill background with a matching emerald/teal color
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 14, 76, 68))
$g.FillRectangle($brush, 0, 0, 1024, 500)

# Calculate scale to crop/fit nicely into 1024x500
$scale = [Math]::Max(1024.0 / $src.Width, 500.0 / $src.Height)
$newW = [int]($src.Width * $scale)
$newH = [int]($src.Height * $scale)
$posX = [int]((1024 - $newW) / 2)
$posY = [int]((500 - $newH) / 3)

$g.DrawImage($src, $posX, $posY, $newW, $newH)

$src.Dispose()
$g.Dispose()

$canvas.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()

Write-Host "SUCCESS_CONVERTED_EXACT_IMAGE"
