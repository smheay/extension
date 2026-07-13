const {
	loadProfiles,
	saveProfiles,
	createDefaultProfile,
	validateSectionTitle,
	LIMITS
} = window.TqcStorage;

async function refreshSectionsOnly() {
	const sectionsContainer = document.getElementById('sectionsContainer');
	if (!sectionsContainer) return;
	
	const list = document.getElementById('sectionsList');
	if (list) {
		await renderSectionsEditor(list);
	}
}
async function renderSectionsEditor(list) {
	list.innerHTML = '';
	const { profiles: freshProfiles, activeId: freshActiveId } = await loadProfiles();
	const prof = freshProfiles[freshActiveId] || createDefaultProfile();
	const sections = Array.isArray(prof.sections) ? prof.sections : [];
	
	sections.forEach((sec, idx) => {
		const headerRow = document.createElement('div');
		headerRow.className = 'row section-header';
		const title = document.createElement('input'); title.placeholder = 'Section title'; title.value = sec.title || '';
		title.addEventListener('input', autoSave);
		const addItemBtn = document.createElement('button'); addItemBtn.className = 'icon'; addItemBtn.textContent = '+'; addItemBtn.title = 'Add command to section';
		const del = document.createElement('button'); del.className = 'icon'; del.textContent = '✕';
		headerRow.appendChild(title);
		headerRow.appendChild(addItemBtn);
		headerRow.appendChild(del);
		list.appendChild(headerRow);

		sec.items = Array.isArray(sec.items) ? sec.items : [];
		const renderItems = () => {
			// More efficient: remove only existing items for this section
			const existingItems = list.querySelectorAll(`.item-row[data-sec="${idx}"]`);
			existingItems.forEach(n => n.remove());
			let insertAfter = headerRow;
			
			sec.items.forEach((item, itemIdx) => {
				const itemRow = document.createElement('div');
				itemRow.className = 'row item-row';
				itemRow.dataset.sec = String(idx);
				itemRow.dataset.itemIdx = String(itemIdx);
				itemRow.draggable = true;
				
				const dragHandle = document.createElement('span'); 
				dragHandle.textContent = '≡';
				dragHandle.className = 'drag-handle';
				dragHandle.title = 'Drag to reorder';
				dragHandle.style.cursor = 'grab';
				dragHandle.style.color = '#888';
				dragHandle.style.userSelect = 'none';
				
				const label = document.createElement('input'); label.placeholder = 'Label'; label.value = item.label || '';
				const text = document.createElement('input'); text.placeholder = 'Text'; text.value = item.text || '';
				const delI = document.createElement('button'); delI.className = 'icon'; delI.textContent = '✕';
				
				itemRow.appendChild(dragHandle); itemRow.appendChild(label); itemRow.appendChild(text); itemRow.appendChild(delI);
				
				if (insertAfter.nextSibling) {
					list.insertBefore(itemRow, insertAfter.nextSibling);
				} else {
					list.appendChild(itemRow);
				}
				insertAfter = itemRow;
				
				label.addEventListener('input', e => { item.label = e.target.value; autoSave(); });
				text.addEventListener('input', e => { item.text = e.target.value; autoSave(); });
				delI.addEventListener('click', () => { sec.items.splice(itemIdx,1); renderItems(); autoSave(); });
				itemRow.addEventListener('dragstart', (e) => {
					e.dataTransfer.setData('text/plain', JSON.stringify({
						sectionIdx: idx,
						itemIdx: itemIdx,
						item: item
					}));
					itemRow.classList.add('dragging');
					dragHandle.style.cursor = 'grabbing';
				});
				
				itemRow.addEventListener('dragend', (e) => {
					itemRow.classList.remove('dragging');
					dragHandle.style.cursor = 'grab';
					document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
				});
				
				itemRow.addEventListener('dragover', (e) => {
					e.preventDefault();
					e.dataTransfer.dropEffect = 'move';
					
					const rect = itemRow.getBoundingClientRect();
					const mouseY = e.clientY;
					const itemMiddle = rect.top + rect.height / 2;
					
					document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
					
					const indicator = document.createElement('div');
					indicator.className = 'drop-indicator';
					
					if (mouseY < itemMiddle) {
						itemRow.parentNode.insertBefore(indicator, itemRow);
					} else {
						if (itemRow.nextSibling) {
							itemRow.parentNode.insertBefore(indicator, itemRow.nextSibling);
						} else {
							itemRow.parentNode.appendChild(indicator);
						}
					}
				});
				
				itemRow.addEventListener('dragleave', (e) => {
					if (!e.relatedTarget || !itemRow.contains(e.relatedTarget)) {
						setTimeout(() => {
							if (!document.querySelector('.item-row:hover')) {
								document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
							}
						}, DROP_INDICATOR_CLEANUP_DELAY_MS);
					}
				});
				
				itemRow.addEventListener('drop', (e) => {
					e.preventDefault();
					document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
					
					try {
						const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
						const targetSectionIdx = parseInt(itemRow.dataset.sec);
						const targetItemIdx = parseInt(itemRow.dataset.itemIdx);
						
						if (dragData.sectionIdx === targetSectionIdx && dragData.itemIdx === targetItemIdx) {
							return;
						}
						
						if (dragData.sectionIdx === targetSectionIdx) {
							const rect = itemRow.getBoundingClientRect();
							const mouseY = e.clientY;
							const itemMiddle = rect.top + rect.height / 2;
							const dropBefore = mouseY < itemMiddle;
							
							let newIdx = targetItemIdx;
							if (dropBefore) {
								newIdx = targetItemIdx;
							} else {
								newIdx = targetItemIdx + 1;
							}
							
							if (dragData.itemIdx < newIdx) {
								newIdx--;
							}
							
							if (dragData.itemIdx === newIdx) {
								return;
							}
							
							const movedItem = sec.items.splice(dragData.itemIdx, 1)[0];
							sec.items.splice(newIdx, 0, movedItem);
							
							setTimeout(() => {
								renderItems();
								autoSave();
							}, DRAG_ITEM_RENDER_DELAY_MS);
						}
					} catch (error) {
						// ignore
					}
				});
			});
		};
		renderItems();

				addItemBtn.addEventListener('click', () => { 
			sec.items.push({ label: '', text: '' }); 
			renderItems();
			const rows = list.querySelectorAll(`.item-row[data-sec="${idx}"]`);
			const lastRow = rows[rows.length - 1];
			const focusInput = lastRow?.querySelector('input');
			if (focusInput) focusInput.focus();
		});
		del.addEventListener('click', async () => {
			const sectionTitle = (sec.title || 'Section').trim() || 'Section';
			if (!confirm(`Delete section "${sectionTitle}" and all of its commands?`)) {
				return;
			}
			try {
				const { profiles, activeId } = await loadProfiles();
				profiles[activeId].sections.splice(idx, 1); 
				await saveProfiles(profiles, activeId);
				await refreshSectionsOnly();
				showNotification('Section deleted', 1200);
			} catch (error) {
				showNotification(error.message || 'Failed to delete section', 2000);
			}
		});
		title.addEventListener('input', e => { sec.title = e.target.value; autoSave(); });
	});
}


