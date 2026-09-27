; After an install or auto-update the exe is replaced, and Windows can keep a stale,
; blank entry in its icon cache for the taskbar pin and shortcuts. Refresh it.
!macro customInstall
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend
