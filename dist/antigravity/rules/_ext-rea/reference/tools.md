# REA: first tool by target

Use the connected server's actual tool list; names below are from `rea-agents@6.7.0`.

- Electron/JS tree or ASAR: `analyze_javascript_application`
- Archive or package (ZIP/APK/IPA/DMG/PyInstaller): `open_binary`, then `inspect_artifact`
- APK code: `inspect_android_package`
- .NET: `inspect_managed_artifact`
- Crash report: `inspect_recorded_crash`
- Two builds: `compare_application_versions`
- Website: `inspect_web_page`, `capture_web_screenshot`, `analyze_web_bundle`
- Native code: `open_binary`, then `procedure_pseudo_code`. Needs Hopper, Ghidra or IDA.
