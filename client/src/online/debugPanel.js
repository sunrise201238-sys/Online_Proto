import { createConnection } from './connection.js';

let activePanel = null;

export function showOnlineDebugPanel(parent) {
  if (activePanel) {
    activePanel.remove();
    activePanel = null;
  }

  const conn = createConnection();
  conn.open();

  const panel = document.createElement('div');
  panel.className = 'menu online-debug-panel';
  panel.innerHTML = `
    <h2>Online — Debug Connect</h2>
    <div class="online-status">
      <div><span class="lbl">Server:</span> <span class="val" data-bind="server">${conn.serverUrl}</span></div>
      <div><span class="lbl">Status:</span> <span class="val" data-bind="status">connecting…</span></div>
      <div><span class="lbl">Player ID:</span> <span class="val" data-bind="playerId">—</span></div>
      <div><span class="lbl">Snapshots:</span> <span class="val" data-bind="snapshots">0 (0 Hz)</span></div>
      <div><span class="lbl">Last error:</span> <span class="val" data-bind="error">—</span></div>
    </div>
    <div class="online-events">
      <div class="lbl">Events (snapshots filtered out):</div>
      <pre data-bind="events">(none yet)</pre>
    </div>
    <button data-action="reconnect">Reconnect</button>
    <button data-action="close">Close</button>
  `;
  parent.appendChild(panel);
  activePanel = panel;

  const bindings = {
    status: panel.querySelector('[data-bind="status"]'),
    playerId: panel.querySelector('[data-bind="playerId"]'),
    snapshots: panel.querySelector('[data-bind="snapshots"]'),
    error: panel.querySelector('[data-bind="error"]'),
    events: panel.querySelector('[data-bind="events"]')
  };

  const formatEvent = (e) => {
    const ts = new Date(e.t).toLocaleTimeString();
    const payload = e.payload ? JSON.stringify(e.payload) : '';
    return `[${ts}] ${e.kind}  ${payload}`;
  };

  // Track snapshot rate over a 1s sliding window so we can show Hz instead
  // of letting 40 events/sec push real signals out of the log.
  const snapshotTimes = [];
  const render = () => {
    bindings.status.textContent = conn.isConnected() ? 'connected' : 'disconnected';
    bindings.status.dataset.state = conn.isConnected() ? 'ok' : 'off';
    bindings.playerId.textContent = conn.getPlayerId() ?? '—';
    bindings.error.textContent = conn.getLastError() ?? '—';

    const allEvents = conn.getEvents();
    const now = Date.now();
    snapshotTimes.length = 0;
    let totalSnapshots = 0;
    for (const e of allEvents) {
      if (e.kind === 'match:snapshot') {
        totalSnapshots += 1;
        if (now - e.t < 1000) snapshotTimes.push(e.t);
      }
    }
    bindings.snapshots.textContent = `${totalSnapshots} (${snapshotTimes.length} Hz)`;

    const interesting = allEvents.filter((e) => e.kind !== 'match:snapshot');
    bindings.events.textContent = interesting.length
      ? interesting.map(formatEvent).join('\n')
      : '(none yet)';
    bindings.events.scrollTop = bindings.events.scrollHeight;
  };

  const unsubscribe = conn.onUpdate(render);
  render();

  panel.querySelector('[data-action="reconnect"]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    conn.close();
    // Give the server time to process the disconnect before reconnecting,
    // otherwise the new socket sees the old slot still held and gets bumped.
    setTimeout(() => conn.open(), 350);
  });

  panel.querySelector('[data-action="close"]').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unsubscribe();
    conn.close();
    panel.remove();
    activePanel = null;
  });
}
