param(
    [int]$Port = 3000
)

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

# Check port availability or increment
$listener = $null
$maxTries = 10
for ($i = 0; $i -lt $maxTries; $i++) {
    try {
        $testListener = New-Object System.Net.HttpListener
        $testListener.Prefixes.Add("http://localhost:$Port/")
        $testListener.Start()
        $listener = $testListener
        break
    } catch {
        Write-Host "Port $Port is occupied, trying $(($Port + 1))..." -ForegroundColor Yellow
        $Port++
    }
}

if (-not $listener) {
    Write-Error "Could not bind HTTP listener to any port."
    exit 1
}

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  LUMIERE 3D HERO SECTION SERVER RUNNING" -ForegroundColor Green
Write-Host "  URL: http://localhost:$Port/" -ForegroundColor Yellow
Write-Host "  Root Directory: $root" -ForegroundColor Gray
Write-Host "  Press Ctrl+C in this terminal window to stop" -ForegroundColor DarkGray
Write-Host "=======================================================" -ForegroundColor Cyan

Start-Process "http://localhost:$Port/"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".webp" = "image/webp"
}

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            $urlPath = $request.Url.LocalPath
            if ($urlPath -eq "/" -or $urlPath -eq "") {
                $urlPath = "/index.html"
            }

            # sanitize & decode path
            $decodedPath = [System.Uri]::UnescapeDataString($urlPath).TrimStart('/')
            $decodedPath = $decodedPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::Combine($root, $decodedPath)

            if ([System.IO.File]::Exists($filePath)) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = "application/octet-stream"
                if ($mimeTypes.ContainsKey($ext)) {
                    $mime = $mimeTypes[$ext]
                }

                # Cache header for static assets (frames) for high performance
                if ($ext -eq ".png" -or $ext -eq ".jpg") {
                    $response.AddHeader("Cache-Control", "public, max-age=86400")
                }

                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = $mime
                $response.ContentLength64 = $bytes.Length
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $notFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $decodedPath")
                $response.OutputStream.Write($notFoundMsg, 0, $notFoundMsg.Length)
            }

            $response.Close()
        } catch {
            # Catch client disconnections or canceled requests without stopping listener
            try { $context.Response.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
