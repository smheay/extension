<img width="520" height="981" alt="image" src="https://github.com/user-attachments/assets/f87a9db5-224a-487e-a51d-e467b238bc63" />


AI coded 

# Twitch Quick Commands

**Click-to-send preset commands into Twitch chat for interactive streams.**

A Chrome extension that helps streamers and viewers quickly send predefined commands to Twitch chat with just a click. Perfect for interactive streams, games, polls, and frequent commands.

## 🎯 Features

- **Quick Command Panel**: Toggle overlay with Ctrl+Shift+Y or popup
- **Customizable Profiles**: Create different command sets (Game Commands, Emotes, Custom)
- **Organized Sections**: Group related commands together
- **Drag & Drop Reordering**: Rearrange commands within a section (not between sections)
- **Auto-Save**: Changes are saved automatically as you type
- **Visual Feedback**: Smooth animations and clear drop indicators
- **Multiple Profiles**: Switch between different command sets instantly

## 🚀 Installation

### From Chrome Web Store (Recommended)
1. Visit the Chrome Web Store listing
2. Click "Add to Chrome"
3. Click "Add extension" to confirm

### Manual Installation (Developer Mode)
1. Download and extract the extension files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked" and select the extension folder

## 📖 How to Use

### Basic Usage
1. **Open Twitch** in any tab
2. **Toggle Panel**: Press `Ctrl+Shift+Y` or click the extension icon
3. **Click Commands**: Click any button to send that command to chat
4. **Customize**: Right-click the extension icon → "Options" to customize

### Setting Up Commands
1. **Open Options**: Right-click extension icon → "Options"
2. **Add Sections**: Click "Add Section" to create command groups
3. **Add Commands**: Use the "+" button within each section
4. **Customize**: 
   - **Label**: What appears on the button
   - **Text**: What gets sent to chat
5. **Reorder**: Drag commands within a section to rearrange them
6. **Auto-Save**: Everything saves automatically

### Multiple Profiles
- **Switch Profiles**: Use the dropdown in options to switch between profiles
- **Rename Profiles**: Edit the profile name field next to the dropdown
- **Create New**: Click "Add Profile" to create a new command set
- **Reset Defaults**: Use "Reset to Defaults" to restore default commands

## 🎮 Default Commands

### Game Commands
- **Core Commands**: `!join`, `!spawn`, `!flee`
- **MXP Buffs**: `!aoe`, `!aoemax`, `!dmg`, `!dmgmax`, `!hp`, `!hpmax`, `!speed`, `!speedmax`
- **Upgrades**: `!boost`, `!explode`, `!invulnerability`, unlock commands
- **Character Commands**: `!fart`, `!evolvekevin`, `!evolvesuccubus`, `!evolvewoodlandjoe`

### Emotes
- **bruhSit**, **BOOBA**, **AwkwardMonkey**, **docnotL**, **fat**

## ⌨️ Keyboard Shortcuts

- **Toggle Panel**: `Ctrl+Shift+Y` (customizable in Chrome extensions settings)

## 🔧 Technical Details

- **Manifest Version**: 3 (Latest Chrome extension standard)
- **Permissions**: 
  - `tabs`: Find Twitch tabs
  - `scripting`: Inject command functionality
  - `storage`: Save your custom commands
- **Host Permissions**: `https://*.twitch.tv/*` (Only works on Twitch)

## 🛡️ Privacy & Security

- **No Data Collection**: Your commands are stored in Chrome storage on your device (profiles sync across signed-in Chrome devices via `chrome.storage.sync`; overlay position stays local)
- **Twitch Only**: Extension only activates on Twitch.tv
- **No Network Requests**: No data is sent to external servers
- **Open Source**: Code is transparent and auditable

## 🐛 Troubleshooting

**Panel not appearing?**
- Make sure you're on a Twitch page
- Try refreshing the Twitch tab
- Check if the extension is enabled in `chrome://extensions/`

**Commands not sending?**
- Hard refresh the Twitch tab after reloading the extension (`Ctrl+Shift+R`)
- Ensure you're on a Twitch page with chat visible
- Try clicking in the chat box first

**Reloaded the extension in dev mode?**
- Reloading at `chrome://extensions` does not update already-open Twitch tabs
- Hard refresh every open Twitch tab so the latest content scripts load

**Lost custom commands?**
- Commands are saved automatically and persist between sessions
- Custom profiles you created are kept when the extension updates
- The built-in **Game commands** profile is refreshed to the latest default commands on each update
- Use **Reset to Defaults** on any profile to restore its default command set

## 📝 Version History

### v1.1.4
- Refactored chat sending into a three-strategy fallback chain (onSendMessage → slate input → DOM)
- Page bridge token auth for safer chat postMessage handling
- Fixed WYSIWYG editor crashes and first-click double-send on fallback paths
- Game commands profile refreshes on extension update; custom profiles preserved
- Fixed overlay storage listener leak on SPA navigation
- Duplicate section titles visible in overlay (labeled Section (2), etc.)
- Popup error feedback when Panel is used off Twitch; shortcut hint Ctrl+Shift+Y

### v1.1.3
- Fixed overlay add-command form placement for duplicate section names
- Removed unused message handlers
- Game commands profile auto-updates on extension update; custom profiles are preserved

### v1.1.2
- Reliable chat sending via main-world page bridge (Twitch Slate editor)
- Profile reset and options page fixes

### v1.1.0
- Improved drag and drop reliability
- Fixed layout stability issues
- Enhanced visual feedback
- Added smooth auto-save notifications
- Eliminated menu shifting when adding sections

### v1.0.0
- Initial release
- Basic command functionality
- Profile management
- Auto-save system

## 🤝 Support

Having issues? Here are some helpful steps:
1. Check the troubleshooting section above
2. Refresh the Twitch page
3. Disable and re-enable the extension
4. Check browser console for errors (`F12` → Console tab)

## 🔄 Updates

The extension automatically updates through the Chrome Web Store. You'll be notified when new versions are available.

---

**Made for streamers, by streamers. Happy streaming! 🎮✨**
