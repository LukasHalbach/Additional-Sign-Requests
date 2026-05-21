require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// SQLite setup
// ---------------------------------------------------------------------------
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'signs.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    invoiceId TEXT PRIMARY KEY,
    eventName TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    invoiceId  TEXT NOT NULL,
    eventName  TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity   INTEGER NOT NULL DEFAULT 1,
    submittedAt TEXT NOT NULL,
    addedToSystem INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (invoiceId) REFERENCES invoices(invoiceId)
  );

  CREATE INDEX IF NOT EXISTS idx_signs_invoice ON signs(invoiceId);
`);

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// GET /api/signs?invoice=X
app.get('/api/signs', (req, res) => {
  const { invoice } = req.query;
  if (!invoice) return res.status(400).json({ error: 'invoice param required' });

  const signs = db
    .prepare('SELECT * FROM signs WHERE invoiceId = ? ORDER BY submittedAt ASC, id ASC')
    .all(invoice)
    .map(row => ({ ...row, addedToSystem: row.addedToSystem === 1 }));

  res.json(signs);
});

// GET /api/invoices
app.get('/api/invoices', (req, res) => {
  const invoices = db
    .prepare('SELECT * FROM invoices ORDER BY createdAt DESC')
    .all();
  res.json(invoices);
});

// POST /api/invoices
app.post('/api/invoices', (req, res) => {
  const { invoiceId, eventName } = req.body;
  if (!invoiceId || !eventName) {
    return res.status(400).json({ error: 'invoiceId and eventName required' });
  }

  const existing = db
    .prepare('SELECT invoiceId FROM invoices WHERE invoiceId = ?')
    .get(invoiceId);

  if (existing) {
    return res.json({ existed: true, invoiceId, eventName });
  }

  db.prepare('INSERT INTO invoices (invoiceId, eventName, createdAt) VALUES (?, ?, ?)')
    .run(invoiceId, eventName, new Date().toISOString());

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

  const now = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO signs (invoiceId, eventName, description, quantity, submittedAt, addedToSystem) VALUES (?, ?, ?, ?, ?, 0)'
  );

  const insertMany = db.transaction(items => {
    for (const s of items) {
      insert.run(invoiceId, eventName, s.description.trim(), Number(s.quantity) || 1, now);
    }
  });

  insertMany(valid);
  res.json({ saved: valid.length });
});

// PATCH /api/signs/:id
app.patch('/api/signs/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { addedToSystem } = req.body;
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  db.prepare('UPDATE signs SET addedToSystem = ? WHERE id = ?')
    .run(addedToSystem ? 1 : 0, id);

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TSi Sign Survey running on http://localhost:${PORT}`));
