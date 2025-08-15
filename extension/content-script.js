(function () {
	function queryAllDeep(root, selectors) {
		const results = [];
		const queue = [root];
		while (queue.length) {
			const node = queue.shift();
			if (!node) continue;
			for (const sel of selectors) {
				try {
					const found = node.querySelectorAll ? node.querySelectorAll(sel) : [];
					for (const el of found) results.push(el);
				} catch {}
			}
			// Shadow DOM
			if (node.shadowRoot) queue.push(node.shadowRoot);
			// Child elements
			if (node.children) {
				for (const child of node.children) queue.push(child);
			}
			// Same-origin iframes
			if (node.tagName === 'IFRAME') {
				try {
					const doc = node.contentDocument;
					if (doc) queue.push(doc);
				} catch {}
			}
		}
		return results;
	}

	function findTwitchChatInput() {
		const selectors = [
			'textarea[data-a-target="chat-input"]',
			'[data-a-target="chat-input"] textarea',
			'div[contenteditable="true"][data-a-target="chat-input"]',
			'[data-a-target="chat-input"] div[contenteditable="true"]',
			'[data-a-target="chat-message-input"] textarea',
			'div.chat-input__textarea textarea',
			'div[role="textbox"][contenteditable="true"]'
		];
		const all = queryAllDeep(document, selectors).filter(el => {
			const rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		});
		return all[0] || null;
	}

	function setNativeValue(element, value) {
		if (element.isContentEditable) {
			element.focus();
			// Select all existing content inside the editor
			const range = document.createRange();
			range.selectNodeContents(element);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
			// Clear via beforeinput delete
			try {
				const delEv = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' });
				element.dispatchEvent(delEv);
				element.dispatchEvent(new InputEvent('input', { bubbles: true }));
				// Insert full text in one operation so Slate sets value correctly
				const pasteEv = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: String(value) });
				element.dispatchEvent(pasteEv);
				element.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value) }));
			} catch {
				// Fallback: type characters one by one
				for (const ch of String(value)) {
					const ev = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch });
					element.dispatchEvent(ev);
					element.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch }));
				}
			}
			return;
		}
		const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
		const prototype = Object.getPrototypeOf(element);
		const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
		if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
			prototypeValueSetter.call(element, value);
		} else if (valueSetter) {
			valueSetter.call(element, value);
		} else {
			element.value = value;
		}
		element.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function clickActivateContainer(inputEl) {
		let node = inputEl;
		for (let i = 0; i < 4 && node; i++) {
			const container = node.closest ? node.closest('[data-a-target="chat-input"]') : null;
			if (container) {
				container.click();
				return;
			}
			node = node.parentElement;
		}
		// Generic click on input itself
		inputEl.click();
	}

	function findNearbySendButton(start) {
		let node = start;
		for (let i = 0; i < 5 && node; i++) {
			const btn = node.querySelector ? node.querySelector('[data-a-target="chat-send-button"]') : null;
			if (btn) return btn;
			node = node.parentElement;
		}
		return document.querySelector('[data-a-target="chat-send-button"]');
	}

	async function waitForChatInput(timeoutMs) {
		const start = Date.now();
		let el = findTwitchChatInput();
		while (!el && Date.now() - start < timeoutMs) {
			await new Promise(r => setTimeout(r, 200));
			el = findTwitchChatInput();
		}
		return el;
	}

	function getInputCurrentText(input) {
		return input.isContentEditable ? (input.textContent || "") : (input.value || "");
	}

	async function waitUntilInputEquals(input, expected, timeoutMs) {
		const start = Date.now();
		let current = getInputCurrentText(input);
		while (current !== expected && Date.now() - start < timeoutMs) {
			await new Promise(r => setTimeout(r, 50));
			current = getInputCurrentText(input);
		}
		return current === expected;
	}

	function isExtensionAlive() {
		try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch { return false; }
	}

	async function safeSyncGet(keys) {
		try {
			if (!isExtensionAlive()) return {};
			return await chrome.storage.sync.get(keys);
		} catch {
			return {};
		}
	}

	async function safeSyncSet(obj) {
		try {
			if (!isExtensionAlive()) return;
			await chrome.storage.sync.set(obj);
		} catch {}
	}

	async function safeLocalGet(keys) {
		try {
			if (!isExtensionAlive()) return {};
			return await chrome.storage.local.get(keys);
		} catch {
			return {};
		}
	}

	async function safeLocalSet(obj) {
		try {
			if (!isExtensionAlive()) return;
			await chrome.storage.local.set(obj);
		} catch {}
	}

	async function sendChatMessage(text) {
		const input = await waitForChatInput(2000);
		if (!input) {
			return { ok: false, error: 'Chat input not found' };
		}
		clickActivateContainer(input);
		input.focus();
		setNativeValue(input, text);
		// Give Slate/React a moment to sync, then send with one click
		await new Promise(r => setTimeout(r, 150));
		// Prefer clicking the Chat/Send button to avoid duplicate sends.
		let sendBtn = findNearbySendButton(input) || document.querySelector('button[aria-label="Chat"],button[aria-label="Send message"],button[type="submit"],button[data-a-target="chat-send-button"]');
		if (sendBtn) {
			try { sendBtn.click(); } catch {}
		}
		// Fallback to Enter in case the click did not submit
		if (!sendBtn) {
			const keydown = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
			const keypress = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
			const keyup = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
			input.dispatchEvent(keydown);
			input.dispatchEvent(keypress);
			input.dispatchEvent(keyup);
		}
		return { ok: true };
	}

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message && message.type === 'TWITCH_INSERT_AND_SEND') {
			(async () => {
				const result = await sendChatMessage(message.text || '');
				sendResponse(result);
			})();
			return true;
		}

		if (message && message.type === 'TQC_TOGGLE_OVERLAY') {
			toggleOverlay();
			sendResponse && sendResponse({ ok: true });
			return true;
		}
	});

	// ---------------------------
	// Floating overlay (movable panel)
	// ---------------------------
	let overlayRoot = null;
	let overlayMove = { dragging: false, offsetX: 0, offsetY: 0 };

	async function loadActiveProfile() {
		const { tqcProfiles, tqcActiveProfileId } = await safeSyncGet(['tqcProfiles', 'tqcActiveProfileId']);
		if (tqcProfiles && tqcActiveProfileId && tqcProfiles[tqcActiveProfileId]) {
			const prof = tqcProfiles[tqcActiveProfileId];
			return {
				id: tqcActiveProfileId,
				name: prof.name || 'Default',
				sections: Array.isArray(prof.sections) ? prof.sections : []
			};
		}
		return { id: 'default', name: 'Default', sections: [] };
	}

	async function loadCommands() {
		const p = await loadActiveProfile();
		return []; // Commands are now organized in sections, not as a flat list
	}

	async function loadOverlayPosition() {
		// Prefer local storage to avoid sync write quotas; fall back to legacy sync key
		const local = await safeLocalGet('tqcOverlayPos');
		if (local && local.tqcOverlayPos) return local.tqcOverlayPos;
		const sync = await safeSyncGet('tqcOverlayPos');
		return sync.tqcOverlayPos || { top: 80, left: 20 };
	}

	async function saveOverlayPosition(pos) { await safeLocalSet({ tqcOverlayPos: pos }); }

	function ensureStyles(root) {
		if (root.querySelector('#tqc-style')) return;
		const style = document.createElement('style');
		style.id = 'tqc-style';
		style.textContent = `
			.tqc-overlay{position:fixed;z-index:2147483646;background:#111827cc;color:#e5e7eb;border:1px solid #374151;border-radius:8px;backdrop-filter:saturate(120%) blur(2px);box-shadow:0 6px 20px rgba(0,0,0,.45);width:320px;}
			.tqc-header{cursor:move;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#0b1220cc;border-bottom:1px solid #374151;border-top-left-radius:8px;border-top-right-radius:8px;user-select:none}
			.tqc-title{font-size:13px;margin:0;display:flex;gap:8px;align-items:center}
			.tqc-select{border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px}
			.tqc-body{padding:10px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-height:50vh;overflow:auto}
			.tqc-btn{border:1px solid #374151;border-radius:6px;background:#111827;color:#e5e7eb;padding:8px 10px;font-size:12px;text-align:center;cursor:pointer}
			.tqc-btn:hover{background:#0f172acc}
			.tqc-close{background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:14px}
			.tqc-section-title{grid-column:1/-1 !important;font-size:11px;color:#9ca3af;margin:4px 0 0 0;text-transform:uppercase;letter-spacing:.04em}
		`;
		root.appendChild(style);
	}

	async function createOverlay() {
		if (overlayRoot && document.body.contains(overlayRoot)) return overlayRoot;
		const container = document.createElement('div');
		container.className = 'tqc-overlay';
		container.id = 'tqc-overlay';
		ensureStyles(document.head || document.documentElement);

		const header = document.createElement('div');
		header.className = 'tqc-header';
		const title = document.createElement('div');
		title.className = 'tqc-title';
		const titleText = document.createElement('span');
		titleText.textContent = 'Quick Commands';
		const profileSelect = document.createElement('select');
		profileSelect.className = 'tqc-select';
		profileSelect.title = 'Switch list';
		title.appendChild(titleText);
		title.appendChild(profileSelect);
		const close = document.createElement('button');
		close.className = 'tqc-close';
		close.textContent = '✕';
		header.appendChild(title);
		header.appendChild(close);

		const body = document.createElement('div');
		body.className = 'tqc-body';

		container.appendChild(header);
		container.appendChild(body);
		document.body.appendChild(container);
		overlayRoot = container;

		// Dragging
		header.addEventListener('mousedown', (e) => {
			// Don't start dragging when interacting with controls in the header
			const target = e.target;
			if (target && target.closest && target.closest('select,button')) {
				return;
			}
			overlayMove.dragging = true;
			const rect = container.getBoundingClientRect();
			overlayMove.offsetX = e.clientX - rect.left;
			overlayMove.offsetY = e.clientY - rect.top;
			e.preventDefault();
		});
		let lastPos = null;
		window.addEventListener('mousemove', (e) => {
			if (!overlayMove.dragging) return;
			const top = Math.max(0, e.clientY - overlayMove.offsetY);
			const left = Math.max(0, e.clientX - overlayMove.offsetX);
			container.style.top = top + 'px';
			container.style.left = left + 'px';
			lastPos = { top, left };
		});
		window.addEventListener('mouseup', async () => {
			overlayMove.dragging = false;
			if (lastPos) { await saveOverlayPosition(lastPos); }
		});

		close.addEventListener('click', () => { container.style.display = 'none'; });

		// Position
		const pos = await loadOverlayPosition();
		container.style.top = pos.top + 'px';
		container.style.left = pos.left + 'px';

		let isUpdatingProfile = false; // Flag to prevent double-rendering during profile changes

		async function hydrateProfileSelect() {
			const { tqcProfiles, tqcActiveProfileId } = await safeSyncGet(['tqcProfiles','tqcActiveProfileId']);
			const profiles = tqcProfiles || {}; const activeId = tqcActiveProfileId || 'default';
			profileSelect.innerHTML = '';
			Object.entries(profiles).forEach(([id, prof]) => {
				const opt = document.createElement('option');
				opt.value = id; opt.textContent = prof?.name || id; if (id === activeId) opt.selected = true;
				profileSelect.appendChild(opt);
			});
			profileSelect.onchange = async () => {
				isUpdatingProfile = true; // Set flag to prevent storage listener from also rendering
				await safeSyncSet({ tqcActiveProfileId: profileSelect.value });
				// Rebuild the body container to avoid duplicate children after rerender
				body.textContent = '';
				await render();
				// Reset flag after a brief delay to ensure storage listener doesn't fire
				setTimeout(() => { isUpdatingProfile = false; }, 100);
			};
		}

		// Render commands and sections
		async function render() {
			const cmds = await loadCommands();
			body.innerHTML = '';

			// Per-profile sections: render any profile-defined sections; remaining commands go to Other
			const active = await loadActiveProfile();
			const seenTitles = new Set();
			let sections = (Array.isArray(active?.sections) ? active.sections : []).filter(sec => {
				const title = (sec?.title || 'Section').trim();
				if (seenTitles.has(title.toLowerCase())) return false; // de-dupe same title
				seenTitles.add(title.toLowerCase());
				return true;
			});

			const toKey = (s) => String(s || '').trim().toLowerCase();
			// Render sections with their items only (no implicit Other)
			
			sections.forEach(sec => {
				const title = (sec.title || 'Section').trim();
				const items = Array.isArray(sec.items) ? sec.items : [];
				
				if (items.length === 0) return;
				
				const headerEl = document.createElement('div');
				headerEl.className = 'tqc-section-title';
				headerEl.textContent = title;
				body.appendChild(headerEl);
				
				const spacer = document.createElement('div');
				spacer.style.gridColumn = '1/-1';
				spacer.style.height = '4px';
				body.appendChild(spacer);

				items.forEach(item => {
					const btn = document.createElement('button');
					btn.className = 'tqc-btn';
					btn.textContent = item.label || item.text || '(unnamed)';
					btn.addEventListener('click', async () => {
						await sendChatMessage(item.text || '');
					});
					body.appendChild(btn);
				});
			});

			// If nothing was rendered at all, show helper
			if (body.children.length === 0) {
				const empty = document.createElement('div');
				empty.style.gridColumn = '1 / -1';
				empty.style.color = '#9ca3af';
				empty.style.fontSize = '12px';
				empty.textContent = 'No commands. Use extension options.';
				body.appendChild(empty);
			}
		}
		await hydrateProfileSelect();
		await render();
		
		chrome.storage.onChanged.addListener(async (changes, area) => {
			if (area === 'sync' && (changes.tqcProfiles || changes.tqcActiveProfileId)) {
				if (!isUpdatingProfile) {
					await hydrateProfileSelect();
					body.innerHTML = ''; // Clear before re-rendering
					await render();
				}
				return;
			}
			if (area === 'sync' && changes.quickCommands) {
				body.innerHTML = ''; // Clear before re-rendering
				await render();
			}
		});

		return container;
	}

	async function toggleOverlay() {
		// If not present, create and show immediately
		if (!overlayRoot || !document.body.contains(overlayRoot)) {
			const node = await createOverlay();
			node.style.display = 'block';
			node.style.zIndex = '2147483646';
			return;
		}
		const node = overlayRoot;
		const hidden = node.style.display === 'none' || getComputedStyle(node).display === 'none';
		node.style.display = hidden ? 'block' : 'none';
		if (hidden) node.style.zIndex = '2147483646';
	}
})();


