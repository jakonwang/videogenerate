!macro customInstall
  DetailPrint "Installing the compatible Hermes runtime..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\hermes\bootstrap.ps1" -ManifestPath "$INSTDIR\resources\hermes\runtime-manifest.json"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Hermes installation did not complete. VideoGenerate can repair it after startup."
  ${Else}
    DetailPrint "Hermes runtime is ready."
  ${EndIf}
!macroend
