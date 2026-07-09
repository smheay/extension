(function () {
	const KEYS = {
		profiles: 'tqcProfiles',
		activeProfileId: 'tqcActiveProfileId',
		overlayPos: 'tqcOverlayPos'
	};

	const LIMITS = {
		sectionTitle: 100,
		commandLabel: 50,
		commandText: 500
	};

	function createDefaultProfile(name = 'Default') {
		return { name, sections: [] };
	}

	function validateSectionTitle(title, existingSections = []) {
		const trimmed = (title || '').trim();
		if (!trimmed) {
			return { ok: false, error: 'Section title is required' };
		}
		if (trimmed.length > LIMITS.sectionTitle) {
			return { ok: false, error: `Section title too long (max ${LIMITS.sectionTitle} characters)` };
		}
		if (existingSections.some((section) => section.title?.toLowerCase() === trimmed.toLowerCase())) {
			return { ok: false, error: 'Section name already exists' };
		}
		return { ok: true, value: trimmed };
	}

	function validateCommand(label, text, sectionItems = []) {
		const trimmedLabel = (label || '').trim();
		const trimmedText = (text || '').trim();
		if (!trimmedLabel) {
			return { ok: false, error: 'Command label is required' };
		}
		if (!trimmedText) {
			return { ok: false, error: 'Command text is required' };
		}
		if (trimmedLabel.length > LIMITS.commandLabel) {
			return { ok: false, error: `Command label too long (max ${LIMITS.commandLabel} characters)` };
		}
		if (trimmedText.length > LIMITS.commandText) {
			return { ok: false, error: `Command text too long (max ${LIMITS.commandText} characters)` };
		}
		if (sectionItems.some((item) => item.label?.toLowerCase() === trimmedLabel.toLowerCase())) {
			return { ok: false, error: 'Command label already exists in this section' };
		}
		return { ok: true, value: { label: trimmedLabel, text: trimmedText } };
	}

	async function loadProfiles() {
		const stored = await chrome.storage.sync.get([KEYS.profiles, KEYS.activeProfileId]);
		let profiles = stored[KEYS.profiles] || {};
		let activeId = stored[KEYS.activeProfileId];

		if (Object.keys(profiles).length === 0) {
			await new Promise((resolve) => {
				chrome.runtime.sendMessage({ type: 'SEED_DEFAULT_PROFILES' }, () => resolve());
			});
			const seeded = await chrome.storage.sync.get([KEYS.profiles, KEYS.activeProfileId]);
			return {
				profiles: seeded[KEYS.profiles] || {},
				activeId: seeded[KEYS.activeProfileId] || 'default'
			};
		}

		if (!activeId) {
			activeId = Object.keys(profiles)[0];
			await chrome.storage.sync.set({
				[KEYS.profiles]: profiles,
				[KEYS.activeProfileId]: activeId
			});
		}

		return { profiles, activeId };
	}

	async function saveProfiles(profiles, activeId) {
		await chrome.storage.sync.set({
			[KEYS.profiles]: profiles,
			[KEYS.activeProfileId]: activeId
		});
	}

	window.TqcStorage = {
		KEYS,
		LIMITS,
		createDefaultProfile,
		validateSectionTitle,
		validateCommand,
		loadProfiles,
		saveProfiles
	};
})();
