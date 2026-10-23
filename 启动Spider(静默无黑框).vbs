' Spider standalone - silent launcher (no console window).
' Delegates to tools\start.ps1 so bun resolution, build, readiness wait and
' browser opening stay in one place. Shows a message box on failure.
Option Explicit
Dim fso, shell, base, ps1, logFile, rc, text
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = base & "\tools\start.ps1"
logFile = base & "\data\logs\server.log"

If Not fso.FileExists(ps1) Then
  MsgBox "Missing file:" & vbCrLf & ps1, 16, "Spider"
  WScript.Quit 1
End If

rc = shell.Run("powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, True)

If rc <> 0 Then
  text = "Spider failed to start (exit code " & rc & ")."
  If fso.FileExists(logFile) Then
    Dim f, content
    Set f = fso.OpenTextFile(logFile, 1, False)
    content = f.ReadAll
    f.Close
    If Len(content) > 1200 Then content = Right(content, 1200)
    text = text & vbCrLf & vbCrLf & "Server log (tail):" & vbCrLf & content
  End If
  MsgBox text, 16, "Spider"
  WScript.Quit 1
End If

WScript.Quit 0
