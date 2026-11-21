const SELECT = "ask-simo";
const CAPTURE = "attach-simo-screenshot";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({id: SELECT, title: "Ask Simo about this selection", contexts: ["selection"]});
  chrome.contextMenus.create({
    id: CAPTURE,
    title: "Attach this tab’s screenshot to Simo",
    contexts: ["page", "selection"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
});

chrome.action.onClicked.addListener(tab => {
  if (tab.windowId !== undefined) {
    chrome.sidePanel.open({windowId: tab.windowId}).catch(console.warn);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.windowId === undefined || ![SELECT, CAPTURE].includes(info.menuItemId)) return;
  const opened = chrome.sidePanel.open({windowId: tab.windowId});
  const getDraft = info.menuItemId === SELECT
    ? Promise.resolve({text: (info.selectionText || "").trim().slice(0, 12000)})
    : capture(tab);
  const key = "draft:" + tab.windowId;
  Promise.allSettled([opened, getDraft]).then(([, result]) => {
    const draft = result.status === "fulfilled" ? result.value : {error: "Couldn’t capture this tab. Try pasting a screenshot into Simo."};
    return chrome.storage.session.set({[key]: draft});
  }).catch(console.warn);
});

async function capture(expected) {
  const activeTab = async () => (await chrome.tabs.query({active: true, windowId: expected.windowId}))[0];
  const before = await activeTab();
  if (before?.id !== expected.id || before.url !== expected.url) throw new Error("Tab changed");
  const image = await chrome.tabs.captureVisibleTab(expected.windowId, {format: "jpeg", quality: 82});
  const after = await activeTab();
  if (after?.id !== expected.id || after.url !== expected.url) throw new Error("Tab changed");
  if (image.length > 2500000) return {error: "This capture is too large. Paste or choose a smaller screenshot."};
  return {image};
}
