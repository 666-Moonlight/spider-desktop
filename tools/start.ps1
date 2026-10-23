#requires -Version 5.1
# Spider 独立版一键启动（供 启动Spider.bat / 静默 vbs 调用）
# 关键行为：先确认 bun 可用 -> 需要时构建 -> 后台起服务 -> 等到端口真的返回 HTTP -> 最后才开浏览器。
# 任一步失败都会打印中文原因并 exit 1，绝不谎报“已成功启动”。

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $PSScriptRoot
$Port     = if ($env:SPIDER_PORT) { [int]$env:SPIDER_PORT } else { 4319 }
$Url      = 'http://127.0.0.1:' + $Port + '/'
$LogDir   = Join-Path $Root 'data\logs'
$LogFile  = Join-Path $LogDir 'server.log'
$CmdFile  = Join-Path $LogDir 'start-server.cmd'
$ReadySec = if ($env:SPIDER_READY_TIMEOUT) { [int]$env:SPIDER_READY_TIMEOUT } else { 40 }
# 只有本次运行自己创建/清空的日志才在失败时展示，避免误导旧内容
$script:LogOwned = $false

function Fail([string]$Message, [string]$Hint) {
    Write-Host ''
    Write-Host ('[失败] ' + $Message) -ForegroundColor Red
    if ($Hint) { Write-Host ('       ' + $Hint) -ForegroundColor Yellow }
    if ($script:LogOwned -and (Test-Path -LiteralPath $LogFile)) {
        $tail = Get-Content -LiteralPath $LogFile -Tail 15 -ErrorAction SilentlyContinue
        if ($tail) {
            Write-Host ''
            Write-Host ('---- 服务日志 (' + $LogFile + ') ----') -ForegroundColor DarkGray
            $tail | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor DarkGray }
        }
    }
    Write-Host ''
    exit 1
}

function Resolve-Bun {
    # SPIDER_BUN 是显式覆盖：设了就必须有效，找不到直接失败（避免悄悄换一个运行时导致误判）
    if ($env:SPIDER_BUN) {
        if (Test-Path -LiteralPath $env:SPIDER_BUN -PathType Leaf) {
            return (Resolve-Path -LiteralPath $env:SPIDER_BUN).Path
        }
        Fail ('SPIDER_BUN 指向的文件不存在: ' + $env:SPIDER_BUN) '请修正该环境变量，或删除它让脚本自动查找 bun。'
    }

    $candidates = New-Object System.Collections.Generic.List[string]

    $onPath = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($onPath) { $candidates.Add($onPath.Source) }

    if ($env:USERPROFILE)  { $candidates.Add((Join-Path $env:USERPROFILE '.bun\bin\bun.exe')) }
    if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\bun\bun.exe')) }
    if ($env:APPDATA)      { $candidates.Add((Join-Path $env:APPDATA 'npm\bun.cmd')) }
    # winget 安装的 bun（目录带包名/版本）
    if ($env:LOCALAPPDATA) {
        $wingetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
        if (Test-Path -LiteralPath $wingetRoot) {
            Get-ChildItem -LiteralPath $wingetRoot -Directory -Filter '*Bun*' -ErrorAction SilentlyContinue |
                ForEach-Object {
                    Get-ChildItem -LiteralPath $_.FullName -Recurse -Depth 2 -Filter 'bun.exe' -File -ErrorAction SilentlyContinue |
                        ForEach-Object { $candidates.Add($_.FullName) }
                }
        }
    }

    # omo/agent 自带的 bun（目录名带哈希，按版本扫描取最新）
    $omoRoots = @()
    if ($env:OMO_CODING_AGENT_DIR) { $omoRoots += (Join-Path $env:OMO_CODING_AGENT_DIR 'bundled-bun') }
    if ($env:USERPROFILE)          { $omoRoots += (Join-Path $env:USERPROFILE '.omo\agent\bundled-bun') }
    foreach ($omoRoot in $omoRoots) {
        if (Test-Path -LiteralPath $omoRoot) {
            Get-ChildItem -LiteralPath $omoRoot -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { $candidates.Add((Join-Path $_.FullName 'bun.cmd')) }
        }
    }

    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) { return (Resolve-Path -LiteralPath $c).Path }
    }
    return $null
}

