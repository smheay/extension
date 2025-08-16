async function loadProfiles() {
	const { tqcProfiles, tqcActiveProfileId } = await chrome.storage.sync.get(["tqcProfiles", "tqcActiveProfileId"]);
	let profiles = tqcProfiles || {};
	let activeId = tqcActiveProfileId;
	if (!activeId) {
		if (Object.keys(profiles).length === 0) {
			profiles = { default: createDefaultProfile("Default") };
			activeId = "default";
		} else {
			activeId = Object.keys(profiles)[0];
		}
		await chrome.storage.sync.set({ tqcProfiles: profiles, tqcActiveProfileId: activeId });
	}
	return { profiles, activeId };
}

async function saveProfiles(profiles, activeId) {
	await chrome.storage.sync.set({ tqcProfiles: profiles, tqcActiveProfileId: activeId });
}

// Helper function for consistent default profile structure
function createDefaultProfile(name = "Default") {
	return { name, sections: [] };
}

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
		const drag = document.createElement('span'); drag.textContent = '≡';
		const title = document.createElement('input'); title.placeholder = 'Section title'; title.value = sec.title || '';
		title.addEventListener('input', autoSave);
		const addItemBtn = document.createElement('button'); addItemBtn.className = 'icon'; addItemBtn.textContent = '+'; addItemBtn.title = 'Add command to section';
		const del = document.createElement('button'); del.className = 'icon'; del.textContent = '✕';
		headerRow.appendChild(drag); headerRow.appendChild(title);
		const spacer = document.createElement('div'); spacer.style.minHeight = '1px'; headerRow.appendChild(spacer);
		headerRow.appendChild(addItemBtn); headerRow.appendChild(del);
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
						console.error('Drop failed:', error);
					}
				});
			});
		};
		renderItems();

				addItemBtn.addEventListener('click', () => { 
			sec.items.push({ label: 'New', text: '' }); 
			renderItems();
			autoSave();
		});
		del.addEventListener('click', async () => { 
			const { profiles, activeId } = await loadProfiles();
			profiles[activeId].sections.splice(idx, 1); 
			await saveProfiles(profiles, activeId);
			await refreshSectionsOnly();
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
		
		// Use more efficient selector - avoid document-wide search
		const items = Array.from(sectionsList.querySelectorAll(`.item-row[data-sec="${idx}"]`)).map(row => {
			const inputs = row.querySelectorAll('input');
			return { label: inputs[0]?.value || '', text: inputs[1]?.value || '' };
		}).filter(i => (i.text || '').trim().length > 0);
		
		return { title, items };
	});
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
const PROFILE_UPDATE_DELAY_MS = 100; // Delay to prevent double-rendering during profile changes
const DRAG_ITEM_RENDER_DELAY_MS = 10; // Small delay to ensure DOM is ready after drag operations
const DROP_INDICATOR_CLEANUP_DELAY_MS = 50; // Delay to prevent flicker when moving between elements


let autoSaveTimeout = null;

async function autoSave() {
	if (autoSaveTimeout) {
		clearTimeout(autoSaveTimeout);
	}
	
	autoSaveTimeout = setTimeout(async () => {
		try {
			const { profiles, activeId } = await loadProfiles();
			if (!profiles || !activeId) {
				console.error('Auto-save: Invalid profiles or activeId');
				return;
			}
			
			const builtSections = captureCurrentSections();
			if (!Array.isArray(builtSections)) {
				console.error('Auto-save: Invalid sections data');
				return;
			}
			
			const existingProfile = profiles[activeId] || createDefaultProfile();
			profiles[activeId] = { 
				...existingProfile, 
				sections: builtSections
			};
			
			await saveProfiles(profiles, activeId);
			showNotification("Auto-saved", 800);
		} catch (error) {
			console.error('Auto-save failed:', error);
			showNotification("Auto-save failed", 2000);
		}
	}, AUTO_SAVE_DELAY_MS);
}

document.getElementById("addSection").addEventListener("click", async () => {
	const { profiles, activeId } = await loadProfiles();
	const currentSections = captureCurrentSections();
	currentSections.push({ title: 'New Section', items: [] });
	
	const currentProfile = profiles[activeId] || createDefaultProfile();
	profiles[activeId] = { 
		...currentProfile, 
		sections: currentSections
	};
	
	await saveProfiles(profiles, activeId);
	await refreshSectionsOnly();
	showNotification("Section added & saved", 1200);
});

