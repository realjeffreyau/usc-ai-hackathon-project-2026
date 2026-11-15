// Popup: asks the planner on the active tab to open. If the tab is not WebReg, open the bundled demo page instead.
const status = document.getElementById('status');
async function ask(demo) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: 'trojan-planner:open', demo });
    if (reply?.ok) { window.close(); return; }
  } catch { /* no planner on this tab */ }
  if (demo) {
    status.textContent = 'This tab is not WebReg. Opening the demo page.';
    await chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') });
    window.close();
  } else {
    status.textContent = 'Open webreg.usc.edu in this tab first, or choose Try demo.';
  }
}
document.getElementById('demo').addEventListener('click', () => ask(true));
document.getElementById('open').addEventListener('click', () => ask(false));
