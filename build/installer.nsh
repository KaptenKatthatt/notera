; After an install or auto-update the exe is replaced, and Windows can keep a stale,
; blank entry in its icon cache for the taskbar pin and shortcuts. Refresh it.
;
; That is not enough for a pin made before v0.4.5, when the icon still had opaque white
; corners: Windows keeps drawing that old icon for the pin (the "Notera" entry in the jump
; list), because every shortcut points at Notera.exe,0, the key the old icon is cached under,
; and an update never recreates the shortcuts. So the shortcuts that exist are pointed at
; resources\notera.ico instead, a path Windows has never cached, and it reads the icon afresh.
; The pin keeps its place on the taskbar.

!macro noteraRelinkIcon LINK
  ${if} ${FileExists} "${LINK}"
    CreateShortCut "${LINK}" "$appExe" "" "$INSTDIR\resources\notera.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "${LINK}" "${APP_ID}"
  ${endIf}
!macroend

!macro customInstall
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
  ${if} ${FileExists} "$INSTDIR\resources\notera.ico"
    !insertmacro noteraRelinkIcon "$newStartMenuLink"
    !insertmacro noteraRelinkIcon "$newDesktopLink"
    ; Taskbar pins live in the user's own profile, also after an install for all users.
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endIf}
    !insertmacro noteraRelinkIcon "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend
