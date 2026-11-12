# Draws the merged pictures of a spec-kit plan: for each side, each part's cut of its screenshot, stacked top to bottom.
#   powershell -File .claude/skills/ui-preview/stitch.ps1 -PlanFile <scratchpad>\stitch-plan.json
param([Parameter(Mandatory = $true)][string]$PlanFile)
Add-Type -AssemblyName System.Drawing
$plan = Get-Content $PlanFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($item in $plan.plan) {
  foreach ($side in @("before", "after")) {
    $canvas = New-Object System.Drawing.Bitmap ([int]$item.width), ([int]$item.height)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 15, 26, 21))
    foreach ($part in $item.parts) {
      $src = [System.Drawing.Bitmap]::FromFile((Join-Path (Join-Path $plan.dir $side) $part.src))
      $from = New-Object System.Drawing.Rectangle ([int]$part.area.x), ([int]$part.area.y), ([int]$part.area.width), ([int]$part.area.height)
      $to = New-Object System.Drawing.Rectangle 0, ([int]$part.y), ([int]$part.area.width), ([int]$part.area.height)
      $g.DrawImage($src, $to, $from, [System.Drawing.GraphicsUnit]::Pixel)
      $src.Dispose()
    }
    $g.Dispose()
    $canvas.Save((Join-Path (Join-Path $plan.dir $side) $item.file), [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    "$side/$($item.file): $($item.width)x$($item.height)"
  }
}
