async function loadProfiles() {
	const { tqcProfiles, tqcActiveProfileId, quickCommands } = await chrome.storage.sync.get(["tqcProfiles", "tqcActiveProfileId", "quickCommands"]);
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

function makeRow(cmd, idx) {
	const row = document.createElement("div");
	row.className = "row";

	const drag = document.createElement("span");
	drag.textContent = "≡";
	drag.title = "Drag not implemented; use arrows";

	const label = document.createElement("input");
	label.placeholder = "Label";
	label.value = cmd.label || "";

	const text = document.createElement("input");
	text.placeholder = "Text to send";
	text.value = cmd.text || "";

	const up = document.createElement("button");
	up.className = "icon";
	up.textContent = "↑";
	up.title = "Move up";

	const del = document.createElement("button");
	del.className = "icon";
	del.textContent = "✕";
	del.title = "Delete";

	row.appendChild(drag);
	row.appendChild(label);
	row.appendChild(text);
	row.appendChild(up);
	row.appendChild(del);

	return { row, refs: { label, text, up, del } };
}

function rebuildUI(state) {
	const container = document.getElementById("commands");
	container.innerHTML = "";

	state.forEach((cmd, idx) => {
		const { row, refs } = makeRow(cmd, idx);
		refs.up.addEventListener("click", () => {
			if (idx === 0) return;
			const next = state.slice();
			[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
			rebuildUI(next);
		});
		refs.del.addEventListener("click", () => {
			const next = state.slice(0, idx).concat(state.slice(idx + 1));
			rebuildUI(next);
		});
		refs.label.addEventListener("input", (e) => { cmd.label = e.target.value; });
		refs.text.addEventListener("input", (e) => { cmd.text = e.target.value; });
		container.appendChild(row);
	});

	// keep reference of current in DOM for save (legacy)
	container.dataset.state = JSON.stringify(state);
}

function readStateFromDOM() {
	// Read live values from inputs so edits are captured
	const rows = Array.from(document.querySelectorAll('#commands .row'));
	return rows.map(row => {
		const inputs = row.querySelectorAll('input');
		const label = inputs[0]?.value || "";
		const text = inputs[1]?.value || "";
		return { label, text };
	});
}

// Legacy "Add Command" button removed - use the "+" button in each section instead

// Helper function for consistent default profile structure
function createDefaultProfile(name = "Default") {
	return { name, sections: [] };
}

// Helper function to refresh sections without rebuilding entire UI
async function refreshSectionsOnly() {
	const sectionsContainer = document.getElementById('sectionsContainer');
	if (!sectionsContainer) return;
	
	const list = document.getElementById('sectionsList');
	if (list) {
		await renderSectionsEditorInContainer(list);
	}
}

// Standalone sections editor renderer
async function renderSectionsEditorInContainer(list) {
	list.innerHTML = '';
	// Get fresh data to avoid stale references
	const { profiles: freshProfiles, activeId: freshActiveId } = await loadProfiles();
	const prof = freshProfiles[freshActiveId] || createDefaultProfile();
	const sections = Array.isArray(prof.sections) ? prof.sections : [];
	
	sections.forEach((sec, idx) => {
		// Header row for the section
		const headerRow = document.createElement('div');
		headerRow.className = 'row section-header';
		const drag = document.createElement('span'); drag.textContent = '≡';
		const title = document.createElement('input'); title.placeholder = 'Section title'; title.value = sec.title || '';
		title.addEventListener('input', autoSave); // Auto-save on title changes
		const addItemBtn = document.createElement('button'); addItemBtn.className = 'icon'; addItemBtn.textContent = '+'; addItemBtn.title = 'Add command to section';
		const del = document.createElement('button'); del.className = 'icon'; del.textContent = '✕';
		headerRow.appendChild(drag); headerRow.appendChild(title);
		// spacer for grid alignment
		const spacer = document.createElement('div'); spacer.style.minHeight = '1px'; headerRow.appendChild(spacer);
		headerRow.appendChild(addItemBtn); headerRow.appendChild(del);
		list.appendChild(headerRow);

		// Items in the section
		sec.items = Array.isArray(sec.items) ? sec.items : [];
		const renderItems = () => {
			// Remove any existing item rows for this section
			Array.from(list.querySelectorAll(`.item-row[data-sec="${idx}"]`)).forEach(n => n.remove());
			
			// Find the position to insert items (after this section's header)
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
				
				// Insert item immediately after the previous item (or header if first item)
				if (insertAfter.nextSibling) {
					list.insertBefore(itemRow, insertAfter.nextSibling);
				} else {
					list.appendChild(itemRow);
				}
				insertAfter = itemRow; // Next item should come after this one
				
				// Event handlers
				label.oninput = e => { item.label = e.target.value; autoSave(); };
				text.oninput = e => { item.text = e.target.value; autoSave(); };
				delI.onclick = () => { sec.items.splice(itemIdx,1); renderItems(); autoSave(); };
				
				// Drag and drop handlers
				itemRow.ondragstart = (e) => {
					e.dataTransfer.setData('text/plain', JSON.stringify({
						sectionIdx: idx,
						itemIdx: itemIdx,
						item: item
					}));
					itemRow.classList.add('dragging');
					dragHandle.style.cursor = 'grabbing';
				};
				
				itemRow.ondragend = (e) => {
					itemRow.classList.remove('dragging');
					dragHandle.style.cursor = 'grab';
					// Remove any drop indicators
					document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
				};
				
				itemRow.ondragover = (e) => {
					e.preventDefault();
					e.dataTransfer.dropEffect = 'move';
					
					// Show drop indicator
					const rect = itemRow.getBoundingClientRect();
					const mouseY = e.clientY;
					const itemMiddle = rect.top + rect.height / 2;
					
					// Remove existing indicators
					document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
					
					// Create new indicator
					const indicator = document.createElement('div');
					indicator.className = 'drop-indicator';
					
					if (mouseY < itemMiddle) {
						// Insert before this item
						itemRow.parentNode.insertBefore(indicator, itemRow);
					} else {
						// Insert after this item
						if (itemRow.nextSibling) {
							itemRow.parentNode.insertBefore(indicator, itemRow.nextSibling);
						} else {
							itemRow.parentNode.appendChild(indicator);
						}
					}
				};
				
				itemRow.ondragleave = (e) => {
					// Only remove indicators if we're leaving the entire container
					if (!e.relatedTarget || !itemRow.contains(e.relatedTarget)) {
						// Small delay to prevent flicker when moving between elements
						setTimeout(() => {
							if (!document.querySelector('.item-row:hover')) {
								document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
							}
						}, 50);
					}
				};
				
				itemRow.ondrop = (e) => {
					e.preventDefault();
					
					// Remove drop indicators
					document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
					
					try {
						const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
						const targetSectionIdx = parseInt(itemRow.dataset.sec);
						const targetItemIdx = parseInt(itemRow.dataset.itemIdx);
						
						// Don't drop on itself
						if (dragData.sectionIdx === targetSectionIdx && dragData.itemIdx === targetItemIdx) {
							return;
						}
						
						// Only allow reordering within the same section for now
						if (dragData.sectionIdx === targetSectionIdx) {
							// Determine if we're dropping before or after based on mouse position
							const rect = itemRow.getBoundingClientRect();
							const mouseY = e.clientY;
							const itemMiddle = rect.top + rect.height / 2;
							const dropBefore = mouseY < itemMiddle;
							
							// Calculate target position more reliably
							let newIdx = targetItemIdx;
							if (dropBefore) {
								newIdx = targetItemIdx;
							} else {
								newIdx = targetItemIdx + 1;
							}
							
							// Adjust for removing item first
							if (dragData.itemIdx < newIdx) {
								newIdx--;
							}
							
							// Don't do anything if dropping in same position
							if (dragData.itemIdx === newIdx) {
								return;
							}
							
							// Remove item from original position
							const movedItem = sec.items.splice(dragData.itemIdx, 1)[0];
							
							// Insert at new position
							sec.items.splice(newIdx, 0, movedItem);
							
							// Re-render and auto-save with small delay to ensure DOM is ready
							setTimeout(() => {
								renderItems();
								autoSave();
							}, 10);
						}
					} catch (error) {
						console.error('Drop failed:', error);
					}
				};
			});
		};
		renderItems();

		// Actions
		addItemBtn.onclick = () => { 
			sec.items.push({ label: 'New', text: '' }); 
			renderItems();
			autoSave(); // Auto-save when adding items
		};
		del.onclick = async () => { 
			const { profiles, activeId } = await loadProfiles();
			profiles[activeId].sections.splice(idx, 1); 
			await saveProfiles(profiles, activeId);
			await refreshSectionsOnly(); // Use smooth refresh instead of full rebuild
		};
		title.oninput = e => { sec.title = e.target.value; autoSave(); };
	});
}

