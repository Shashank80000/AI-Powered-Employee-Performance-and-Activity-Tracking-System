# WorkPlus Agent installers

The desktop agent installers from the latest GitHub Release (v0.1.4). Copy any of them to another computer and install it there.
The Mac, Windows x64 and Debian installers are stored in git. `WorkPlus.Agent-0.1.4-win.exe` is not, because it is over
GitHub's 100 MB file limit (`.gitignore` skips it): get it from the release page linked below.

| Computer | File |
| --- | --- |
| Mac with Apple chip (M1 and newer) | `WorkPlus.Agent-0.1.4-mac-arm64.dmg` |
| Windows, most PCs | `WorkPlus.Agent-0.1.4-win-x64.exe` |
| Windows, either kind (one larger installer for both) | `WorkPlus.Agent-0.1.4-win.exe` |
| Linux, Debian or Ubuntu | `WorkPlus.Agent-0.1.4-linux-amd64.deb` |

For other computers (Intel Mac, Linux on ARM, or Linux without Debian/Ubuntu), download the matching installer from the latest release page linked below.

The installers have the server address built in. Sign in with an employee account.
See [desktop-agent/README.md](../desktop-agent/README.md#operating-system-support) for first-launch permissions on each OS.

To serve these from a locally run server's `/download` page, set `DOWNLOADS_DIR` to this folder in `server/.env`.

To refresh after a new release, delete the old files and download the new ones from
https://github.com/Shashank80000/AI-Powered-Employee-Performance-and-Activity-Tracking-System/releases/latest
