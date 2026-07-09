document.getElementById("openOptions").addEventListener("click", (e) => {
	e.preventDefault();
	chrome.runtime.openOptionsPage();
});

function showPopupError(message) {
	const errEl = document.getElementById("popupError");
	if (!errEl) return;
	errEl.textContent = message;
	errEl.hidden = false;
}

document.getElementById("toggleOverlay").addEventListener("click", () => {
	const btn = document.getElementById("toggleOverlay");
	const errEl = document.getElementById("popupError");
	btn.disabled = true;
	if (errEl) errEl.hidden = true;

	chrome.runtime.sendMessage({ type: "TQC_TOGGLE_OVERLAY_FROM_POPUP" }, (response) => {
		btn.disabled = false;

		if (chrome.runtime.lastError) {
			showPopupError(chrome.runtime.lastError.message);
			return;
		}
		if (!response?.ok) {
			showPopupError(response?.error || "Could not open panel. Open a Twitch tab and try again.");
			return;
		}

		window.close();
	});
});