document.getElementById("resetDefaults").addEventListener("click", async () => {
	const { profiles, activeId } = await loadProfiles();
	const currentProfile = profiles[activeId];
	const profileName = currentProfile?.name || 'Current profile';
	
	if (confirm(`This will reset "${profileName}" to default sections. All current sections and commands will be replaced. Continue?`)) {
		// Determine which defaults to use based on profile
		let defaultSections;
		if (activeId === 'default' || profileName.toLowerCase().includes('game')) {
			// Use game defaults for 'default' profile or profiles with 'game' in name
			chrome.runtime.sendMessage({ type: 'RECREATE_GAME_PROFILE' }, async (response) => {
				if (response?.ok) {
					alert(`${profileName} reset to default game commands!`);
					await hydrateProfilesUI();
				} else {
					alert('Failed to reset profile');
				}
			});
		} else if (activeId === 'emotes' || profileName.toLowerCase().includes('emote')) {
			// Use emote defaults for 'emotes' profile or profiles with 'emote' in name
			chrome.runtime.sendMessage({ type: 'RECREATE_EMOTES_PROFILE' }, async (response) => {
				if (response?.ok) {
					alert(`${profileName} reset to default emotes!`);
					await hydrateProfilesUI();
				} else {
					alert('Failed to reset emotes profile');
				}
			});
		} else {
			// For custom profiles, reset to empty sections
			profiles[activeId] = {
				name: profileName,
				sections: []
			};
			await saveProfiles(profiles, activeId);
			alert(`${profileName} reset to empty state!`);
			await hydrateProfilesUI();
		}
	}
});

// Manual save button removed - auto-save handles all changes

document.getElementById("addProfile").addEventListener("click", async () => {
	const { profiles, activeId } = await loadProfiles();
	const id = `p_${Date.now()}`;
	profiles[id] = { name: "New Profile", sections: [] };
	await saveProfiles(profiles, id);
	await hydrateProfilesUI();
});

document.getElementById("deleteProfile").addEventListener("click", async () => {
	const { profiles, activeId } = await loadProfiles();
	const ids = Object.keys(profiles);
	if (ids.length <= 1) return; // keep at least one
	delete profiles[activeId];
	const nextId = Object.keys(profiles)[0];
	await saveProfiles(profiles, nextId);
	await hydrateProfilesUI();
});



async function hydrateProfilesUI() {
	const { profiles, activeId } = await loadProfiles();
	const select = document.getElementById('profileSelect');
	select.innerHTML = '';
	Object.entries(profiles).forEach(([id, prof]) => {
		const opt = document.createElement('option');
		opt.value = id; opt.textContent = prof.name || id;
		if (id === activeId) opt.selected = true;
		select.appendChild(opt);
	});
	select.addEventListener('change', async () => {
		await saveProfiles(profiles, select.value);
		const latest = await loadProfiles();
		await hydrateProfilesUI(); // Refresh the entire UI after profile change
	});
	// Commands are now handled through sections, not as a flat list
	// Legacy commands container is no longer used
	const commandsContainer = document.getElementById("commands");
	if (commandsContainer) {
		commandsContainer.innerHTML = '';
	}

	// Clear and rebuild sections editor
	let sectionsContainer = document.getElementById('sectionsContainer');
	if (sectionsContainer) {
		sectionsContainer.remove();
	}
	
	sectionsContainer = document.createElement('div');
	sectionsContainer.id = 'sectionsContainer';
	sectionsContainer.style.marginTop = '16px';
	sectionsContainer.style.borderTop = '1px solid #e5e7eb';
	sectionsContainer.style.paddingTop = '12px';
	
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
	
	document.getElementById('commands').parentNode.appendChild(sectionsContainer);

	// Global drag/drop handlers to prevent accidental drops
	document.addEventListener('dragover', (e) => {
		const target = e.target.closest('.item-row');
		if (target) {
			// Valid drop zone
			e.preventDefault();
			// Remove invalid styling from other elements
			document.querySelectorAll('.invalid-drop-zone').forEach(el => {
				el.classList.remove('invalid-drop-zone');
			});
		} else {
			// Invalid drop zone - show visual feedback
			const sectionHeader = e.target.closest('.section-header');
			if (sectionHeader) {
				sectionHeader.classList.add('invalid-drop-zone');
			}
		}
	});
	
	document.addEventListener('dragleave', (e) => {
		// Remove invalid styling when leaving elements
		const sectionHeader = e.target.closest('.section-header');
		if (sectionHeader) {
			sectionHeader.classList.remove('invalid-drop-zone');
		}
	});
	
	document.addEventListener('drop', (e) => {
		// Always prevent browser from displaying drag data as text
		e.preventDefault();
		
		// Clean up all visual indicators
		document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
		document.querySelectorAll('.invalid-drop-zone').forEach(el => {
			el.classList.remove('invalid-drop-zone');
		});
		
		// Only allow drops on item rows
		const target = e.target.closest('.item-row');
		if (!target) {
			// Invalid drop area - just clean up and do nothing
			return false;
		}
	});


	await renderSectionsEditor(list);
}

(async () => {
	await hydrateProfilesUI();
})();