function captureCurrentSections() {
	const sectionsList = document.getElementById('sectionsList');
	if (!sectionsList) return [];
	
	const sectionHeaders = sectionsList.querySelectorAll('.section-header');
	return Array.from(sectionHeaders).map((headerEl, idx) => {
		const titleInput = headerEl.querySelector('input');
		const title = (titleInput?.value || '').trim() || 'Section';
		
		const items = Array.from(sectionsList.querySelectorAll(`.item-row[data-sec="${idx}"]`)).map(row => {
			const inputs = row.querySelectorAll('input');
			return { label: inputs[0]?.value || '', text: inputs[1]?.value || '' };
		}).filter((item) => (item.label || '').trim().length > 0 || (item.text || '').trim().length > 0);
		
		return { title, items };
	});
}

function validateSectionsForSave(sections) {
	const seenTitles = new Set();
	const persistable = [];

	for (const section of sections) {
		const title = (section.title || '').trim();
		if (!title) {
			return { ok: false, error: 'Section title is required' };
		}
		if (title.length > LIMITS.sectionTitle) {
			return { ok: false, error: `Section title too long (max ${LIMITS.sectionTitle} characters)` };
		}
		const titleKey = title.toLowerCase();
		if (seenTitles.has(titleKey)) {
			return { ok: false, error: `Duplicate section title: ${title}` };
		}
		seenTitles.add(titleKey);

		const items = [];
		const seenLabels = new Set();
		for (const item of section.items || []) {
			const label = (item.label || '').trim();
			const text = (item.text || '').trim();
			// Keep incomplete drafts in the editor UI; only persist finished commands.
			if (!label || !text) continue;
			if (label.length > LIMITS.commandLabel) {
				return { ok: false, error: `Command label too long (max ${LIMITS.commandLabel} characters)` };
			}
			if (text.length > LIMITS.commandText) {
				return { ok: false, error: `Command text too long (max ${LIMITS.commandText} characters)` };
			}
			const labelKey = label.toLowerCase();
			if (seenLabels.has(labelKey)) {
				return { ok: false, error: `Duplicate command label in "${title}": ${label}` };
			}
			seenLabels.add(labelKey);
			items.push({ label, text });
		}

		persistable.push({ title, items });
	}

	return { ok: true, sections: persistable };
}


