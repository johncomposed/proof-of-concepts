#SingleInstance Force

; Set a variable to track the count of Ctrl+C presses
CtrlCCount := 0
ClipSaved := ""
BaseFolder := "C:\Users\john\Sourcenote\"


; Define a hotkey for Ctrl+C
$^c::
    Send, ^c
    ; Increase the count of Ctrl+C presses
    CtrlCCount++

    ; OutputDebug, % StrLen(Trim(Clipboard, "`n`r"))

    if (StrLen(Trim(Clipboard, "`n`r")) > 0) {
        ; OutputDebug, clip good.
        ClipSaved := Clipboard
    }

    ; OutputDebug, % Clipboard "bye" ClipSaved CtrlCCount

    ; Check if this is the first press
    if (CtrlCCount = 1) {
         ; Set a timer for a short period to wait for a possible second press
        SetTimer, CheckCtrlCCount, 300  ; Adjust time as needed
        return
    }

    ; If it's the second press, perform the required action
    if (CtrlCCount = 2) {
        ; Cancel the timer
        SetTimer, CheckCtrlCCount, Off
        ; Reset the count
        CtrlCCount := 0

        ; Create a timestamp for the filename
        FormatTime, CurrentTimestamp,, yyyyMMdd_HHmmss
        FileName := BaseFolder "obsidianvault\sourcenote\" CurrentTimestamp ".md"  ; Specify your directory

        ; CodeBlock :=Chr(96) Chr(96) Chr(96)
        ; FileAppend, %CodeBlock%`n%ClipSaved%`n%CodeBlock%, %FileName%

        ; Write the clipboard contents to the file
        FileAppend, %ClipSaved%, %FileName%

        ; Tell me it worked
         TrayTip, Sourcenote ahk, Saved to obsidian, 10, 17
         ; Hack to make it disapear faster
        SetTimer, HideTrayTip, -2000
    }
return

HideTrayTip() {
    TrayTip  ; Attempt to hide it the normal way.
    if SubStr(A_OSVersion,1,3) = "10." {
        Menu Tray, NoIcon
        Sleep 200  ; It may be necessary to adjust this sleep.
        Menu Tray, Icon
    }
}

; Timer subroutine to reset Ctrl+C count
CheckCtrlCCount:
    CtrlCCount := 0
    
return