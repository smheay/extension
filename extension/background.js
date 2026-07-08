// Default profile data - shared across multiple functions to avoid duplication
const DEFAULT_GAME_SECTIONS = [
	{
		title: 'Core Commands',
		items: [
			{ label: 'Join', text: '!join' },
			{ label: 'Spawn (10s cd)', text: '!spawn' },
			{ label: 'Flee (60s cd)', text: '!flee' }
		]
	},
	{
		title: 'MXP Buffs',
		items: [
			{ label: 'AOE (1)', text: '!aoe' },
			{ label: 'DMG (1)', text: '!dmg' },
			{ label: 'HP (1)', text: '!hp' },
			{ label: 'Speed (1)', text: '!speed' }
		]
	},
	{
		title: 'Upgrades',
		items: [
			{ label: 'Boost (0)', text: '!boost' },
			{ label: 'Explode (0)', text: '!explode' },
			{ label: 'Invulnerability (0)', text: '!invulnerability' },
			{ label: 'Unlock Boost (10)', text: '!unlockboost' },
			{ label: 'Unlock Explode (15)', text: '!unlockexplode' },
			{ label: 'Unlock Invulnerability (25)', text: '!unlockinvulnerability' }
		]
	},
	{
		title: 'Character Commands',
		items: [
			{ label: 'Fart (60s cd)', text: '!fart' },
			{ label: 'Evolve Kevin (15)', text: '!evolvekevin' },
			{ label: 'Evolve Succubus (25)', text: '!evolvesuccubus' },
			{ label: 'Evolve Woodland Joe (10)', text: '!evolvewoodlandjoe' }
		]
	}
];

const DEFAULT_EMOTES_SECTIONS = [
	{
		title: 'EMOTES',
		items: [
			{ label: 'bruhSit', text: 'bruhSit' },
			{ label: 'BOOBA', text: 'BOOBA' },
			{ label: 'AwkwardMonkey', text: 'AwkwardMonkey' },
			{ label: 'docnotL', text: 'docnotL' },
			{ label: 'fat', text: 'fat' }
		]
	}
];

// Helper function to create default game profile
function createDefaultGameProfile() {
	return {
		name: 'Game commands',
		sections: JSON.parse(JSON.stringify(DEFAULT_GAME_SECTIONS)) // Deep copy to avoid mutation
	};
}

// Helper function to create emotes profile
function createEmotesProfile() {
	return {
		name: 'Emotes',
		sections: JSON.parse(JSON.stringify(DEFAULT_EMOTES_SECTIONS)) // Deep copy to avoid mutation
	};
}

// Helper functions to reduce duplication
async function getActiveTwitchTab() {
	const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	const tab = tabs[0];
	
	if (!tab || !tab.id) {
		return { error: "No active tab" };
	}
	
	const url = tab.url || "";
	if (!/https:\/\/([^.]+\.)?twitch\.tv\//i.test(url)) {
		return { error: "Open a Twitch tab and try again." };
	}
	
	return { tab };
}

async function ensureContentScriptAndSendMessage(tabId, message) {
	try {
		const response = await chrome.tabs.sendMessage(tabId, message);
		return { ok: true, response };
	} catch (e) {
		// Content script not loaded, try to inject it
		try {
			await chrome.scripting.executeScript({ 
				target: { tabId: tabId, allFrames: true }, 
				files: ["content-script.js"] 
			});
			const response = await chrome.tabs.sendMessage(tabId, message);
			return { ok: true, response };
		} catch (e2) {
			return { ok: false, error: e2.message || String(e2) };
		}
	}
}

chrome.runtime.onInstalled.addListener(async (details) => {
	if (details.reason === 'install') {
		const seedProfiles = {
			default: createDefaultGameProfile(),
			emotes: createEmotesProfile()
		};
		await chrome.storage.sync.set({ tqcProfiles: seedProfiles, tqcActiveProfileId: 'default' });
	}
});

// Handle all messages - consolidated single listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Handle recreation of Game commands profile
	if (message && message.type === 'RECREATE_GAME_PROFILE') {
		(async () => {
			try {
				const { tqcProfiles } = await chrome.storage.sync.get(['tqcProfiles']);
				const profiles = tqcProfiles || {};
				
				profiles.default = createDefaultGameProfile();
				
				await chrome.storage.sync.set({ tqcProfiles: profiles, tqcActiveProfileId: 'default' });
				sendResponse({ ok: true });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}
	
	// Handle recreation of Emotes profile
	if (message && message.type === 'RECREATE_EMOTES_PROFILE') {
		(async () => {
			try {
				const { tqcProfiles, tqcActiveProfileId } = await chrome.storage.sync.get(['tqcProfiles', 'tqcActiveProfileId']);
				const profiles = tqcProfiles || {};
				
				profiles.emotes = createEmotesProfile();
				
				await chrome.storage.sync.set({ tqcProfiles: profiles, tqcActiveProfileId: tqcActiveProfileId });
				sendResponse({ ok: true });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}
	
	// Handle toggle overlay from popup
	if (message && message.type === 'TQC_TOGGLE_OVERLAY_FROM_POPUP') {
		(async () => {
			try {
				const tabResult = await getActiveTwitchTab();
				if (tabResult.error) {
					sendResponse({ ok: false, error: tabResult.error });
					return;
				}

				const result = await ensureContentScriptAndSendMessage(
					tabResult.tab.id, 
					{ type: 'TQC_TOGGLE_OVERLAY' }
				);
				
				sendResponse({ ok: result.ok, error: result.error });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}
	
	// Handle send-command requests from popup
	if (message && message.type === "SEND_TWITCH_MESSAGE") {
		(async () => {
			try {
				if (!message.text || typeof message.text !== 'string') {
					sendResponse({ ok: false, error: 'Invalid message text' });
					return;
				}

				const tabResult = await getActiveTwitchTab();
				if (tabResult.error) {
					sendResponse({ ok: false, error: tabResult.error });
					return;
				}

				const result = await ensureContentScriptAndSendMessage(
					tabResult.tab.id, 
					{ type: "TWITCH_INSERT_AND_SEND", text: message.text }
				);
				
				sendResponse(result.ok ? result.response : { ok: false, error: result.error });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}
	
	return false; // No handler found
});

// Keyboard shortcut to toggle overlay
chrome.commands?.onCommand.addListener(async (command) => {
	if (command !== 'toggle-overlay') return;
	
	try {
		const tabResult = await getActiveTwitchTab();
		if (tabResult.error) return; // Silently fail for keyboard shortcuts
		
		await ensureContentScriptAndSendMessage(
			tabResult.tab.id, 
			{ type: 'TQC_TOGGLE_OVERLAY' }
		);
	} catch (error) {
		// Silently fail for keyboard shortcuts - no user feedback needed
	}
});



