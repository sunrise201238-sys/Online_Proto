import{c as p}from"./index-BUZtMzc6.js";let s=null;function u(l){s&&(s.remove(),s=null);const e=p();e.open();const t=document.createElement("div");t.className="menu online-debug-panel",t.innerHTML=`
    <h2>Refresh page after boot-up</h2>
    <div class="online-status">
      <div><span class="lbl">Server:</span> <span class="val" data-bind="server">${e.serverUrl}</span></div>
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
  `,l.appendChild(t),s=t;const a={status:t.querySelector('[data-bind="status"]'),playerId:t.querySelector('[data-bind="playerId"]'),snapshots:t.querySelector('[data-bind="snapshots"]'),error:t.querySelector('[data-bind="error"]'),events:t.querySelector('[data-bind="events"]')},r=n=>{const c=new Date(n.t).toLocaleTimeString(),i=n.payload?JSON.stringify(n.payload):"";return`[${c}] ${n.kind}  ${i}`},o=()=>{a.status.textContent=e.isConnected()?"connected":"disconnected",a.status.dataset.state=e.isConnected()?"ok":"off",a.playerId.textContent=e.getPlayerId()??"—",a.error.textContent=e.getLastError()??"—",a.snapshots.textContent=`${e.getSnapshotCount()} (${e.getSnapshotHz()} Hz)`;const n=e.getEvents();a.events.textContent=n.length?n.map(r).join(`
`):"(none yet)",a.events.scrollTop=a.events.scrollHeight},d=e.onUpdate(o);o(),t.querySelector('[data-action="reconnect"]').addEventListener("pointerdown",n=>{n.preventDefault(),e.close(),setTimeout(()=>e.open(),350)}),t.querySelector('[data-action="close"]').addEventListener("pointerdown",n=>{n.preventDefault(),d(),e.close(),t.remove(),s=null})}export{u as showOnlineDebugPanel};
