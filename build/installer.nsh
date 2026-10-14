; Declare the installer and uninstaller DPI aware. Without this the NSIS windows and
; message boxes are drawn at 96 DPI and stretched by Windows on scaled displays,
; which makes the text blurry. (Applies to both installer and uninstaller builds.)
; System awareness is used on purpose: with "PerMonitorV2" the uninstaller's message
; boxes keep their old layout when moved to a monitor with a different scale.
ManifestDPIAware true

; Remove the "launch at Windows login" entry only on a real uninstall.
; During an update the old version is uninstalled with isUpdated set, and the
; entry is kept so the user's choice survives the update.
; The value name must match LOGIN_ITEM_NAME (APP_ID) in main.js.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.ppomodoro.desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.ppomodoro.desktop"
  ${endIf}
!macroend