function showNotification(message, duration = 1000) {
	const saved = document.getElementById("saved");
	if (saved) {
		saved.textContent = message;
		saved.hidden = false;
		saved.classList.add('show');
		setTimeout(() => {
			saved.classList.remove('show');
			setTimeout(() => saved.hidden = true, 300);
		}, duration);
	}
}

// Constants for timing and UI behavior
const AUTO_SAVE_DELAY_MS = 500; // Wait time before auto-saving after last change
const DRAG_ITEM_RENDER_DELAY_MS = 10; // Small delay to ensure DOM is ready after drag operations
const DROP_INDICATOR_CLEANUP_DELAY_MS = 50; // Delay to prevent flicker when moving between elements


let autoSaveTimeout = null;
let pendingSaveProfileId = null;
let editorProfileId = null;
let profileNameSaveTimeout = null;
let isHydratingProfiles = false;

function cancelPendingSaves() {
	if (autoSaveTimeout) {
		clearTimeout(autoSaveTimeout);
		autoSaveTimeout = null;
	}
	if (profileNameSaveTimeout) {
		clearTimeout(profileNameSaveTimeout);
		profileNameSaveTimeout = null;
	}
	pendingSaveProfileId = null;
}

async function persistSectionsToProfile(profileId) {
	if (!profileId || isHydratingProfiles) return false;
	const sectionsList = document.getElementById('sectionsList');
	if (!sectionsList) return false;

	const { profiles, activeId } = await loadProfiles();
	if (!profiles[profileId]) return false;

	const builtSections = captureCurrentSections();
	if (!Array.isArray(builtSections)) return false;

	const validation = validateSectionsForSave(builtSections);
	if (!validation.ok) {
		showNotification(validation.error, 2000);
		return false;
	}

	profiles[profileId] = {
		...profiles[profileId],
		sections: validation.sections
	};
	await saveProfiles(profiles, activeId || profileId);
	return true;
}

async function flushPendingSectionSave() {
	const targetId = pendingSaveProfileId || editorProfileId;
	cancelPendingSaves();
	if (!targetId) return;
	await persistSectionsToProfile(targetId);
}

