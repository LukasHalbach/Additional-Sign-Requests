require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Google Sheets auth
// ---------------------------------------------------------------------------
function getAuthClient() {
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_KEY_FILE) {
    credentials = require(path.resolve(process.env.GOOGLE_KEY_FILE));
  } else {
    throw new Error('No Google credentials configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_KEY_FILE in .env');
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheets() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
// Sheet names
const SHEET_SIGNS = 'Signs';
const SHEET_INVOICES = 'Invoices';

// Column layout for Signs sheet:
// A: invoiceId | B: eventName | C: description | D: quantity | E: submittedAt | F: addedToSystem (TRUE/FALSE)
const SIGNS_RANGE = `${SHEET_SIGNS}!A:F`;

// ---------------------------------------------------------------------------
// Ensure sheets and headers exist on first run
// ---------------------------------------------------------------------------
async function ensureSheets() {
  const sheets = await getSheets();

  // Get existing sheet names
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingNames = meta.data.sheets.map(s => s.properties.title);

  const requests = [];
  if (!existingNames.includes(SHEET_SIGNS)) {
    requests.push({ addSheet: { properties: { title: SHEET_SIGNS } } });
  }
  if (!existingNames.includes(SHEET_INVOICES)) {
    requests.push({ addSheet: { properties: { title: SHEET_INVOICES } } });
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  }

  // Write headers if rows are empty
  const signsCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_SIGNS}!A1`,
  });
  if (!signsCheck.data.values) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_SIGNS}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['invoiceId', 'eventName', 'description', 'quantity', 'submittedAt', 'addedToSystem']] },
    });
  }

  const invoicesCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_INVOICES}!A1`,
  });
  if (!invoicesCheck.data.values) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_INVOICES}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['invoiceId', 'eventName', 'createdAt']] },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getAllSignRows() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SIGNS_RANGE,
  });
  return res.data.values || [];
}

function rowToSign(row, index) {
  return {
    rowIndex: index, // 1-based sheet row (row 1 = header, data starts at 2)
    invoiceId: row[0] || '',
    eventName: row[1] || '',
    description: row[2] || '',
    quantity: Number(row[3]) || 0,
    submittedAt: row[4] || '',
    addedToSystem: (row[5] || '').toUpperCase() === 'TRUE',
  };
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// GET /api/signs?invoice=X
// Returns all signs for a given invoice (used by both views)
app.get('/api/signs', async (req, res) => {
  const { invoice } = req.query;
  if (!invoice) return res.status(400).json({ error: 'invoice param required' });

  try {
    const rows = await getAllSignRows();
    const signs = rows
      .slice(1) // skip header
      .map((row, i) => rowToSign(row, i + 2))
      .filter(s => s.invoiceId === invoice);
    res.json(signs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices
// Returns all distinct invoices (for manager view tab 2)
app.get('/api/invoices', async (req, res) => {
  try {
    const sheets = await getSheets();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_INVOICES}!A:C`,
    });
    const rows = (result.data.values || []).slice(1);
    const invoices = rows.map(row => ({
      invoiceId: row[0] || '',
      eventName: row[1] || '',
      createdAt: row[2] || '',
    }));
    res.json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices
// Creates a new invoice record (manager generates link)
app.post('/api/invoices', async (req, res) => {
  const { invoiceId, eventName } = req.body;
  if (!invoiceId || !eventName) {
    return res.status(400).json({ error: 'invoiceId and eventName required' });
  }

  try {
    const sheets = await getSheets();

    // Check if already exists
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_INVOICES}!A:A`,
    });
    const existing = (result.data.values || []).flat();
    if (existing.includes(invoiceId)) {
      return res.json({ existed: true, invoiceId, eventName });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_INVOICES}!A:C`,
      valueInputOption: 'RAW',
      requestBody: { values: [[invoiceId, eventName, new Date().toISOString()]] },
    });
    res.json({ existed: false, invoiceId, eventName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/signs
// Submits new signs for an invoice
app.post('/api/signs', async (req, res) => {
  const { invoiceId, eventName, signs } = req.body;
  if (!invoiceId || !eventName || !Array.isArray(signs) || signs.length === 0) {
    return res.status(400).json({ error: 'invoiceId, eventName, and signs[] required' });
  }
  if (signs.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 signs per submission' });
  }

  const now = new Date().toISOString();
  const rows = signs
    .filter(s => s.description && s.description.trim())
    .map(s => [invoiceId, eventName, s.description.trim(), Number(s.quantity) || 1, now, 'FALSE']);

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid signs provided' });
  }

  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: SIGNS_RANGE,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
    res.json({ saved: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/signs/:rowIndex
// Toggles addedToSystem for a sign (manager view)
app.patch('/api/signs/:rowIndex', async (req, res) => {
  const rowIndex = parseInt(req.params.rowIndex, 10);
  const { addedToSystem } = req.body;
  if (isNaN(rowIndex) || rowIndex < 2) {
    return res.status(400).json({ error: 'Invalid rowIndex' });
  }

  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_SIGNS}!F${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[addedToSystem ? 'TRUE' : 'FALSE']] },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

ensureSheets()
  .then(() => {
    app.listen(PORT, () => console.log(`TSi Sign Survey running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialize sheets:', err.message);
    process.exit(1);
  });
