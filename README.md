# TSi – Additional Sign Requests

A sign survey web app for TSi print/sign shop. Managers generate shareable client links; clients submit sign requests; managers track which signs have been added to the production system.

## Quick Start

### 1. Set up Google Sheets

1. Create a new Google Sheet (note the spreadsheet ID from the URL).
2. Create a [Google Cloud service account](https://console.cloud.google.com/iam-admin/serviceaccounts):
   - Enable the **Google Sheets API** for your project.
   - Create a service account and download the JSON key file.
3. Share your Google Sheet with the service account's email address (give it **Editor** access).

The app will automatically create two sheets (`Signs` and `Invoices`) with the correct headers on first run.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_KEY_FILE=./service-account-key.json   # path to downloaded key file
PORT=3000
```

Or paste the service account JSON inline:

```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}
```

### 3. Install and run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

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

## Data Structure (Google Sheets)

**Signs sheet** (`A:F`):

| invoiceId | eventName | description | quantity | submittedAt | addedToSystem |
|-----------|-----------|-------------|----------|-------------|---------------|

**Invoices sheet** (`A:C`):

| invoiceId | eventName | createdAt |
|-----------|-----------|-----------|

---

## Deployment (VPS)

```bash
# Install dependencies
npm install --production

# Run with PM2 for auto-restart
npm install -g pm2
pm2 start server.js --name tsi-signs
pm2 save
pm2 startup
```

Then reverse-proxy with nginx or Caddy to expose on port 80/443.
