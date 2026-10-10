// Opens the side panel only after the user clicks the extension toolbar icon.
chrome.action.onClicked.addListener(function (tab) {
  if (typeof tab.id !== "number") return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(function (error) {
    console.warn("Best-Image Companion could not open the side panel:", error);
  });
});