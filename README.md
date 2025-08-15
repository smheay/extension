<img width="520" height="981" alt="image" src="https://github.com/user-attachments/assets/f87a9db5-224a-487e-a51d-e467b238bc63" />


AI coded 

# Twitch Quick Commands

**Click-to-send preset commands into Twitch chat for interactive streams.**

A Chrome extension that helps streamers and viewers quickly send predefined commands to Twitch chat with just a click. Perfect for interactive streams, games, polls, and frequent commands.

## 🎯 Features

- **Quick Command Panel**: Toggle overlay with Ctrl+Shift+Y or popup
- **Customizable Profiles**: Create different command sets (Game Commands, Emotes, Custom)
- **Organized Sections**: Group related commands together
- **Drag & Drop Reordering**: Easily rearrange commands within sections
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
5. **Reorder**: Drag commands to rearrange them
6. **Auto-Save**: Everything saves automatically

### Multiple Profiles
- **Switch Profiles**: Use the dropdown in options to switch between profiles
- **Create New**: Click "Add Profile" to create a new command set
- **Reset Defaults**: Use "Reset to Defaults" to restore default commands

## 🎮 Default Commands

### Game Commands
- **Start Game**: `!startgame`
- **Stop Game**: `!stopgame`
- **Reset Game**: `!resetgame`
- **Join Game**: `!joingame`
- **Leave Game**: `!leavegame`

### Fun Commands
- **Explode**: `!explode`
- **Fart**: `!fart`
- **Boost**: `!boost`

### Voting
- **Vote 1**: `!vote1`
- **Vote 2**: `!vote2`

### Emotes
- **Heart**: `❤️`
- **Thumbs Up**: `👍`
- **Fire**: `🔥`
- **GG**: `GG`
- **KEKW**: `KEKW`

## ⌨️ Keyboard Shortcuts

- **Toggle Panel**: `Ctrl+Shift+Y` (customizable in Chrome extensions settings)

## 🔧 Technical Details

- **Manifest Version**: 3 (Latest Chrome extension standard)
- **Permissions**: 
  - `activeTab`: Access current Twitch tab
  - `tabs`: Find Twitch tabs
  - `scripting`: Inject command functionality
  - `storage`: Save your custom commands
- **Host Permissions**: `https://*.twitch.tv/*` (Only works on Twitch)

## 🛡️ Privacy & Security

- **No Data Collection**: Your commands are stored locally only
- **Twitch Only**: Extension only activates on Twitch.tv
- **No Network Requests**: No data is sent to external servers
- **Open Source**: Code is transparent and auditable

## 🐛 Troubleshooting

**Panel not appearing?**
- Make sure you're on a Twitch page
- Try refreshing the Twitch tab
- Check if the extension is enabled in `chrome://extensions/`

**Commands not sending?**
- Ensure you're focused on the chat input area
- Try clicking in the chat box first
- Refresh the page if needed

**Lost custom commands?**
- Commands are saved automatically and persist between sessions
- Use "Reset to Defaults" if needed to restore default commands

## 📝 Version History

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
