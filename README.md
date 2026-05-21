# TSi – Additional Sign Requests

A sign survey web app for TSi print/sign shop. Managers generate shareable client links; clients submit sign requests; managers track which signs have been added to the production system.

Data is stored in a local **SQLite** database (`signs.db`) — no external accounts or services required.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000`. The `signs.db` file is created automatically on first run.

That's it.

---

## Optional configuration

Copy `.env.example` to `.env` if you want to change defaults:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Port the server listens on |
| `DB_PATH` | `./signs.db` | Path to the SQLite database file |

---

## Usage

### Manager View (`/`)

- **Generate Link tab**: Enter an Invoice ID and Event Name → click Generate → copy the shareable URL and send it to the client.
- **Review Submissions tab**: Select an invoice from the dropdown to see all submitted signs. Check the "Added to System" checkbox for each sign as you process it. A progress bar tracks completion.

### Client View (`/?invoice=INV-123&event=Event+Name`)

Clients open the link you shared. They see:

- A banner with the event name and invoice number.
- Any signs already submitted (read-only with status badges).
- A form to add new signs — description + quantity. Starts with 1 row, up to 100 rows per submission.

---

## Deployment (VPS)

```bash
npm install --production

# Run with PM2 for auto-restart
npm install -g pm2
pm2 start server.js --name tsi-signs
pm2 save && pm2 startup
```

Back up `signs.db` regularly — it's the only file that holds your data.

Then reverse-proxy with nginx or Caddy to expose on port 80/443.
