document.getElementById("openOptions").addEventListener("click", (e) => {
	e.preventDefault();
	chrome.runtime.openOptionsPage();
});

document.getElementById("toggleOverlay").addEventListener("click", async () => {
	chrome.runtime.sendMessage({ type: "TQC_TOGGLE_OVERLAY_FROM_POPUP" }, () => window.close());
});




