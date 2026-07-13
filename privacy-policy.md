# Privacy Policy - Twitch Quick Commands Extension

**Last Updated: July 2026**

## Overview

Twitch Quick Commands ("the Extension") is committed to protecting your privacy. This privacy policy explains how we handle information when you use our Chrome extension.

## Information We Don't Collect

**We do not operate our own servers, analytics, or tracking.** We do not collect, store, or sell your personal information on our systems.

Specifically, we do **not**:
- Collect browsing history outside Twitch usage of the Extension
- Send your data to our own servers (we have none)
- Use analytics, advertising, or tracking SDKs
- Sell or share data with third parties for marketing

## Information Stored in Chrome

The Extension stores the following information in Chrome's built-in storage APIs:

### Command Data (`chrome.storage.sync`)
- Custom command labels and text you create
- Profile names and organization
- Section organization and ordering

Profiles and commands may sync across devices when you are signed into Chrome with sync enabled.

### Overlay Layout (`chrome.storage.local`)
- Floating panel position and size on Twitch pages
- Stored on the current device only

### Important Notes About Storage
- This Extension data is not transmitted to our servers
- We cannot access your Chrome storage
- Chrome may sync profile data across your signed-in devices using Google's sync infrastructure
- You can delete this data anytime by removing the Extension

## Twitch Requests (Optional Prediction Commands)

When you click a **prediction** command (text starting with `tqc-predict:`), the Extension may:

- Read your existing Twitch session cookies in the browser (such as `auth-token`) on the Twitch page
- Call Twitch’s GraphQL API (`https://gql.twitch.tv/gql`) to place a channel-point prediction on the current channel

These requests go **directly from your browser to Twitch**, using your already-logged-in Twitch session. They are only made when you click a prediction command. Regular chat commands are sent through Twitch’s on-page chat UI and do not use this GraphQL flow.

We do not receive those requests, tokens, or prediction results on any server of our own.

## Permissions Explanation

The Extension requests these permissions for functionality:

### `tabs`
- **Purpose**: Locate the active browser tab when you open the Extension popup or use the keyboard shortcut, so the overlay can be toggled on a Twitch tab
- **Scope**: Used to check whether the active tab is on Twitch
- **Data Access**: Tab URL checks to identify Twitch pages; no unrelated browsing data is stored by the Extension

### `scripting`
- **Purpose**: Inject the overlay UI and chat/prediction helpers into Twitch pages when needed
- **Scope**: Twitch.tv pages only (see host permission)
- **Data Access**: Used to run Extension scripts on Twitch; not used to scrape your browsing history

### `storage`
- **Purpose**: Save your custom commands, profiles, and overlay layout
- **Scope**: Chrome's `storage.sync` (profiles/commands) and `storage.local` (overlay layout)
- **Data Access**: Only Extension-created data

### Host Permission: `https://*.twitch.tv/*`
- **Purpose**: The Extension only runs on Twitch pages
- **Scope**: Twitch.tv domain and subdomains
- **Data Access**: Injects UI and, for prediction commands only, uses your Twitch session on that page to call Twitch GraphQL as described above

## Third-Party Services

- **No analytics or advertising** services are included
- **Twitch** may receive chat and prediction traffic that you initiate while using the site/Extension, under Twitch’s own terms and policies
- The Extension does **not** send data to any other third-party API for normal command storage or overlay use

## Data Security

- Profiles and layout stay in Chrome storage under your control
- Prediction auth uses your existing Twitch session cookies in the browser; treat Twitch account security as you normally would
- Page-bridge messaging uses a per-page token and same-origin `postMessage` as a soft mitigation against accidental spoofed messages; it is not a guarantee against hostile scripts running in Twitch’s page context

## Children's Privacy

The Extension does not knowingly collect personal information from children under 13. The Extension is intended for users who already use Twitch and Chrome.

## Changes to Privacy Policy

Any changes to this privacy policy will be:
- Updated in the Extension's store listing materials
- Reflected alongside Extension updates when relevant
- Communicated through normal update channels

## Contact Information

If you have questions about this privacy policy or the Extension's data practices:

- **GitHub**: Create an issue on the project repository
- **Chrome Web Store**: Leave a review or support question on the listing

## Your Rights and Controls

### View Your Data
- Open Extension options to see all stored commands
- All command data is visible and editable in the interface

### Delete Your Data
- Remove the Extension to delete its stored data
- Clear Extension data in Chrome settings
- Reset a profile to defaults in Extension options

### Export Your Data
- Copy command text from the options interface

## Summary

**In Plain English:**
- We don’t run servers that collect your data
- Your custom commands stay in Chrome storage (and may sync with your Chrome account)
- Optional prediction buttons may call Twitch’s API using your existing Twitch login when clicked
- Regular chat presets are sent through Twitch chat on the page
- No analytics SDKs or marketing trackers

---

**This privacy policy is effective as of the last updated date above.**
