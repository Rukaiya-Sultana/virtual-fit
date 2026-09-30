$ErrorActionPreference = "Stop"
$base = "http://localhost:3000"

$login = Invoke-WebRequest -Method Post "$base/api/admin/login" -ContentType "application/json" -Body '{"password":"local-dev-admin-123"}' -UseBasicParsing -SessionVariable sess
"login: $($login.StatusCode)"

$r1 = Invoke-WebRequest -Method Delete "$base/api/admin/garments?id=charcoal-hoodie" -WebSession $sess -UseBasicParsing -SkipHttpErrorCheck
"delete charcoal-hoodie: $($r1.StatusCode) $($r1.Content)"

$r2 = Invoke-WebRequest -Method Delete "$base/api/admin/garments?id=charcoal-hoodie" -WebSession $sess -UseBasicParsing -SkipHttpErrorCheck
"delete again: $($r2.StatusCode) $($r2.Content)"

$g = (Invoke-RestMethod "$base/api/garments").garments
"garments now: $($g.count) → $($g.id -join ', ')"
