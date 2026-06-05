$line = netstat -ano | Select-String ":3000" | Select-Object -First 1
if ($line) {
    $parts = $line.ToString().Trim() -split '\s+'
    $pid = $parts[-1]
    if ($pid -match '^\d+$') {
        Stop-Process -Id [int]$pid -Force -ErrorAction SilentlyContinue
        Write-Output "Encerrado PID $pid que ocupava a porta 3000"
    } else {
        Write-Output "PID inválido: $pid"
    }
} else {
    Write-Output "Nenhum processo escutando na porta 3000"
}