// Helper function to capture current UI state
function captureCurrentSections() {
	const sectionHeaders = Array.from(document.querySelectorAll('#sectionsList .section-header'));
	return sectionHeaders.map((headerEl, idx) => {
		const titleInput = headerEl.querySelector('input');
		const title = (titleInput?.value || '').trim() || 'Section';
		const items = Array.from(document.querySelectorAll(`#sectionsList .item-row[data-sec="${idx}"]`)).map(row => {
			const inputs = row.querySelectorAll('input');
			return { label: inputs[0]?.value || '', text: inputs[1]?.value || '' };
		}).filter(i => (i.text || '').trim().length > 0);
		return { title, items };
	});
}

// Notification helper function
function showNotification(message, duration = 1000) {
	const saved = document.getElementById("saved");
	if (saved) {
		saved.textContent = message;
		saved.hidden = false;
		saved.classList.add('show');
		setTimeout(() => {
			saved.classList.remove('show');
			setTimeout(() => saved.hidden = true, 300); // Hide after animation completes
		}, duration);
	}
}

// Auto-save functionality
let autoSaveTimeout = null;

async function autoSave() {
	// Clear any pending auto-save
	if (autoSaveTimeout) {
		clearTimeout(autoSaveTimeout);
	}
	
	// Debounce auto-save to avoid excessive saves while typing
	autoSaveTimeout = setTimeout(async () => {
		try {
			const { profiles, activeId } = await loadProfiles();
			const builtSections = captureCurrentSections();
			
			const existingProfile = profiles[activeId] || createDefaultProfile();
			profiles[activeId] = { 
				...existingProfile, 
				sections: builtSections
			};
			
			await saveProfiles(profiles, activeId);
			
			// Show brief save feedback
			showNotification("Auto-saved", 800);
		} catch (error) {
			console.error('Auto-save failed:', error);
		}
	}, 500); // Wait 500ms after last change before saving
}

