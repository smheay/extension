// Default profile data - shared across multiple functions to avoid duplication
const DEFAULT_GAME_SECTIONS = [
	{
		title: 'Core Commands',
		items: [
			{ label: 'Fart (60s cd)', text: '!fart' },
			{ label: 'Join', text: '!join' },
			{ label: 'Spawn (10s cd)', text: '!spawn' },
			{ label: 'Flee (60s cd)', text: '!flee' }
		]
	},
	{
		title: 'MXP Buffs',
		items: [
			{ label: 'AOE (1)', text: '!aoe' },
			{ label: 'AOE Max', text: '!aoemax' },
			{ label: 'DMG (1)', text: '!dmg' },
			{ label: 'DMG Max', text: '!dmgmax' },
			{ label: 'HP (1)', text: '!hp' },
			{ label: 'HP Max', text: '!hpmax' },
			{ label: 'Speed (1)', text: '!speed' },
			{ label: 'Speed Max', text: '!speedmax' }
		]
	},
	{
		title: 'Upgrades',
		items: [
			{ label: 'Boost (0)', text: '!boost' },
			{ label: 'Unlock Boost (10)', text: '!unlockboost' },
			{ label: 'Explode (0)', text: '!explode' },
			{ label: 'Unlock Explode (15)', text: '!unlockexplode' },
			{ label: 'Invulnerability (0)', text: '!invulnerability' },
			{ label: 'Unlock Invulnerability (25)', text: '!unlockinvulnerability' }
		]
	},
	{
		title: 'Evolves Commands',
		items: [
			{ label: 'Evolve Kevin (15)', text: '!evolvekevin' },
			{ label: 'Evolve Succubus (25)', text: '!evolvesuccubus' },
			{ label: 'Evolve Woodland Joe (10)', text: '!evolvewoodlandjoe' }
		]
	},	{
		title: 'Boss Vote',
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

function resetProfileToGameDefaults(existingProfile = {}) {
	const defaults = createDefaultGameProfile();
	return {
		name: existingProfile.name || defaults.name,
		sections: defaults.sections
	};
}

function resetProfileToEmoteDefaults(existingProfile = {}) {
	const defaults = createEmotesProfile();
	return {
		name: existingProfile.name || defaults.name,
		sections: defaults.sections
	};
}

function createSeedProfiles() {
	return {
		default: createDefaultGameProfile(),
		emotes: createEmotesProfile()
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
		// Content script not loaded, try to inject it (main frame only; guard prevents double init)
		try {
			await chrome.scripting.executeScript({
				target: { tabId: tabId, frameIds: [0] },
				files: ["tqc-storage.js"]
			});
			await chrome.scripting.executeScript({
				target: { tabId: tabId, frameIds: [0] },
				files: ["page-bridge.js"],
				world: "MAIN"
			});
			await chrome.scripting.executeScript({
				target: { tabId: tabId, frameIds: [0] },
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
		await chrome.storage.sync.set({
			tqcProfiles: createSeedProfiles(),
			tqcActiveProfileId: 'default'
		});
		return;
	}

	if (details.reason === 'update') {
		const { tqcProfiles, tqcActiveProfileId } = await chrome.storage.sync.get(['tqcProfiles', 'tqcActiveProfileId']);
		const profiles = tqcProfiles || {};
		profiles.default = resetProfileToGameDefaults(profiles.default || {});
		await chrome.storage.sync.set({
			tqcProfiles: profiles,
			tqcActiveProfileId: tqcActiveProfileId || 'default'
		});
	}
});

// Handle all messages - consolidated single listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message && message.type === 'SEED_DEFAULT_PROFILES') {
		(async () => {
			try {
				await chrome.storage.sync.set({
					tqcProfiles: createSeedProfiles(),
					tqcActiveProfileId: 'default'
				});
				sendResponse({ ok: true });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}

	if (message && message.type === 'RESET_PROFILE_TO_DEFAULTS') {
		(async () => {
			try {
				const { tqcProfiles, tqcActiveProfileId } = await chrome.storage.sync.get(['tqcProfiles', 'tqcActiveProfileId']);
				const profiles = tqcProfiles || {};
				const profileId = message.profileId || tqcActiveProfileId || 'default';
				const existing = profiles[profileId] || {};
				const resetKind = message.resetKind;

				if (resetKind === 'game') {
					profiles[profileId] = resetProfileToGameDefaults(existing);
				} else if (resetKind === 'emotes') {
					profiles[profileId] = resetProfileToEmoteDefaults(existing);
				} else {
					profiles[profileId] = { name: existing.name || 'Profile', sections: [] };
				}

				await chrome.storage.sync.set({ tqcProfiles: profiles, tqcActiveProfileId: profileId });
				sendResponse({ ok: true });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}

	if (message && message.type === 'TQC_TOGGLE_OVERLAY_FROM_POPUP') {
		(async () => {
			try {
				const result = await toggleOverlayOnActiveTwitchTab();
				sendResponse(result);
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true;
	}
	
	return false;
});

async function toggleOverlayOnActiveTwitchTab() {
	const tabResult = await getActiveTwitchTab();
	if (tabResult.error) {
		return { ok: false, error: tabResult.error };
	}

	return ensureContentScriptAndSendMessage(
		tabResult.tab.id,
		{ type: 'TQC_TOGGLE_OVERLAY' }
	);
}

chrome.commands?.onCommand.addListener(async (command) => {
	if (command !== 'toggle-overlay') return;
	await toggleOverlayOnActiveTwitchTab();
});