function Test-PortOpen {
    # 快速 TCP 探测：Get-NetTCPConnection 单次约 4 秒，会把启动拖慢
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(400)) { return $false }
        return $client.Connected
    } catch { return $false } finally { $client.Close() }
}

function Test-SpiderUp {
    if (-not (Test-PortOpen)) { return $false }
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 400) { return $false }
        # 端口被别的程序占用时也可能返回 2xx，用页面标识确认是我们自己的服务
        return ($resp.Content -match 'Spider')
    } catch { return $false }
}

Set-Location -LiteralPath $Root
Write-Host 'Spider 独立版 启动中...' -ForegroundColor Cyan

# [1/4] 定位 bun 运行时（用户 PATH 里通常没有，必须显式查找）
$Bun = Resolve-Bun
if (-not $Bun) {
    Fail '找不到 bun 运行时，本地服务无法启动。' '请安装 bun：PowerShell 里执行 irm bun.sh/install.ps1 | iex ，装好后重新双击本启动方式。'
}
Write-Host ('[1/4] bun: ' + $Bun)

# [2/4] 需要时构建前端
$indexHtml = Join-Path $Root 'dist\index.html'
if (-not (Test-Path -LiteralPath $indexHtml)) {
    Write-Host '[2/4] 首次运行，正在编译前端资源（约 10-30 秒）...' -ForegroundColor Cyan
    & $Bun run build
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $indexHtml)) {
        Fail '前端构建失败（dist\index.html 未生成）。' '请在项目目录手动执行 bun run build 查看完整报错。'
    }
    Write-Host '[2/4] 前端已编译完成'
} else {
    Write-Host '[2/4] 前端资源已存在，跳过编译'
}

# [3/4] 起服务（或复用已运行的服务）
$launcher = $null
if (Test-PortOpen) {
    Write-Host ('[3/4] 服务已在运行，复用现有进程 (端口 ' + $Port + ')')
} else {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    if (Test-Path -LiteralPath $LogFile) { Remove-Item -LiteralPath $LogFile -Force -ErrorAction SilentlyContinue }
    $script:LogOwned = $true

    # 用 cmd 包一层：bun 可能只是 .cmd 垫片，同时把 stdout/stderr 落到日志，失败才看得见原因
    $cmdLines = @(
        '@echo off'
        ('cd /d ' + ([char]34 + $Root + [char]34))
        (([char]34 + $Bun + [char]34) + ' src/server/index.ts >> ' + ([char]34 + $LogFile + [char]34) + ' 2>&1')
    )
    Set-Content -LiteralPath $CmdFile -Value $cmdLines -Encoding Default

    Write-Host ('[3/4] 正在启动本地服务 (端口 ' + $Port + ')...') -ForegroundColor Cyan
    $launcher = Start-Process -FilePath $CmdFile -WorkingDirectory $Root -WindowStyle Hidden -PassThru -ErrorAction Stop
}

# [4/4] 等端口真的可用（固定 sleep 会造成“启动成功但页面打不开”）
$deadline = (Get-Date).AddSeconds($ReadySec)
$ready = $false
$lastReport = Get-Date
while ((Get-Date) -lt $deadline) {
    if (Test-SpiderUp) { $ready = $true; break }
    if ($launcher -and $launcher.HasExited -and -not (Test-PortOpen)) { break }
    if (((Get-Date) - $lastReport).TotalSeconds -ge 5) {
        Write-Host ('      等待服务响应 ' + $Url + ' ...') -ForegroundColor DarkGray
        $lastReport = Get-Date
    }
    Start-Sleep -Milliseconds 300
}

if (-not $ready) {
    Fail ('服务没有在 ' + $ReadySec + ' 秒内响应 ' + $Url + '，浏览器未打开。') '多为 bun 启动报错或端口被别的程序占用，请看上面的服务日志。'
}

Write-Host ('[4/4] 服务已就绪: ' + $Url) -ForegroundColor Green
if (-not $env:SPIDER_NO_BROWSER) { Start-Process $Url }

Write-Host ''
Write-Host 'Spider 独立版已成功启动！' -ForegroundColor Green
Write-Host "提示：如需关闭服务，双击运行 '停止Spider.bat' 即可。" -ForegroundColor Gray
Write-Host ('服务日志: ' + $LogFile) -ForegroundColor DarkGray
Start-Sleep -Seconds 2
exit 0