document.getElementById("addSection").addEventListener("click", async () => {
	const { profiles, activeId } = await loadProfiles();
	
	// First, capture current UI state to preserve any unsaved changes
	const currentSections = captureCurrentSections();
	
	// Add the new section to the captured state
	currentSections.push({ title: 'New Section', items: [] });
	
	// Update profile with captured state plus new section
	const currentProfile = profiles[activeId] || createDefaultProfile();
	profiles[activeId] = { 
		...currentProfile, 
		sections: currentSections
	};
	
	await saveProfiles(profiles, activeId);
	
	// Update sections without rebuilding entire UI to prevent jarring movement
	await refreshSectionsOnly();
	
	// Show brief save feedback
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
	select.onchange = async () => {
		await saveProfiles(profiles, select.value);
		const latest = await loadProfiles();
		await hydrateProfilesUI(); // Refresh the entire UI after profile change
	};
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
			console.log('Invalid drop area - drop cancelled');
			return false;
		}
	});

	async function renderSectionsEditor() {
		list.innerHTML = '';
		// Get fresh data to avoid stale references
		const { profiles: freshProfiles, activeId: freshActiveId } = await loadProfiles();
		const prof = freshProfiles[freshActiveId] || createDefaultProfile();
		const sections = Array.isArray(prof.sections) ? prof.sections : [];
		sections.forEach((sec, idx) => {
			// Header row for the section
			const headerRow = document.createElement('div');
			headerRow.className = 'row section-header';
			const drag = document.createElement('span'); drag.textContent = '≡';
			const title = document.createElement('input'); title.placeholder = 'Section title'; title.value = sec.title || '';
			title.addEventListener('input', autoSave); // Auto-save on title changes
			const addItemBtn = document.createElement('button'); addItemBtn.className = 'icon'; addItemBtn.textContent = '+'; addItemBtn.title = 'Add command to section';
			const del = document.createElement('button'); del.className = 'icon'; del.textContent = '✕';
			headerRow.appendChild(drag); headerRow.appendChild(title);
			// spacer for grid alignment
			const spacer = document.createElement('div'); spacer.style.minHeight = '1px'; headerRow.appendChild(spacer);
			headerRow.appendChild(addItemBtn); headerRow.appendChild(del);
			list.appendChild(headerRow);

			// Items in the section
			sec.items = Array.isArray(sec.items) ? sec.items : [];
			const renderItems = () => {
				// Remove any existing item rows for this section
				Array.from(list.querySelectorAll(`.item-row[data-sec="${idx}"]`)).forEach(n => n.remove());
				
				// Find the position to insert items (after this section's header)
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
					
					// Insert item immediately after the previous item (or header if first item)
					if (insertAfter.nextSibling) {
						list.insertBefore(itemRow, insertAfter.nextSibling);
					} else {
						list.appendChild(itemRow);
					}
					insertAfter = itemRow; // Next item should come after this one
					
					// Event handlers
					label.oninput = e => { item.label = e.target.value; autoSave(); };
					text.oninput = e => { item.text = e.target.value; autoSave(); };
					delI.onclick = () => { sec.items.splice(itemIdx,1); renderItems(); autoSave(); };
					
					// Drag and drop handlers
					itemRow.ondragstart = (e) => {
						e.dataTransfer.setData('text/plain', JSON.stringify({
							sectionIdx: idx,
							itemIdx: itemIdx,
							item: item
						}));
						itemRow.classList.add('dragging');
						dragHandle.style.cursor = 'grabbing';
					};
					
					itemRow.ondragend = (e) => {
						itemRow.classList.remove('dragging');
						dragHandle.style.cursor = 'grab';
						// Remove any drop indicators
						document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
					};
					
					itemRow.ondragover = (e) => {
						e.preventDefault();
						e.dataTransfer.dropEffect = 'move';
						
						// Show drop indicator
						const rect = itemRow.getBoundingClientRect();
						const mouseY = e.clientY;
						const itemMiddle = rect.top + rect.height / 2;
						
						// Remove existing indicators
						document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
						
						// Create new indicator
						const indicator = document.createElement('div');
						indicator.className = 'drop-indicator';
						
						if (mouseY < itemMiddle) {
							// Insert before this item
							itemRow.parentNode.insertBefore(indicator, itemRow);
						} else {
							// Insert after this item
							if (itemRow.nextSibling) {
								itemRow.parentNode.insertBefore(indicator, itemRow.nextSibling);
							} else {
								itemRow.parentNode.appendChild(indicator);
							}
						}
					};
					
					itemRow.ondragleave = (e) => {
						// Only remove indicators if we're leaving the entire container
						if (!e.relatedTarget || !itemRow.contains(e.relatedTarget)) {
							// Small delay to prevent flicker when moving between elements
							setTimeout(() => {
								if (!document.querySelector('.item-row:hover')) {
									document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
								}
							}, 50);
						}
					};
					
					itemRow.ondrop = (e) => {
						e.preventDefault();
						
						// Remove drop indicators
						document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
						
						try {
							const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
							const targetSectionIdx = parseInt(itemRow.dataset.sec);
							const targetItemIdx = parseInt(itemRow.dataset.itemIdx);
							
							// Don't drop on itself
							if (dragData.sectionIdx === targetSectionIdx && dragData.itemIdx === targetItemIdx) {
								return;
							}
							
							// Only allow reordering within the same section for now
							if (dragData.sectionIdx === targetSectionIdx) {
								// Determine if we're dropping before or after based on mouse position
								const rect = itemRow.getBoundingClientRect();
								const mouseY = e.clientY;
								const itemMiddle = rect.top + rect.height / 2;
								const dropBefore = mouseY < itemMiddle;
								
								// Calculate target position more reliably
								let newIdx = targetItemIdx;
								if (dropBefore) {
									newIdx = targetItemIdx;
								} else {
									newIdx = targetItemIdx + 1;
								}
								
								// Adjust for removing item first
								if (dragData.itemIdx < newIdx) {
									newIdx--;
								}
								
								// Don't do anything if dropping in same position
								if (dragData.itemIdx === newIdx) {
									return;
								}
								
								// Remove item from original position
								const movedItem = sec.items.splice(dragData.itemIdx, 1)[0];
								
								// Insert at new position
								sec.items.splice(newIdx, 0, movedItem);
								
								// Re-render and auto-save with small delay to ensure DOM is ready
								setTimeout(() => {
									renderItems();
									autoSave();
								}, 10);
							}
						} catch (error) {
							console.error('Drop failed:', error);
						}
					};
				});
			};
			renderItems();

			// Actions
			addItemBtn.onclick = () => { 
				sec.items.push({ label: 'New', text: '' }); 
				renderItems();
				autoSave(); // Auto-save when adding items
			};
			del.onclick = async () => { 
				const { profiles, activeId } = await loadProfiles();
				profiles[activeId].sections.splice(idx, 1); 
				await saveProfiles(profiles, activeId);
				await renderSectionsEditor(); 
			};
			title.oninput = e => { sec.title = e.target.value; autoSave(); };
		});
	}
	await renderSectionsEditor();
}

(async () => {
	await hydrateProfilesUI();
})();