async function autoSave() {
	if (!editorProfileId || isHydratingProfiles) return;

	if (autoSaveTimeout) {
		clearTimeout(autoSaveTimeout);
	}

	pendingSaveProfileId = editorProfileId;
	autoSaveTimeout = setTimeout(async () => {
		autoSaveTimeout = null;
		const targetId = pendingSaveProfileId;
		pendingSaveProfileId = null;

		try {
			if (!targetId || targetId !== editorProfileId || isHydratingProfiles) {
				return;
			}
			const saved = await persistSectionsToProfile(targetId);
			if (saved) {
				showNotification("Auto-saved", 800);
			}
		} catch (error) {
			showNotification("Auto-save failed", 2000);
		}
	}, AUTO_SAVE_DELAY_MS);
}

document.getElementById("addSection").addEventListener("click", async () => {
	cancelPendingSaves();
	try {
		const { profiles, activeId } = await loadProfiles();
		const currentSections = captureCurrentSections();
		const validation = validateSectionTitle('New Section', currentSections);
		const nextTitle = validation.ok ? validation.value : `New Section ${currentSections.length + 1}`;
		currentSections.push({ title: nextTitle, items: [] });
		
		const currentProfile = profiles[activeId] || createDefaultProfile();
		profiles[activeId] = { 
			...currentProfile, 
			sections: currentSections
		};
		
		await saveProfiles(profiles, activeId);
		await refreshSectionsOnly();
		showNotification("Section added & saved", 1200);
	} catch (error) {
		showNotification(error.message || 'Failed to add section', 2000);
	}
});

document.getElementById("resetDefaults").addEventListener("click", async () => {
	cancelPendingSaves();
	const { profiles, activeId } = await loadProfiles();
	const currentProfile = profiles[activeId];
	const profileName = currentProfile?.name || 'Current profile';
	
	if (!confirm(`This will reset "${profileName}" to default sections. All current sections and commands will be replaced. Continue?`)) {
		return;
	}

	let resetKind = 'empty';
	if (activeId === 'default' || profileName.toLowerCase().includes('game')) {
		resetKind = 'game';
	} else if (activeId === 'emotes' || profileName.toLowerCase().includes('emote')) {
		resetKind = 'emotes';
	}

	chrome.runtime.sendMessage(
		{ type: 'RESET_PROFILE_TO_DEFAULTS', profileId: activeId, resetKind },
		async (response) => {
			if (response?.ok) {
				const resetLabel = resetKind === 'game'
					? 'default game commands'
					: resetKind === 'emotes'
						? 'default emotes'
						: 'empty state';
				showNotification(`${profileName} reset to ${resetLabel}!`, 2000);
				await hydrateProfilesUI();
			} else {
				showNotification('Failed to reset profile', 2000);
			}
		}
	);
});

document.getElementById("addProfile").addEventListener("click", async () => {
	await flushPendingSectionSave();
	const { profiles } = await loadProfiles();
	const id = `p_${Date.now()}`;
	profiles[id] = { name: "New Profile", sections: [] };
	await saveProfiles(profiles, id);
	await hydrateProfilesUI();
});

document.getElementById("deleteProfile").addEventListener("click", async () => {
	cancelPendingSaves();
	const { profiles, activeId } = await loadProfiles();
	const ids = Object.keys(profiles);
	if (ids.length <= 1) return; // keep at least one
	if (!confirm(`Delete profile "${profiles[activeId]?.name || activeId}"? This cannot be undone.`)) {
		return;
	}
	delete profiles[activeId];
	const nextId = Object.keys(profiles)[0];
	await saveProfiles(profiles, nextId);
	await hydrateProfilesUI();
});



let globalDragHandlersReady = false;

