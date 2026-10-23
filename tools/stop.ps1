$pids = Get-NetTCPConnection -LocalPort 4319 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($pids) {
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Spider 服务 (端口 4319) 已成功停止！" -ForegroundColor Green
} else {
    Write-Host "未发现正在运行的 Spider 服务。" -ForegroundColor Yellow
}
Start-Sleep -Seconds 1
