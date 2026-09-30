# E2E storage API test
$ErrorActionPreference = "Stop"
$base = "http://localhost:3000"

# Get a valid image from the app itself
$asset = Invoke-WebRequest "$base/api/assets/garments/processed/blue-hoodie.webp" -UseBasicParsing
$bytes = $asset.Content

# 1) create session
$s = Invoke-RestMethod -Method Post "$base/api/sessions"
"session: $($s.sessionId.Substring(0,8))..."

# 2) upload photo
$up = Invoke-RestMethod -Method Put "$base/api/sessions/$($s.sessionId)/photo" -ContentType "image/webp" -Body $bytes
"photo upload: $($up.url) ($($up.width)x$($up.height))"

# 3) save result
$rs = Invoke-RestMethod -Method Post "$base/api/sessions/$($s.sessionId)/results" -ContentType "image/webp" -Body $bytes
"result save: $($rs.url)"

# 4) list results
$ls = Invoke-RestMethod -Method Get "$base/api/sessions/$($s.sessionId)/results"
"results listed: $($ls.results.Count)"

# 5) path traversal attempts
$trav1 = try { (Invoke-WebRequest "$base/api/assets/garments/../../package.json" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
$trav2 = try { (Invoke-WebRequest "$base/api/assets/garments/%2e%2e%2fpackage.json" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
"traversal plain: $trav1  encoded: $trav2"

# 6) invalid image rejection
try {
  $bad = Invoke-RestMethod -Method Put "$base/api/sessions/$($s.sessionId)/photo" -ContentType "image/webp" -Body ([Text.Encoding]::UTF8.GetBytes("not an image"))
  "bad upload: unexpected success"
} catch {
  $errBody = $_.ErrorDetails.Message
  "bad upload rejected: $errBody"
}

# 7) admin flow
$login = Invoke-WebRequest -Method Post "$base/api/admin/login" -ContentType "application/json" -Body '{"password":"wrong"}' -UseBasicParsing -SkipHttpErrorCheck
"login wrong pw: $($login.StatusCode)"
$login2 = Invoke-WebRequest -Method Post "$base/api/admin/login" -ContentType "application/json" -Body '{"password":"local-dev-admin-123"}' -UseBasicParsing -SessionVariable sess
"login correct: $($login2.StatusCode)"
$g = Invoke-WebRequest "$base/api/garments" -UseBasicParsing -WebSession $sess
"garments as admin: $($g.StatusCode)"
$del = Invoke-WebRequest -Method Delete "$base/api/admin/garments?id=blue-hoodie" -WebSession $sess -UseBasicParsing -SkipHttpErrorCheck
"delete without cookie (fresh session): expect 401"
$del2 = Invoke-WebRequest -Method Delete "$base/api/admin/garments?id=blue-hoodie" -WebSession $sess -UseBasicParsing -SkipHttpErrorCheck
"delete with cookie: $($del2.StatusCode) body=$($del2.Content)"
