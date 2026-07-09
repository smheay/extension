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

		return new Promise((resolve) => {
			const requestId = `${Date.now()}-${Math.random()}`;
			const timeout = setTimeout(() => {
				window.removeEventListener('message', handler);
				resolve({ ok: false, error: 'Chat send timed out' });
			}, PAGE_BRIDGE_TIMEOUT_MS);

			function handler(event) {
				if (
					event.source !== window ||
					event.data?.type !== 'TQC_CHAT_RESULT' ||
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
			window.postMessage({ type: 'TQC_SEND_CHAT', text, requestId, token: bridgeToken }, '*');
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
			if (!isExtensionAlive()) return;
			await chrome.storage.sync.set(obj);
		} catch (e) {}
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

	async function loadOverlayPosition() {
		const keys = window.TqcStorage.KEYS;
		const local = await safeLocalGet(keys.overlayPos);
		if (local && local[keys.overlayPos]) return local[keys.overlayPos];
		return { top: 80, left: 20 };
	}

	async function saveOverlayPosition(pos) {
		const keys = window.TqcStorage.KEYS;
		await safeLocalSet({ [keys.overlayPos]: pos });
	}

	function ensureStyles(root) {
		// Remove existing styles
		const oldStyle = root.querySelector('#tqc-style');
		if (oldStyle) oldStyle.remove();
		
		const style = document.createElement('style');
		style.id = 'tqc-style';
		style.textContent = `
			.tqc-overlay{position:fixed;z-index:2147483646;background:#111827cc;color:#e5e7eb;border:1px solid #374151;border-radius:8px;backdrop-filter:saturate(120%) blur(2px);box-shadow:0 6px 20px rgba(0,0,0,.45);width:320px;max-height:90vh;overflow-y:auto;}
			.tqc-header{cursor:move;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#0b1220cc;border-bottom:1px solid #374151;border-top-left-radius:8px;border-top-right-radius:8px;user-select:none}
			.tqc-title{font-size:13px;margin:0;display:flex;gap:8px;align-items:center}
			.tqc-select{border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px}
			.tqc-body{padding:10px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
			.tqc-btn{border:1px solid #374151;border-radius:6px;background:#111827;color:#e5e7eb;padding:8px 10px;font-size:12px;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s ease}
			.tqc-btn:hover{background:#0f172acc}
			.tqc-close{background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:14px}
			.tqc-section-title{grid-column:1/-1 !important;font-size:11px;color:#9ca3af;margin:4px 0 0 0;text-transform:uppercase;letter-spacing:.04em;display:flex;justify-content:space-between;align-items:center}
			.tqc-section-add{background:#16a34a !important;border:none !important;color:#fff !important;border-radius:4px;width:18px !important;height:18px !important;font-size:12px;cursor:pointer;font-weight:bold;position:relative !important;padding:0 !important;margin:0 !important;box-sizing:border-box !important;display:table-cell !important;vertical-align:middle !important;text-align:center !important}
			.tqc-section-add:hover{background:#15803d}
			.tqc-add-form{grid-column:1/-1;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border:1px solid #334155;border-radius:8px;padding:12px;margin:6px 0;box-shadow:0 4px 12px rgba(0,0,0,0.15)}
			.tqc-add-input{background:#111827;border:1px solid #374151;border-radius:6px;color:#d1d5db;padding:8px 10px;font-size:12px;width:100%;margin:3px 0;box-sizing:border-box;transition:border-color 0.2s ease,box-shadow 0.2s ease}
			.tqc-add-input:focus{outline:none;border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,0.1)}
			.tqc-add-input::placeholder{color:#6b7280;font-style:italic}
			.tqc-add-buttons{display:flex;gap:8px;margin-top:10px;justify-content:flex-end}
			.tqc-add-btn{border:1px solid #374151;border-radius:6px;background:#374151;color:#d1d5db;padding:8px 16px;font-size:11px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;transition:all 0.2s ease;font-weight:500}
			.tqc-add-btn.save{background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);border-color:#15803d;color:#fff;box-shadow:0 2px 6px rgba(22,163,74,0.3)}
			.tqc-add-btn:hover{transform:translateY(-1px);box-shadow:0 4px 8px rgba(0,0,0,0.3)}
			.tqc-add-btn.save:hover{box-shadow:0 4px 12px rgba(22,163,74,0.4)}
			.tqc-form-error{grid-column:1/-1;color:#fca5a5;font-size:11px;margin:4px 0 0 0}
			
			/* Custom scrollbar for overlay */
			.tqc-overlay::-webkit-scrollbar{width:6px;}
			.tqc-overlay::-webkit-scrollbar-track{background:transparent;}
			.tqc-overlay::-webkit-scrollbar-thumb{background:#374151;border-radius:3px;}
			.tqc-overlay::-webkit-scrollbar-thumb:hover{background:#4b5563;}
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

		addBtn.addEventListener('click', () => {
			showAddSectionForm();
		});

		close.addEventListener('click', () => { container.style.display = 'none'; });

		// Position
		const pos = await loadOverlayPosition();
		container.style.top = pos.top + 'px';
		container.style.left = pos.left + 'px';

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
				await safeSyncSet({ [keys.activeProfileId]: profileSelect.value });
		
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
				
				const addSectionBtn = document.createElement('button');
				addSectionBtn.className = 'tqc-section-add';
				addSectionBtn.innerHTML = '<span style="display:block;width:100%;height:100%;line-height:18px;text-align:center;">+</span>';
				addSectionBtn.title = 'Add command to this section';
				addSectionBtn.addEventListener('click', () => showAddCommandForm(originalIndex));
				
				headerEl.appendChild(titleSpan);
				headerEl.appendChild(addSectionBtn);
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
							await sendChatMessage(item.text || '');
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
			
			await safeSyncSet({ [keys.profiles]: profiles });
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


