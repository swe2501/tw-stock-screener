' run_hidden.vbs - run a command with no window (no console flash) and return its exit code.
' Usage (Task Scheduler): wscript.exe "C:\Users\User\Desktop\AI_stock\scripts\run_hidden.vbs" <program> [args...]
' Added 2026-11-13: scheduled tasks that start powershell.exe or .bat directly flash a console window.
Option Explicit
Dim sh, cmd, i, a
Set sh = CreateObject("WScript.Shell")
cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  a = WScript.Arguments(i)
  If a = "" Or InStr(a, " ") > 0 Then a = Chr(34) & a & Chr(34)
  cmd = cmd & a & " "
Next
If cmd = "" Then WScript.Quit 2
WScript.Quit sh.Run(Trim(cmd), 0, True)