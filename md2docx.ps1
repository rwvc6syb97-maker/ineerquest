# Markdown -> HTML -> DOCX 转换脚本（零依赖，依赖本机 Word COM）
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$srcMd   = Join-Path $scriptDir '产品分析报告-MBTI职业规划网页产品.md'
$desktop = [Environment]::GetFolderPath('Desktop')
$outDocx = Join-Path $desktop 'InnerQuest-产品分析报告.docx'
$tmpHtml = Join-Path $env:TEMP 'innerquest_report.html'

if (-not (Test-Path -LiteralPath $srcMd)) {
    Write-Output ("SRC_NOT_FOUND=" + $srcMd)
    exit 1
}

# 读取 Markdown（UTF8）
$lines = Get-Content -LiteralPath $srcMd -Encoding UTF8

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<html><head><meta charset="utf-8">')
[void]$sb.AppendLine('<style>')
[void]$sb.AppendLine('body{font-family:"Microsoft YaHei","微软雅黑",sans-serif;font-size:11pt;line-height:1.6;}')
[void]$sb.AppendLine('h1{font-size:22pt;color:#1a1a2e;border-bottom:2px solid #4a4a8a;padding-bottom:6px;}')
[void]$sb.AppendLine('h2{font-size:17pt;color:#2a2a5a;margin-top:20px;}')
[void]$sb.AppendLine('h3{font-size:13pt;color:#3a3a6a;}')
[void]$sb.AppendLine('table{border-collapse:collapse;width:100%;margin:10px 0;}')
[void]$sb.AppendLine('th,td{border:1px solid #999;padding:6px 10px;font-size:10.5pt;}')
[void]$sb.AppendLine('th{background:#e8e8f4;}')
[void]$sb.AppendLine('blockquote{border-left:4px solid #ccc;margin:8px 0;padding:4px 12px;color:#555;background:#f7f7fb;}')
[void]$sb.AppendLine('pre{background:#f4f4f4;border:1px solid #ddd;padding:8px;font-family:Consolas,monospace;font-size:10pt;white-space:pre-wrap;}')
[void]$sb.AppendLine('code{font-family:Consolas,monospace;background:#f0f0f0;padding:1px 4px;}')
[void]$sb.AppendLine('</style></head><body>')

function Convert-Inline([string]$t) {
    $amp = [char]38 + 'amp;'; $lt = [char]38 + 'lt;'; $gt = [char]38 + 'gt;'
    $t = $t.Replace([char]38, $amp).Replace([char]60, $lt).Replace([char]62, $gt)
    $t = [regex]::Replace($t, '\*\*(.+?)\*\*', ('<strong>' + '$1' + '</strong>'))
    $t = [regex]::Replace($t, '`(.+?)`', '<code>$1</code>')
    $t = [regex]::Replace($t, '\[(.+?)\]\((.+?)\)', '<a href="$2">$1</a>')
    return $t
}

$inCode = $false
$inTable = $false
$codeLang = ''
$tableRows = @()

function Flush-Table {
    param($rows)
    if ($rows.Count -eq 0) { return '' }
    $out = '<table>'
    $isHeader = $true
    foreach ($r in $rows) {
        $cells = $r.Trim('|').Split('|')
        # 跳过分隔行 |---|---|
        if ($r -match '^\s*\|?[\s:\-\|]+\|?\s*$' -and $r -match '\-') { $isHeader = $false; continue }
        $tag = if ($isHeader) { 'th' } else { 'td' }
        $out += '<tr>'
        foreach ($c in $cells) { $out += "<$tag>" + (Convert-Inline $c.Trim()) + "</$tag>" }
        $out += '</tr>'
        if ($isHeader) { $isHeader = $false }
    }
    $out += '</table>'
    return $out
}

foreach ($line in $lines) {
    # 去除 BOM
    $line = $line -replace '^\uFEFF',''

    if ($line -match '^```') {
        if (-not $inCode) {
            $inCode = $true
            $codeLang = ($line -replace '^```','').Trim()
            [void]$sb.AppendLine('<pre>')
        } else {
            $inCode = $false
            [void]$sb.AppendLine('</pre>')
        }
        continue
    }
    if ($inCode) {
        $esc = $line.Replace([char]38, ([char]38 + 'amp;')).Replace([char]60, ([char]38 + 'lt;')).Replace([char]62, ([char]38 + 'gt;'))
        [void]$sb.AppendLine($esc)
        continue
    }

    # 表格行
    if ($line -match '^\s*\|.*\|\s*$') {
        $inTable = $true
        $tableRows += $line
        continue
    } else {
        if ($inTable) {
            [void]$sb.AppendLine((Flush-Table $tableRows))
            $tableRows = @()
            $inTable = $false
        }
    }

    if ($line -match '^#\s+(.*)') { [void]$sb.AppendLine('<h1>' + (Convert-Inline $Matches[1]) + '</h1>'); continue }
    if ($line -match '^##\s+(.*)') { [void]$sb.AppendLine('<h2>' + (Convert-Inline $Matches[1]) + '</h2>'); continue }
    if ($line -match '^###\s+(.*)') { [void]$sb.AppendLine('<h3>' + (Convert-Inline $Matches[1]) + '</h3>'); continue }
    if ($line -match '^>\s?(.*)') { [void]$sb.AppendLine('<blockquote>' + (Convert-Inline $Matches[1]) + '</blockquote>'); continue }
    if ($line -match '^\s*[-*]\s+(.*)') { [void]$sb.AppendLine('<ul><li>' + (Convert-Inline $Matches[1]) + '</li></ul>'); continue }
    if ($line -match '^\s*\d+\.\s+(.*)') { [void]$sb.AppendLine('<ol><li>' + (Convert-Inline $Matches[1]) + '</li></ol>'); continue }
    if ($line -match '^\s*---\s*$') { [void]$sb.AppendLine('<hr/>'); continue }
    if ($line.Trim() -eq '') { [void]$sb.AppendLine('<p></p>'); continue }
    [void]$sb.AppendLine('<p>' + (Convert-Inline $line) + '</p>')
}
if ($inTable) { [void]$sb.AppendLine((Flush-Table $tableRows)) }

[void]$sb.AppendLine('</body></html>')

# 写 HTML（UTF8 带 BOM，确保 Word 正确识别中文）
$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($tmpHtml, $sb.ToString(), $enc)

# 用 Word 打开 HTML 另存为 docx
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open($tmpHtml)
    # wdFormatDocumentDefault = 16 (.docx)
    $doc.SaveAs([ref]$outDocx, [ref]16)
    $doc.Close()
    Write-Output ("DONE=" + $outDocx)
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}