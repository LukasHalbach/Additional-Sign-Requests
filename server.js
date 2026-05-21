const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// JSON file storage
// ---------------------------------------------------------------------------
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.json');

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { invoices: [], signs: [] };
  }
}

function writeDb(data) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function nextSignId(signs) {
  return signs.length === 0 ? 1 : Math.max(...signs.map(s => s.id)) + 1;
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// GET /api/signs?invoice=X
app.get('/api/signs', (req, res) => {
  const { invoice } = req.query;
  if (!invoice) return res.status(400).json({ error: 'invoice param required' });
  const { signs } = readDb();
  res.json(signs.filter(s => s.invoiceId === invoice));
});

// GET /api/invoices
app.get('/api/invoices', (req, res) => {
  const { invoices } = readDb();
  res.json([...invoices].reverse());
});

// POST /api/invoices
app.post('/api/invoices', (req, res) => {
  const { invoiceId, eventName } = req.body;
  if (!invoiceId || !eventName) {
    return res.status(400).json({ error: 'invoiceId and eventName required' });
  }
  const db = readDb();
  if (db.invoices.find(i => i.invoiceId === invoiceId)) {
    return res.json({ existed: true, invoiceId, eventName });
  }
  db.invoices.push({ invoiceId, eventName, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ existed: false, invoiceId, eventName });
});

// POST /api/signs
app.post('/api/signs', (req, res) => {
  const { invoiceId, eventName, signs } = req.body;
  if (!invoiceId || !eventName || !Array.isArray(signs) || signs.length === 0) {
    return res.status(400).json({ error: 'invoiceId, eventName, and signs[] required' });
  }
  if (signs.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 signs per submission' });
  }
  const valid = signs.filter(s => s.description && s.description.trim());
  if (valid.length === 0) {
    return res.status(400).json({ error: 'No valid signs provided' });
  }
  const db = readDb();
  const now = new Date().toISOString();
  valid.forEach(s => {
    db.signs.push({
      id: nextSignId(db.signs),
      invoiceId,
      eventName,
      description: s.description.trim(),
      quantity: Number(s.quantity) || 1,
      submittedAt: now,
      addedToSystem: false,
    });
  });
  writeDb(db);
  res.json({ saved: valid.length });
});

// PATCH /api/signs/:id
app.patch('/api/signs/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { addedToSystem } = req.body;
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const db = readDb();
  const sign = db.signs.find(s => s.id === id);
  if (!sign) return res.status(404).json({ error: 'Sign not found' });
  sign.addedToSystem = !!addedToSystem;
  writeDb(db);
  res.json({ ok: true });
});

// DELETE /api/invoices/:invoiceId
// Removes the invoice record and all associated signs
app.delete('/api/invoices/:invoiceId', (req, res) => {
  const { invoiceId } = req.params;
  const db = readDb();
  const existed = db.invoices.some(i => i.invoiceId === invoiceId);
  if (!existed) return res.status(404).json({ error: 'Invoice not found' });
  db.invoices = db.invoices.filter(i => i.invoiceId !== invoiceId);
  db.signs = db.signs.filter(s => s.invoiceId !== invoiceId);
  writeDb(db);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TSi Sign Survey running on http://localhost:${PORT}`));
