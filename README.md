# gvg-online

Online 1v1 mecha versus battler. Server-authoritative simulation with client-side prediction.

Built on top of the offline `Proto-Proto_0.1.7` prototype. The offline single-player loop is preserved; the online flow is layered on top.

## Layout

- `client/` — Three.js + cannon-es + Vite frontend
- `server/` — Node + Socket.IO authoritative game server
- `shared/` — pure-JS game logic that both client and server consume
- `render.yaml` — Render blueprint (free-tier deploy of both services)
- `PLAN.md` — phased implementation roadmap

## Local development

Install all workspace dependencies from the repo root:

```
npm install
```

Run the server (terminal 1):

```
npm run dev:server
```

Run the client (terminal 2):

```
npm run dev:client
```

Open <http://localhost:5173>. Click **Online (Debug Connect)** in the unit-select menu. You should see a debug panel with `connected = true`, a `playerId` (`p1` or `p2`), and a `match:hello` event from the server. That's the Phase 0 round-trip.

## Deployment (Render)

The repo ships with `render.yaml` defining two free-tier services:

- `gvg-server` — Node web service (the Socket.IO server)
- `gvg-client` — static site (the Vite-built client)

After the first deploy, set the client's `VITE_SERVER_URL` environment variable in the Render dashboard to your server's public URL (e.g. `https://gvg-server-xxxx.onrender.com`) and redeploy the client. The server's URL is shown on its Render service page.

> Free-tier services spin down after ~15 min idle. First connection to a cold server takes 30–60s. Acceptable for prototype, not for production.

## Phases

See [`PLAN.md`](./PLAN.md) for the five-phase roadmap and what's currently in progress.
