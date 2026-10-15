Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap("public/mobile-home-bg.jpg")
Write-Output "--- Scan at x=100 (left side where boy might be) ---"
for ($y = 500; $y -lt 850; $y += 30) {
    $c = $bmp.GetPixel(100, $y)
    Write-Output "y=$y R=$($c.R) G=$($c.G) B=$($c.B)"
}

Write-Output "--- Scan at x=440 (right side where girl might be) ---"
for ($y = 500; $y -lt 850; $y += 30) {
    $c = $bmp.GetPixel(440, $y)
    Write-Output "y=$y R=$($c.R) G=$($c.G) B=$($c.B)"
}
$bmp.Dispose()
