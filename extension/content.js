// Runs on https://webreg.usc.edu/* only. Loads the planner panel once and never touches WebReg's own controls.
(() => {
  if (window.__trojanPlannerBooted) return;
  window.__trojanPlannerBooted = true;
  const ready = import(chrome.runtime.getURL('src/panel.js')).then(module => module.mountPlanner({ demo: false }));
  ready.catch(() => { window.__trojanPlannerBooted = false; });
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type !== 'trojan-planner:open') return;
    ready.then(async planner => {
      if (message.demo) { const { mountPlanner } = await import(chrome.runtime.getURL('src/panel.js')); await mountPlanner({ demo: true }); }
      else planner.open();
      reply({ ok: true });
    }).catch(() => reply({ ok: false }));
    return true; // keep the message channel open for the async reply
  });
})();
