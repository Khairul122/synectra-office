Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(scriptDir, "start-dev.bat")

Set ws = CreateObject("WScript.Shell")
ws.Run """" & batPath & """", 0, False
