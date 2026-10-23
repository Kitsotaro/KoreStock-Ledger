# © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
# Genera los íconos instalables y la imagen para compartir (assets/og-imagen.png) desde assets/logo.png.
# Uso (PowerShell de Windows, sin instalar nada): powershell -File herramientas\generar-imagenes.ps1

Add-Type -AssemblyName System.Drawing
$raiz = Split-Path -Parent $PSScriptRoot
$logo = [System.Drawing.Image]::FromFile("$raiz\assets\logo.png")

function Guardar-Icono($tam, $escala, $ruta) {
  $bmp = New-Object System.Drawing.Bitmap $tam, $tam
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::White)
  $lado = [int]($tam * $escala); $off = [int](($tam - $lado) / 2)
  $g.DrawImage($logo, $off, $off, $lado, $lado)
  $bmp.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
# El logo ya trae margen blanco: «any» a tamaño completo; «maskable» más chico (zona segura 80 %)
Guardar-Icono 192 1.0 "$raiz\assets\icono-192.png"
Guardar-Icono 512 1.0 "$raiz\assets\icono-512.png"
Guardar-Icono 512 0.78 "$raiz\assets\icono-maskable-512.png"
Guardar-Icono 180 1.0 "$raiz\assets\apple-touch-icon.png"
Guardar-Icono 48 1.0 "$raiz\assets\favicon-48.png"

# Imagen para compartir enlaces (Open Graph) 1200x630
$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#ECEEF2'))
$azul = [System.Drawing.ColorTranslator]::FromHtml('#1E3A8A')
$texto = [System.Drawing.ColorTranslator]::FromHtml('#111418')
$gris = [System.Drawing.ColorTranslator]::FromHtml('#4B5563')
# Banda azul a la derecha con el logo en una tarjeta blanca
$g.FillRectangle((New-Object System.Drawing.SolidBrush $azul), 800, 0, 400, $H)
$tarjeta = New-Object System.Drawing.Drawing2D.GraphicsPath
$x = 850; $y = 165; $l = 300; $r = 40
$tarjeta.AddArc($x, $y, $r, $r, 180, 90); $tarjeta.AddArc($x + $l - $r, $y, $r, $r, 270, 90)
$tarjeta.AddArc($x + $l - $r, $y + $l - $r, $r, $r, 0, 90); $tarjeta.AddArc($x, $y + $l - $r, $r, $r, 90, 90); $tarjeta.CloseFigure()
$g.FillPath([System.Drawing.Brushes]::White, $tarjeta)
$g.DrawImage($logo, $x, $y, $l, $l)
# Textos
$fTitulo = New-Object System.Drawing.Font 'Segoe UI Semibold', 30
$fGrande = New-Object System.Drawing.Font 'Segoe UI', 44, ([System.Drawing.FontStyle]::Bold)
$fSub = New-Object System.Drawing.Font 'Segoe UI Semibold', 21
$fPie = New-Object System.Drawing.Font 'Segoe UI Semibold', 20
# Texto con interlineado propio (DrawString deja demasiado espacio entre líneas)
function Dibujar-Parrafo($texto, $fuente, $pincel, $x, $y, $ancho, $alto) {
  $lineas = @(); $actual = ''
  foreach ($p in $texto.Split(' ')) {
    $prueba = if ($actual) { "$actual $p" } else { $p }
    if ($g.MeasureString($prueba, $fuente).Width -gt $ancho -and $actual) { $lineas += $actual; $actual = $p } else { $actual = $prueba }
  }
  if ($actual) { $lineas += $actual }
  foreach ($l in $lineas) { $g.DrawString($l, $fuente, $pincel, $x, $y); $y += $alto }
  return $y
}
$g.DrawString('KoreStock Ledger', $fTitulo, (New-Object System.Drawing.SolidBrush $azul), 72, 64)
$y = Dibujar-Parrafo 'Administra tu inventario y tus ventas con privacidad total.' $fGrande (New-Object System.Drawing.SolidBrush $texto) 64 128 690 66
$y = Dibujar-Parrafo 'Tus datos, protegidos en tu propio Google Drive.' $fSub (New-Object System.Drawing.SolidBrush $azul) 70 ($y + 18) 690 36
$g.DrawString('korestock.kitsotaro.com', $fPie, (New-Object System.Drawing.SolidBrush $gris), 72, 545)
$bmp.Save("$raiz\assets\og-imagen.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $logo.Dispose()
Get-ChildItem "$raiz\assets\*.png" | Select-Object Name, Length
