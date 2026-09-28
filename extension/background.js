chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PICKER' });
  } catch (err) {
    // Content script chưa được inject (vd trang đã mở trước khi cài extension).
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PICKER' });
    } catch (err2) {
      console.error('Không thể bật chế độ chọn vùng trên tab này:', err2);
    }
  }
});
