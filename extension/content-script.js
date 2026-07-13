(function () {
	if (window.__tqcContentScriptLoaded) {
		return;
	}
	window.__tqcContentScriptLoaded = true;

	// Constants for timing and behavior
	const COMMAND_RELEASE_DELAY_MS = 100; // Delay before releasing command lock
	const SPAM_FEEDBACK_DURATION_MS = 300; // Duration to show spam protection feedback
	
	// Profile and overlay constants
	const PROFILE_UPDATE_RESET_DELAY_MS = 100; // Delay to reset profile update flag
	const COMMAND_COOLDOWN_MS = 750; // Prevent spam clicking commands
	
	// Global command cooldown - blocks ALL commands during cooldown
	let lastCommandTime = 0;
	let isCommandInProgress = false;

	const PAGE_BRIDGE_TIMEOUT_MS = 3000;
	const BRIDGE_TOKEN_ATTR = 'data-tqc-bridge-token';

	function getPageBridgeToken() {
		return document.documentElement.getAttribute(BRIDGE_TOKEN_ATTR);
	}

	function waitForPageBridgeToken(timeoutMs = PAGE_BRIDGE_TIMEOUT_MS) {
		return new Promise((resolve) => {
			const existing = getPageBridgeToken();
			if (existing) {
				resolve(existing);
				return;
			}

			const observer = new MutationObserver(() => {
				const token = getPageBridgeToken();
				if (token) {
					observer.disconnect();
					clearTimeout(timeout);
					resolve(token);
				}
			});
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: [BRIDGE_TOKEN_ATTR]
			});

			const timeout = setTimeout(() => {
				observer.disconnect();
				resolve(getPageBridgeToken());
			}, timeoutMs);
		});
	}

	async function sendChatMessageViaPageBridge(text) {
		const bridgeToken = await waitForPageBridgeToken();
		if (!bridgeToken) {
			return { ok: false, error: 'Chat bridge not ready' };
		}

		return postBridgeRequest('TQC_SEND_CHAT', 'TQC_CHAT_RESULT', { text }, bridgeToken);
	}

	async function placePredictionViaPageBridge(side, points) {
		const bridgeToken = await waitForPageBridgeToken();
		if (!bridgeToken) {
			return { ok: false, error: 'Chat bridge not ready' };
		}

		return postBridgeRequest('TQC_PLACE_PREDICTION', 'TQC_PREDICTION_RESULT', { side, points }, bridgeToken);
	}

	function postBridgeRequest(requestType, resultType, payload, bridgeToken) {
		return new Promise((resolve) => {
			const requestId = `${Date.now()}-${Math.random()}`;
			const timeout = setTimeout(() => {
				window.removeEventListener('message', handler);
				resolve({ ok: false, error: 'Request timed out' });
			}, PAGE_BRIDGE_TIMEOUT_MS);

			function handler(event) {
				if (
					event.source !== window ||
					event.origin !== window.location.origin ||
					event.data?.type !== resultType ||
					event.data?.requestId !== requestId ||
					event.data?.token !== bridgeToken
				) {
					return;
				}
				clearTimeout(timeout);
				window.removeEventListener('message', handler);
				resolve({
					ok: !!event.data.ok,
					error: event.data.error
				});
			}

			window.addEventListener('message', handler);
			window.postMessage({ type: requestType, requestId, token: bridgeToken, ...payload }, window.location.origin);
		});
	}

	function isExtensionAlive() {
		try { 
			return !!(chrome && chrome.runtime && chrome.runtime.id); 
		} catch (e) { 
			return false; 
		}
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
			if (!isExtensionAlive()) return { ok: false, error: 'Extension context invalidated' };
			await chrome.storage.sync.set(obj);
			return { ok: true };
		} catch (e) {
			return { ok: false, error: e.message || 'Failed to save' };
		}
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
		} catch (e) {}
	}

	async function sendChatMessage(text) {
		if (!text || typeof text !== 'string') {
			return { ok: false, error: 'Invalid text parameter' };
		}

		const prediction = window.TqcStorage.parsePredictionCommand(text);
		if (prediction) {
			return placePredictionViaPageBridge(prediction.side, prediction.points);
		}

		return sendChatMessageViaPageBridge(text);
	}

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message && message.type === 'TQC_TOGGLE_OVERLAY') {
			try {
				toggleOverlay();
				sendResponse && sendResponse({ ok: true });
			} catch (error) {
				sendResponse && sendResponse({ ok: false, error: error.message });
			}
			return true;
		}
	});

	// ---------------------------
	// Floating overlay (movable panel)
	// ---------------------------
	let overlayRoot = null;
	let overlayMove = { dragging: false, offsetX: 0, offsetY: 0 };
	let overlayResize = { active: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 };
	let overlayController = null;

	chrome.storage.onChanged.addListener(async (changes, area) => {
		const keys = window.TqcStorage.KEYS;
		if (area !== 'sync' || !(changes[keys.profiles] || changes[keys.activeProfileId])) {
			return;
		}
		if (!overlayController || !document.body.contains(overlayRoot)) {
			return;
		}
		if (overlayController.isUpdatingProfile || overlayController.isRendering) {
			return;
		}
		await overlayController.hydrateProfileSelect();
		await overlayController.render();
	});

	async function loadActiveProfile() {
		const keys = window.TqcStorage.KEYS;
		const stored = await safeSyncGet([keys.profiles, keys.activeProfileId]);
		const tqcProfiles = stored[keys.profiles];
		const tqcActiveProfileId = stored[keys.activeProfileId];
		
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

	const OVERLAY_DEFAULTS = { top: 80, left: 20, width: 320, height: null };
	const OVERLAY_MIN_WIDTH = 240;
	const OVERLAY_MIN_HEIGHT = 180;
	const OVERLAY_HEADER_HEIGHT = 44;

	async function loadOverlayLayout() {
		const keys = window.TqcStorage.KEYS;
		const local = await safeLocalGet(keys.overlayPos);
		const saved = local && local[keys.overlayPos] ? local[keys.overlayPos] : {};
		return {
			top: Number.isFinite(saved.top) ? saved.top : OVERLAY_DEFAULTS.top,
			left: Number.isFinite(saved.left) ? saved.left : OVERLAY_DEFAULTS.left,
			width: Number.isFinite(saved.width) ? saved.width : OVERLAY_DEFAULTS.width,
			height: Number.isFinite(saved.height) ? saved.height : OVERLAY_DEFAULTS.height
		};
	}

	async function saveOverlayLayout(layout) {
		const keys = window.TqcStorage.KEYS;
		const current = await loadOverlayLayout();
		await safeLocalSet({
			[keys.overlayPos]: {
				top: Number.isFinite(layout.top) ? layout.top : current.top,
				left: Number.isFinite(layout.left) ? layout.left : current.left,
				width: Number.isFinite(layout.width) ? layout.width : current.width,
				height: Number.isFinite(layout.height) ? layout.height : current.height
			}
		});
	}

	function ensureStyles(root) {
		// Remove existing styles
		const oldStyle = root.querySelector('#tqc-style');
		if (oldStyle) oldStyle.remove();
		
		const style = document.createElement('style');
		style.id = 'tqc-style';
		style.textContent = `
			.tqc-overlay{position:fixed;z-index:2147483646;background:#111827cc;color:#e5e7eb;border:1px solid #374151;border-radius:8px;backdrop-filter:saturate(120%) blur(2px);box-shadow:0 6px 20px rgba(0,0,0,.45);width:320px;height:auto;min-width:${OVERLAY_MIN_WIDTH}px;min-height:${OVERLAY_MIN_HEIGHT}px;max-width:90vw;max-height:90vh;overflow:hidden;box-sizing:border-box;}
			.tqc-header{position:absolute;top:0;left:0;right:0;height:${OVERLAY_HEADER_HEIGHT}px;box-sizing:border-box;cursor:move;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#0b1220cc;border-bottom:1px solid #374151;border-top-left-radius:8px;border-top-right-radius:8px;user-select:none;z-index:2}
			.tqc-title{font-size:13px;margin:0;display:flex;gap:8px;align-items:center;min-width:0;flex:1}
			.tqc-select{border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px;max-width:100%;min-width:0}
			.tqc-scroll{position:absolute;top:${OVERLAY_HEADER_HEIGHT}px;left:0;right:0;bottom:0;overflow-x:hidden !important;overflow-y:scroll !important;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;z-index:1}
			.tqc-body{padding:6px 8px 12px 8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;align-content:start;min-height:min-content}
			.tqc-btn{border:1px solid #374151;border-radius:6px;background:#111827;color:#e5e7eb;padding:4px 6px;font-size:11px;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:40px;min-height:40px;max-height:40px;overflow:hidden;transition:background 0.2s ease,opacity 0.2s ease,transform 0.2s ease}
			.tqc-btn:hover{background:#0f172acc}
			.tqc-btn > span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-overflow:ellipsis;line-height:1.15;max-width:100%;word-break:break-word}
			.tqc-close{background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:14px;flex-shrink:0}
			.tqc-section-title{grid-column:1/-1 !important;font-size:11px;color:#9ca3af;margin:2px 0 0 0;padding:0;text-transform:uppercase;letter-spacing:.04em;display:flex;justify-content:space-between;align-items:center;gap:6px}
			.tqc-section-actions{display:flex;align-items:center;gap:3px;flex-shrink:0}
			.tqc-section-add,.tqc-section-del{border:none !important;border-radius:3px;width:14px !important;height:14px !important;font-size:10px;cursor:pointer;font-weight:bold;position:relative !important;padding:0 !important;margin:0 !important;box-sizing:border-box !important;display:flex !important;align-items:center;justify-content:center;line-height:1;color:#fff !important}
			.tqc-section-add{background:#16a34a !important}
			.tqc-section-add:hover{background:#15803d}
			.tqc-section-del{background:#7f1d1d !important}
			.tqc-section-del:hover{background:#991b1b}
			.tqc-add-form{grid-column:1/-1;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border:1px solid #334155;border-radius:8px;padding:12px;margin:6px 0;box-shadow:0 4px 12px rgba(0,0,0,0.15)}
			.tqc-add-input{background:#111827;border:1px solid #374151;border-radius:6px;color:#d1d5db;padding:8px 10px;font-size:12px;width:100%;margin:3px 0;box-sizing:border-box;transition:border-color 0.2s ease,box-shadow 0.2s ease}
			.tqc-add-input:focus{outline:none;border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,0.1)}
			.tqc-add-input::placeholder{color:#6b7280;font-style:italic}
			.tqc-add-buttons{display:flex;gap:8px;margin-top:10px;justify-content:flex-end}
			.tqc-add-btn{border:1px solid #374151;border-radius:6px;background:#374151;color:#d1d5db;padding:8px 16px;font-size:11px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;transition:all 0.2s ease;font-weight:500}
			.tqc-add-btn.save{background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);border-color:#15803d;color:#fff;box-shadow:0 2px 6px rgba(22,163,74,0.3)}
			.tqc-add-btn.danger{background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);border-color:#b91c1c;color:#fff;box-shadow:0 2px 6px rgba(220,38,38,0.3)}
			.tqc-add-btn:hover{transform:translateY(-1px);box-shadow:0 4px 8px rgba(0,0,0,0.3)}
			.tqc-add-btn.save:hover{box-shadow:0 4px 12px rgba(22,163,74,0.4)}
			.tqc-add-btn.danger:hover{box-shadow:0 4px 12px rgba(220,38,38,0.4)}
			.tqc-confirm-message{grid-column:1/-1;color:#e5e7eb;font-size:12px;margin:0 0 4px 0;line-height:1.4}
			.tqc-form-error{grid-column:1/-1;color:#fca5a5;font-size:11px;margin:4px 0 0 0}
			.tqc-toast{position:absolute;left:10px;right:10px;bottom:18px;z-index:4;background:#7f1d1d;color:#fecaca;border:1px solid #991b1b;border-radius:6px;padding:8px 10px;font-size:11px;text-align:center;pointer-events:none}
			.tqc-resize-handle{position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;z-index:3}
			.tqc-resize-handle::before{content:'';position:absolute;right:4px;bottom:4px;width:8px;height:8px;border-right:2px solid #6b7280;border-bottom:2px solid #6b7280;border-radius:1px;opacity:.85}
			.tqc-resize-handle:hover::before{border-color:#9ca3af}
			
			/* Custom scrollbar for overlay scroll area — !important beats Twitch global scrollbar hides */
			.tqc-scroll::-webkit-scrollbar{width:10px !important;height:10px !important;display:block !important;}
			.tqc-scroll::-webkit-scrollbar-track{background:#0b1220 !important;}
			.tqc-scroll::-webkit-scrollbar-thumb{background:#6b7280 !important;border-radius:5px !important;border:2px solid #0b1220 !important;}
			.tqc-scroll::-webkit-scrollbar-thumb:hover{background:#9ca3af !important;}
			.tqc-scroll{scrollbar-width:auto !important;scrollbar-color:#6b7280 #0b1220 !important;}
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
		const profileSelect = document.createElement('select');
		profileSelect.className = 'tqc-select';
		profileSelect.title = 'Switch list';
		title.appendChild(profileSelect);
		const addBtn = document.createElement('button');
		addBtn.className = 'tqc-close';
		addBtn.textContent = '+';
		addBtn.title = 'Add new section';
		addBtn.style.marginRight = '8px';
		addBtn.style.background = '#16a34a';
		addBtn.style.color = '#ffffff';
		addBtn.style.fontWeight = 'bold';
		addBtn.style.display = 'flex';
		addBtn.style.alignItems = 'center';
		addBtn.style.justifyContent = 'center';
		addBtn.style.width = '24px';
		addBtn.style.height = '24px';
		addBtn.style.lineHeight = '1';
		addBtn.style.padding = '0';
		addBtn.style.textAlign = 'center';
		addBtn.style.borderRadius = '4px';
		
		const close = document.createElement('button');
		close.className = 'tqc-close';
		close.textContent = '✕';
		header.appendChild(title);
		header.appendChild(addBtn);
		header.appendChild(close);

		const scrollArea = document.createElement('div');
		scrollArea.className = 'tqc-scroll';
		scrollArea.style.overflowY = 'scroll';
		scrollArea.style.position = 'absolute';
		scrollArea.style.top = OVERLAY_HEADER_HEIGHT + 'px';
		scrollArea.style.left = '0';
		scrollArea.style.right = '0';
		scrollArea.style.bottom = '0';

		const body = document.createElement('div');
		body.className = 'tqc-body';
		scrollArea.appendChild(body);

		const resizeHandle = document.createElement('div');
		resizeHandle.className = 'tqc-resize-handle';
		resizeHandle.title = 'Drag to resize';

		container.appendChild(header);
		container.appendChild(scrollArea);
		container.appendChild(resizeHandle);
		document.body.appendChild(container);
		overlayRoot = container;

		// Twitch steals wheel events for the page/player — scroll the panel ourselves.
		container.addEventListener('wheel', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const overScroll = scrollArea.contains(e.target) || e.target === scrollArea;
			if (!overScroll) return;
			const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
			scrollArea.scrollTop += delta;
		}, { passive: false, capture: true });

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

		resizeHandle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const rect = container.getBoundingClientRect();
			overlayResize.active = true;
			overlayResize.startX = e.clientX;
			overlayResize.startY = e.clientY;
			overlayResize.startWidth = rect.width;
			overlayResize.startHeight = rect.height;
		});

		let lastLayout = null;
		let heightLockedByUser = false;
		let toastTimer = null;

		function showOverlayToast(message) {
			const existing = container.querySelector('.tqc-toast');
			if (existing) existing.remove();
			if (toastTimer) {
				clearTimeout(toastTimer);
				toastTimer = null;
			}
			const toast = document.createElement('div');
			toast.className = 'tqc-toast';
			toast.textContent = message;
			container.appendChild(toast);
			toastTimer = setTimeout(() => {
				toast.remove();
				toastTimer = null;
			}, 2500);
		}

		function fitHeightToContent() {
			if (heightLockedByUser) return;
			const contentHeight = body.scrollHeight;
			const needed = OVERLAY_HEADER_HEIGHT + contentHeight;
			const maxHeight = Math.max(OVERLAY_MIN_HEIGHT, Math.floor(window.innerHeight * 0.9));
			const nextHeight = Math.min(maxHeight, Math.max(OVERLAY_MIN_HEIGHT, needed));
			container.style.height = nextHeight + 'px';
		}

		window.addEventListener('mousemove', (e) => {
			if (overlayResize.active) {
				const maxWidth = Math.max(OVERLAY_MIN_WIDTH, window.innerWidth * 0.9);
				const maxHeight = Math.max(OVERLAY_MIN_HEIGHT, window.innerHeight * 0.9);
				const width = Math.min(
					maxWidth,
					Math.max(OVERLAY_MIN_WIDTH, overlayResize.startWidth + (e.clientX - overlayResize.startX))
				);
				const height = Math.min(
					maxHeight,
					Math.max(OVERLAY_MIN_HEIGHT, overlayResize.startHeight + (e.clientY - overlayResize.startY))
				);
				container.style.width = width + 'px';
				container.style.height = height + 'px';
				heightLockedByUser = true;
				lastLayout = { width, height };
				return;
			}

			if (!overlayMove.dragging) return;
			const top = Math.max(0, e.clientY - overlayMove.offsetY);
			const left = Math.max(0, e.clientX - overlayMove.offsetX);
			container.style.top = top + 'px';
			container.style.left = left + 'px';
			lastLayout = { top, left };
		});
		window.addEventListener('mouseup', async () => {
			overlayMove.dragging = false;
			overlayResize.active = false;
			if (lastLayout) {
				await saveOverlayLayout(lastLayout);
				lastLayout = null;
			}
		});

		addBtn.addEventListener('click', () => {
			showAddSectionForm();
		});

		close.addEventListener('click', () => { container.style.display = 'none'; });

		// Position + size (height fits content unless user locked/saved a height)
		const layout = await loadOverlayLayout();
		container.style.top = layout.top + 'px';
		container.style.left = layout.left + 'px';
		container.style.width = layout.width + 'px';
		if (Number.isFinite(layout.height)) {
			container.style.height = layout.height + 'px';
			heightLockedByUser = true;
		}

		let isUpdatingProfile = false; // Flag to prevent double-rendering during profile changes

		async function hydrateProfileSelect() {
			const keys = window.TqcStorage.KEYS;
			const stored = await safeSyncGet([keys.profiles, keys.activeProfileId]);
			const profiles = stored[keys.profiles] || {};
			const activeId = stored[keys.activeProfileId] || 'default';
			profileSelect.innerHTML = '';
			Object.entries(profiles).forEach(([id, prof]) => {
				const opt = document.createElement('option');
				opt.value = id; opt.textContent = prof?.name || id; if (id === activeId) opt.selected = true;
				profileSelect.appendChild(opt);
			});
			profileSelect.onchange = async () => {
				isUpdatingProfile = true;
				heightLockedByUser = false;
				const saveResult = await safeSyncSet({ [keys.activeProfileId]: profileSelect.value });
				if (!saveResult.ok) {
					showOverlayToast(saveResult.error || 'Failed to save profile switch');
				}
		
				body.textContent = '';
				await render();

				setTimeout(() => { isUpdatingProfile = false; }, PROFILE_UPDATE_RESET_DELAY_MS);
			};
		}


		let isRendering = false; // Prevent multiple simultaneous renders
		
		async function render() {
			if (isRendering) {
				return;
			}
			
			isRendering = true;
			
			try {
				// Force clear the body completely
				while (body.firstChild) {
					body.removeChild(body.firstChild);
				}
				
				const active = await loadActiveProfile();

				const titleCounts = {};
				const sectionEntries = (Array.isArray(active?.sections) ? active.sections : [])
					.map((sec, originalIndex) => ({ sec, originalIndex }));

			sectionEntries.forEach(({ sec, originalIndex }) => {
				const baseTitle = (sec.title || 'Section').trim();
				const titleKey = baseTitle.toLowerCase();
				titleCounts[titleKey] = (titleCounts[titleKey] || 0) + 1;
				const title = titleCounts[titleKey] > 1
					? `${baseTitle} (${titleCounts[titleKey]})`
					: baseTitle;
				const items = Array.isArray(sec.items) ? sec.items : [];
				
				const headerEl = document.createElement('div');
				headerEl.className = 'tqc-section-title';
				headerEl.dataset.sectionIndex = String(originalIndex);
				
				const titleSpan = document.createElement('span');
				titleSpan.textContent = title;
				
				const actions = document.createElement('div');
				actions.className = 'tqc-section-actions';

				const addSectionBtn = document.createElement('button');
				addSectionBtn.className = 'tqc-section-add';
				addSectionBtn.textContent = '+';
				addSectionBtn.title = 'Add command to this section';
				addSectionBtn.addEventListener('click', () => showAddCommandForm(originalIndex));

				const deleteSectionBtn = document.createElement('button');
				deleteSectionBtn.className = 'tqc-section-del';
				deleteSectionBtn.textContent = '✕';
				deleteSectionBtn.title = 'Delete this section';
				deleteSectionBtn.addEventListener('click', () => {
					showDeleteSectionConfirm(originalIndex, baseTitle);
				});

				actions.appendChild(addSectionBtn);
				actions.appendChild(deleteSectionBtn);
				headerEl.appendChild(titleSpan);
				headerEl.appendChild(actions);
				body.appendChild(headerEl);
				
				const spacer = document.createElement('div');
				spacer.style.gridColumn = '1/-1';
				spacer.style.height = '1px';
				body.appendChild(spacer);

				items.forEach(item => {
					const btn = document.createElement('button');
					btn.className = 'tqc-btn';
					const labelText = item.label || item.text || '(unnamed)';
					const label = document.createElement('span');
					label.textContent = labelText;
					btn.appendChild(label);
					btn.title = labelText;
					btn.addEventListener('click', async () => {
						const now = Date.now();
						
						// GLOBAL spam protection - blocks ALL commands
						if (isCommandInProgress || (now - lastCommandTime < COMMAND_COOLDOWN_MS)) {
							// Show visual feedback that commands are blocked
							btn.style.opacity = '0.3';
							btn.style.transform = 'scale(0.95)';
							setTimeout(() => {
								btn.style.opacity = '1';
								btn.style.transform = 'scale(1)';
							}, SPAM_FEEDBACK_DURATION_MS);
							return;
						}
						
						// Lock ALL commands during execution
						isCommandInProgress = true;
						lastCommandTime = now;
						
						try {
							const result = await sendChatMessage(item.text || '');
							if (!result?.ok && result?.error) {
								btn.style.outline = '1px solid #f87171';
								btn.title = result.error;
								setTimeout(() => {
									btn.style.outline = '';
									btn.title = labelText;
								}, 2000);
							}
						} finally {
							// Release lock after command completes
							setTimeout(() => {
								isCommandInProgress = false;
							}, COMMAND_RELEASE_DELAY_MS);
						}
					});
					body.appendChild(btn);
				});
			});


				if (body.children.length === 0) {
					const empty = document.createElement('div');
					empty.style.gridColumn = '1 / -1';
					empty.style.color = '#9ca3af';
					empty.style.fontSize = '12px';
					empty.textContent = 'No commands. Use extension options.';
					body.appendChild(empty);
				}

				fitHeightToContent();
			} finally {
				isRendering = false;
			}
		}
		await hydrateProfileSelect();
		await render();

		overlayController = {
			get isUpdatingProfile() { return isUpdatingProfile; },
			get isRendering() { return isRendering; },
			hydrateProfileSelect,
			render
		};

		// Add form functions
		function showFormError(form, message) {
			let errorEl = form.querySelector('.tqc-form-error');
			if (!errorEl) {
				errorEl = document.createElement('div');
				errorEl.className = 'tqc-form-error';
				form.insertBefore(errorEl, form.querySelector('.tqc-add-buttons'));
			}
			errorEl.textContent = message;
		}

		function clearFormError(form) {
			const errorEl = form.querySelector('.tqc-form-error');
			if (errorEl) {
				errorEl.remove();
			}
		}

		function showDeleteSectionConfirm(sectionIndex, sectionTitle) {
			body.querySelectorAll('.tqc-add-form').forEach((f) => f.remove());

			const form = document.createElement('div');
			form.className = 'tqc-add-form';

			const message = document.createElement('div');
			message.className = 'tqc-confirm-message';
			message.textContent = `Delete section "${sectionTitle}" and all of its commands?`;

			const buttons = document.createElement('div');
			buttons.className = 'tqc-add-buttons';

			const confirmBtn = document.createElement('button');
			confirmBtn.className = 'tqc-add-btn danger';
			confirmBtn.textContent = 'Delete';

			const cancelBtn = document.createElement('button');
			cancelBtn.className = 'tqc-add-btn';
			cancelBtn.textContent = 'Cancel';

			buttons.appendChild(confirmBtn);
			buttons.appendChild(cancelBtn);
			form.appendChild(message);
			form.appendChild(buttons);

			const sectionHeader = body.querySelector(`.tqc-section-title[data-section-index="${sectionIndex}"]`);
			if (sectionHeader) {
				const spacer = sectionHeader.nextElementSibling;
				if (spacer) {
					spacer.insertAdjacentElement('afterend', form);
				} else {
					body.appendChild(form);
				}
			} else {
				body.insertBefore(form, body.firstChild);
			}

			confirmBtn.addEventListener('click', async () => {
				try {
					const active = await loadActiveProfile();
					const sections = Array.isArray(active?.sections) ? active.sections.slice() : [];
					if (sectionIndex < 0 || sectionIndex >= sections.length) {
						form.remove();
						return;
					}
					sections.splice(sectionIndex, 1);
					await saveProfileSections(sections);
					form.remove();
					await render();
				} catch (error) {
					showFormError(form, 'Failed to delete section');
				}
			});

			cancelBtn.addEventListener('click', () => form.remove());
			confirmBtn.focus();
		}

		function showAddSectionForm() {
			// Remove any existing forms
			body.querySelectorAll('.tqc-add-form').forEach(f => f.remove());
			
			const form = document.createElement('div');
			form.className = 'tqc-add-form';
			
			const titleInput = document.createElement('input');
			titleInput.className = 'tqc-add-input';
			titleInput.placeholder = 'Section title';
			titleInput.type = 'text';
			
			const buttons = document.createElement('div');
			buttons.className = 'tqc-add-buttons';
			
			const saveBtn = document.createElement('button');
			saveBtn.className = 'tqc-add-btn save';
			saveBtn.textContent = 'Add Section';
			
			const cancelBtn = document.createElement('button');
			cancelBtn.className = 'tqc-add-btn';
			cancelBtn.textContent = 'Cancel';
			
			buttons.appendChild(saveBtn);
			buttons.appendChild(cancelBtn);
			form.appendChild(titleInput);
			form.appendChild(buttons);
			
			// Insert at top of body
			body.insertBefore(form, body.firstChild);
			titleInput.focus();
			
			saveBtn.addEventListener('click', async () => {
				try {
					clearFormError(form);
					const active = await loadActiveProfile();
					const sections = Array.isArray(active?.sections) ? active.sections : [];
					const validation = window.TqcStorage.validateSectionTitle(titleInput.value, sections);
					if (!validation.ok) {
						showFormError(form, validation.error);
						titleInput.focus();
						return;
					}
					
					sections.push({ title: validation.value, items: [] });
					
					await saveProfileSections(sections);
					form.remove();
					await render();
				} catch (error) {
					showFormError(form, 'Failed to add section');
				}
			});
			
			cancelBtn.addEventListener('click', () => form.remove());
			titleInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') saveBtn.click();
				if (e.key === 'Escape') cancelBtn.click();
			});
		}
		
		function showAddCommandForm(sectionIndex) {
			// Remove any existing forms
			body.querySelectorAll('.tqc-add-form').forEach(f => f.remove());
			
			const form = document.createElement('div');
			form.className = 'tqc-add-form';
			
			const labelInput = document.createElement('input');
			labelInput.className = 'tqc-add-input';
			labelInput.placeholder = 'Command label (what shows on button)';
			labelInput.type = 'text';
			
			const textInput = document.createElement('input');
			textInput.className = 'tqc-add-input';
			textInput.placeholder = 'Command text (what gets sent to chat)';
			textInput.type = 'text';
			
			const buttons = document.createElement('div');
			buttons.className = 'tqc-add-buttons';
			
			const saveBtn = document.createElement('button');
			saveBtn.className = 'tqc-add-btn save';
			saveBtn.textContent = 'Add Command';
			
			const cancelBtn = document.createElement('button');
			cancelBtn.className = 'tqc-add-btn';
			cancelBtn.textContent = 'Cancel';
			
			buttons.appendChild(saveBtn);
			buttons.appendChild(cancelBtn);
			form.appendChild(labelInput);
			form.appendChild(textInput);
			form.appendChild(buttons);
			
			// Find section header by storage index and insert form after it
			const sectionHeader = body.querySelector(`.tqc-section-title[data-section-index="${sectionIndex}"]`);
			if (sectionHeader) {
				const spacer = sectionHeader.nextElementSibling;
				if (spacer) {
					spacer.insertAdjacentElement('afterend', form);
				} else {
					body.appendChild(form);
				}
			} else {
				body.appendChild(form);
			}
			
			labelInput.focus();
			
			saveBtn.addEventListener('click', async () => {
				try {
					clearFormError(form);
					const active = await loadActiveProfile();
					const sections = Array.isArray(active?.sections) ? active.sections : [];
					const sectionItems = sections[sectionIndex]?.items || [];
					const validation = window.TqcStorage.validateCommand(
						labelInput.value,
						textInput.value,
						sectionItems
					);
					if (!validation.ok) {
						showFormError(form, validation.error);
						if (validation.error.includes('label')) {
							labelInput.focus();
						} else {
							textInput.focus();
						}
						return;
					}

					if (sections[sectionIndex]) {
						sections[sectionIndex].items.push(validation.value);
						await saveProfileSections(sections);
					}
					
					form.remove();
					await render();
				} catch (error) {
					showFormError(form, 'Failed to add command');
				}
			});
			
			cancelBtn.addEventListener('click', () => form.remove());
			
			[labelInput, textInput].forEach(input => {
				input.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') saveBtn.click();
					if (e.key === 'Escape') cancelBtn.click();
				});
			});
		}
		
		async function saveProfileSections(sections) {
			const keys = window.TqcStorage.KEYS;
			const stored = await safeSyncGet([keys.profiles, keys.activeProfileId]);
			const profiles = stored[keys.profiles] || {};
			const activeId = stored[keys.activeProfileId] || 'default';
			
			profiles[activeId] = {
				...(profiles[activeId] || {}),
				sections: sections
			};
			
			const saveResult = await safeSyncSet({ [keys.profiles]: profiles });
			if (!saveResult.ok) {
				showOverlayToast(saveResult.error || 'Failed to save changes');
				throw new Error(saveResult.error || 'Failed to save changes');
			}
		}

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


