# venera-configs

Configuration file repository for venera

## 漫画源仓库地址 / Comic Sources Repo URL

```
https://cdn.jsdelivr.net/gh/Gandum2077/venera-configs/index.json
```

## AI 自动维护 / AI-powered maintenance

本分支由 AI 自动巡检和维护，持续检查配置的可用性并修复发现的问题。你可以通过 [Issues](https://github.com/Gandum2077/venera-configs/issues) 反馈漫画源相关的问题，或者提出漫画源功能、兼容性和使用体验方面的关键改进建议。报告问题时，请尽量提供受影响的漫画源、应用版本、复现步骤，以及相关错误信息或截图，并注意隐去账号、密码、Cookie 等敏感信息，便于定位和处理。

This branch is automatically monitored and maintained by AI, which checks configuration availability and fixes detected issues. You can use [Issues](https://github.com/Gandum2077/venera-configs/issues) to report problems with comic sources and suggest key improvements to their functionality, compatibility, and user experience. To help diagnose and resolve problems, please include the affected comic source, app version, steps to reproduce, and relevant error messages or screenshots. Redact sensitive information such as account details, passwords, and cookies before submitting.

## Create a new configuration

1. Download `_template_.js`, `_venera_.js`, put them in the same directory
2. Rename `_template_.js` to `your_config_name.js`
3. Edit `your_config_name.js` to your needs. 
   - The `_template_.js` file contains comments to help you with that. 
   - The `_venera_.js` is used for code completion in your IDE.

## Pull request checks

Source IDs (`key`) and file names in `index.json` must be non-empty and unique
across the entire index. Use the same `key` in the source file and its index entry.
Run `node scripts/validate-config-ids.js` locally to check the index.

On every PR, `PR Version Check` checks these IDs before verifying source versions.
Changed source files must match their index versions and increase the version of
existing sources. `PR Source Validate` builds the latest `venera_cli` and validates
changed root-level source files (excluding `_`-prefixed templates and helpers).
Non-draft PRs have auto-merge enabled; merge requirements depend on the repository's
branch protection settings. Pushes to `main` purge changed JS/JSON files from jsDelivr.
