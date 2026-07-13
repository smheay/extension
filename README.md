# Twitch Quick Commands

**Click-to-send preset commands into Twitch chat for interactive streams.**

A Chrome extension that helps streamers and viewers quickly send predefined commands to Twitch chat with just a click. Perfect for interactive streams, games, polls, and frequent commands.

## Features

- **Quick Command Panel**: Toggle overlay with Ctrl+Shift+Y or the extension popup
- **Customizable Profiles**: Create different command sets (Game Commands, Emotes, Custom)
- **Organized Sections**: Group related commands together
- **Drag & Drop Reordering**: Rearrange commands within a section (not between sections)
- **Auto-Save**: Changes are saved automatically as you type
- **Channel Point Predictions**: Optional `tqc-predict:` commands place Yes/No bets on the active Twitch prediction
- **Multiple Profiles**: Switch between different command sets instantly

## Installation

### From Chrome Web Store (Recommended)
1. Visit the Chrome Web Store listing
2. Click "Add to Chrome"
3. Click "Add extension" to confirm

### Manual Installation (Developer Mode)
1. Download and extract the extension files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked" and select the `extension` folder

## How to Use

### Basic Usage
1. **Open Twitch** in any tab
2. **Toggle Panel**: Press `Ctrl+Shift+Y` or click the extension icon → Panel
3. **Click Commands**: Click any button to send that command to chat
4. **Customize**: Right-click the extension icon → "Options" to customize

### Setting Up Commands
1. **Open Options**: Right-click extension icon → "Options"
2. **Add Sections**: Click "Add Section" to create command groups
3. **Add Commands**: Use the "+" button within each section
4. **Customize**:
   - **Label**: What appears on the button
   - **Text**: What gets sent to chat (or a prediction command, see below)
5. **Reorder**: Drag commands within a section to rearrange them
6. **Auto-Save**: Everything saves automatically

### Prediction Commands
Use command text in this form:

- `tqc-predict:yes:250000` — bet **Yes** for 250000 channel points
- `tqc-predict:no:250000` — bet **No** for 250000 channel points

Requirements: you must be logged into Twitch, and the channel must have an open prediction. Seed defaults use 250,000 points; change the number in Options to suit your balance.

### Multiple Profiles
- **Switch Profiles**: Use the dropdown in options or in the overlay
- **Rename Profiles**: Edit the profile name field next to the dropdown
- **Create New**: Click "Add Profile" / "New Profile"
- **Reset Defaults**: Use "Reset to Defaults" to restore a starter command set for the current profile

## Default Commands

### Game Commands
- **Core Commands**: `!join`, `!spawn`, `!flee`, `!fart`
- **MXP Buffs**: `!aoe`, `!aoemax`, `!dmg`, `!dmgmax`, `!hp`, `!hpmax`, `!speed`, `!speedmax`
- **Upgrades**: `!boost`, `!explode`, `!invulnerability`, unlock commands
- **Character Commands**: evolve commands
- **Boss Vote**: `1`, `2`, `3`
- **Prediction**: Predict Yes/No (250k)

### Emotes
- **bruhSit**, **BOOBA**, **AwkwardMonkey**, **docnotL**, **fat**

## Keyboard Shortcuts

- **Toggle Panel**: `Ctrl+Shift+Y` (customizable in Chrome extensions settings)

## Technical Details

- **Manifest Version**: 3
- **Permissions**:
  - `tabs`: Find the active tab for popup / shortcut overlay toggle
  - `scripting`: Inject overlay and helpers on Twitch when needed
  - `storage`: Save custom commands (`sync`) and overlay layout (`local`)
- **Host Permissions**: `https://*.twitch.tv/*` (only runs on Twitch)

## Privacy & Security

- **No Extension Backend**: Command profiles are stored in Chrome storage on your device (profiles sync across signed-in Chrome devices via `chrome.storage.sync`; overlay layout stays local)
- **Twitch Only**: Extension scripts activate on Twitch.tv
- **Optional Twitch GQL**: Prediction commands may call Twitch GraphQL using your existing Twitch session cookies when you click a prediction button — see [`privacy-policy.md`](privacy-policy.md)
- **Open Source**: Code is transparent and auditable

## Troubleshooting

**Panel not appearing?**
- Make sure you're on a Twitch page
- Try refreshing the Twitch tab
- Check if the extension is enabled in `chrome://extensions/`

**Commands not sending?**
- Hard refresh the Twitch tab after reloading the extension (`Ctrl+Shift+R`)
- Ensure you're on a Twitch page with chat visible
- Try clicking in the chat box first

**Prediction failed?**
- Confirm you’re logged into Twitch
- Ensure the channel has an active prediction
- Check that your channel-point balance covers the stake

**Reloaded the extension in dev mode?**
- Reloading at `chrome://extensions` does not update already-open Twitch tabs
- Hard refresh every open Twitch tab so the latest content scripts load

**Lost custom commands?**
- Commands are saved automatically and persist between sessions
- Custom profiles you created are kept when the extension updates
- Built-in starter profiles (**Game commands**, **Emotes**) are only created on first install — updates never overwrite your profiles
- Use **Reset to Defaults** on any profile to restore a starter command set when you want

## Version History

### v1.1.7
- Privacy / README disclosure for prediction GraphQL usage
- Seed profiles only when storage is empty; tighter message sender checks
- Origin-scoped page-bridge messaging
- Options validation and section-delete confirm; clearer sync save errors
- Overlay height persistence and button tooltip restore after errors

### v1.1.6
- Packaging / stability continuation after 1.1.5

### v1.1.5
- Twitch prediction support via page bridge + GQL
- Shared `tqc-storage.js` module
- Overlay error feedback for failed sends / predictions

### v1.1.4
- Refactored chat sending into a three-strategy fallback chain (onSendMessage → slate input → DOM)
- Page bridge token auth for safer chat postMessage handling
- Fixed WYSIWYG editor crashes and first-click double-send on fallback paths
- Fixed overlay storage listener leak on SPA navigation
- Duplicate section titles visible in overlay (labeled Section (2), etc.)
- Popup error feedback when Panel is used off Twitch; shortcut hint Ctrl+Shift+Y

### v1.1.3
- Fixed overlay add-command form placement for duplicate section names
- Removed unused message handlers

### v1.1.2
- Reliable chat sending via main-world page bridge (Twitch Slate editor)
- Profile reset and options page fixes

### v1.1.0
- Improved drag and drop reliability
- Fixed layout stability issues
- Enhanced visual feedback
- Added smooth auto-save notifications

### v1.0.0
- Initial release
- Basic command functionality
- Profile management
- Auto-save system

## Support

Having issues? Helpful steps:
1. Check the troubleshooting section above
2. Refresh the Twitch page
3. Disable and re-enable the extension
4. Check browser console for errors (`F12` → Console tab)

## Updates

The extension automatically updates through the Chrome Web Store when published there.

---

**Made for streamers, by streamers. Happy streaming!**
