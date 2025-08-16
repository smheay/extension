// Default profile data - shared across multiple functions to avoid duplication
const DEFAULT_GAME_SECTIONS = [
	{
		title: 'MXP Buffs',
		items: [
			{ label: 'HP', text: '!hp' },
			{ label: 'HPMax', text: '!hpmax' },
			{ label: 'AOE', text: '!aoe' },
			{ label: 'AOEMax', text: '!aoemax' },
			{ label: 'Regen', text: '!regen' },
			{ label: 'Attack Speed', text: '!attackspeed' },
			{ label: 'Respawn Speed', text: '!respawnspeed' },
			{ label: 'Gamble', text: '!gamble' },
			{ label: 'Speed', text: '!speed' },
			{ label: 'Aggro', text: '!aggro' }
		]
	},
	{
		title: 'Evolutions',
		items: [
			{ label: 'Evolve Woodland Joe', text: '!evolvewoodlandjoe' },
			{ label: 'Evolve Succubus', text: '!evolvesuccubus' }
		]
	},
	{
		title: 'Basic Commands',
		items: [
			{ label: 'Explode', text: '!explode' },
			{ label: 'Fart', text: '!fart' },
			{ label: 'Boost', text: '!boost' }
		]
	},
	{
		title: 'Voting',
		items: [
			{ label: 'Vote 1', text: '!vote1' },
			{ label: 'Vote 2', text: '!vote2' },
			{ label: 'Vote 3', text: '!vote3' }
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

// Seed profiles on first install only, using the sections-first schema
chrome.runtime.onInstalled.addListener(async () => {
	const { tqcProfiles } = await chrome.storage.sync.get(["tqcProfiles"]);
	if (tqcProfiles && typeof tqcProfiles === 'object') return;
	
	const seedProfiles = {
		default: createDefaultGameProfile(),
		emotes: createEmotesProfile()
	};
	
	await chrome.storage.sync.set({ tqcProfiles: seedProfiles, tqcActiveProfileId: 'default' });
});

async function ensureProfiles() {
	// Disabled - only seed profiles on fresh install via onInstalled listener
	return;
}

// Function to completely clean and reset profiles to eliminate duplicates
async function cleanResetProfiles() {
	const cleanProfiles = {
		default: createDefaultGameProfile(),
		emotes: createEmotesProfile()
	};
	
	await chrome.storage.sync.set({ 
		tqcProfiles: cleanProfiles, 
		tqcActiveProfileId: 'default' 
	});
}

chrome.runtime.onInstalled.addListener(async (details) => {
	// Only setup profiles on fresh install, not on updates
	if (details.reason === 'install') {
		await ensureProfiles();
	}
});

// Handle all messages - consolidated single listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Handle complete profile cleanup
	if (message && message.type === 'CLEAN_RESET_PROFILES') {
		(async () => {
			try {
				await cleanResetProfiles();
				sendResponse({ ok: true });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}
	
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