function ensureGlobalDragHandlers() {
	if (globalDragHandlersReady) return;
	globalDragHandlersReady = true;

	document.addEventListener('dragover', (e) => {
		const target = e.target.closest('.item-row');
		if (target) {
			e.preventDefault();
			document.querySelectorAll('.invalid-drop-zone').forEach(el => {
				el.classList.remove('invalid-drop-zone');
			});
		} else {
			const sectionHeader = e.target.closest('.section-header');
			if (sectionHeader) {
				sectionHeader.classList.add('invalid-drop-zone');
			}
		}
	});

	document.addEventListener('dragleave', (e) => {
		const sectionHeader = e.target.closest('.section-header');
		if (sectionHeader) {
			sectionHeader.classList.remove('invalid-drop-zone');
		}
	});

	document.addEventListener('drop', (e) => {
		e.preventDefault();
		document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
		document.querySelectorAll('.invalid-drop-zone').forEach(el => {
			el.classList.remove('invalid-drop-zone');
		});

		const target = e.target.closest('.item-row');
		if (!target) {
			return false;
		}
	});
}

async function hydrateProfilesUI() {
	isHydratingProfiles = true;
	cancelPendingSaves();

	try {
		const { profiles, activeId } = await loadProfiles();
		editorProfileId = activeId;
		const select = document.getElementById('profileSelect');
		const profileNameInput = document.getElementById('profileName');
		select.innerHTML = '';
		Object.entries(profiles).forEach(([id, prof]) => {
			const opt = document.createElement('option');
			opt.value = id; opt.textContent = prof.name || id;
			if (id === activeId) opt.selected = true;
			select.appendChild(opt);
		});
		if (profileNameInput) {
			profileNameInput.value = profiles[activeId]?.name || '';
		}
		select.onchange = async () => {
			const nextId = select.value;
			const fromId = editorProfileId;

			// DOM still shows the previous profile until hydrate — flush those edits first.
			if (fromId && fromId !== nextId) {
				await persistSectionsToProfile(fromId);
			}
			cancelPendingSaves();

			const latest = await loadProfiles();
			await saveProfiles(latest.profiles, nextId);
			await hydrateProfilesUI();
		};

		const sectionsContainer = document.getElementById('sectionsContainer');
		if (!sectionsContainer) return;

		sectionsContainer.innerHTML = '';

		const header = document.createElement('h2');
		header.textContent = 'Sections (this profile)';
		header.style.fontSize = '14px';
		header.style.margin = '0 0 8px 0';
		sectionsContainer.appendChild(header);

		const list = document.createElement('div');
		list.id = 'sectionsList';
		list.style.display = 'grid';
		list.style.gap = '8px';
		sectionsContainer.appendChild(list);

		await renderSectionsEditor(list);
	} finally {
		isHydratingProfiles = false;
	}
}

function setupProfileRename() {
	const profileNameInput = document.getElementById('profileName');
	if (!profileNameInput) return;

	profileNameInput.addEventListener('input', () => {
		if (profileNameSaveTimeout) {
			clearTimeout(profileNameSaveTimeout);
		}

		const renamingProfileId = editorProfileId;
		profileNameSaveTimeout = setTimeout(async () => {
			profileNameSaveTimeout = null;
			if (!renamingProfileId || renamingProfileId !== editorProfileId) {
				return;
			}

			const { profiles, activeId } = await loadProfiles();
			if (!profiles[renamingProfileId]) return;

			const nextName = profileNameInput.value.trim();
			if (!nextName) {
				profileNameInput.value = profiles[renamingProfileId]?.name || '';
				showNotification('Profile name cannot be empty', 2000);
				return;
			}

			profiles[renamingProfileId] = {
				...profiles[renamingProfileId],
				name: nextName
			};
			await saveProfiles(profiles, activeId);

			const select = document.getElementById('profileSelect');
			const selectedOption = select?.querySelector(`option[value="${renamingProfileId}"]`);
			if (selectedOption) {
				selectedOption.textContent = nextName;
			}
			showNotification('Profile renamed', 1000);
		}, AUTO_SAVE_DELAY_MS);
	});
}

(async () => {
	ensureGlobalDragHandlers();
	setupProfileRename();
	await hydrateProfilesUI();
})();


