/**
 * CSS Lab — backend
 * A small Express API that serves the single-page site and stores each
 * visitor's playground settings.
 *
 *   node server.js            →  http://localhost:3000
 *   PORT=8080 node server.js  →  http://localhost:8080
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');
const VERSION = '1.0.0';
const STARTED = new Date();

/* ---------- tiny JSON store (no database needed) ---------- */
function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { visits: 0, settings: {}, lastSavedAt: null };
  }
}
function writeStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

/* ---------- middleware ---------- */
app.use(express.json({ limit: '64kb' }));

// log every API call so the terminal shows the project working
app.use('/api', (req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t0} ms)`);
  });
  next();
});

/* ---------- API ---------- */
// 1. health check — the endpoint used to answer "is the backend running?"
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'css-lab-api',
    version: VERSION,
    startedAt: STARTED.toISOString(),
    uptimeSeconds: Math.round((Date.now() - STARTED.getTime()) / 1000),
    timestamp: new Date().toISOString()
  });
});

// 2. simple statistics for the footer badge
app.get('/api/stats', (req, res) => {
  const store = readStore();
  res.json({
    visits: store.visits,
    savedSettings: Object.keys(store.settings).length,
    lastSavedAt: store.lastSavedAt
  });
});

// 3. visit counter — called once when the page loads
app.post('/api/visits', (req, res) => {
  const store = readStore();
  store.visits += 1;
  writeStore(store);
  res.status(201).json({ visits: store.visits });
});

// 4. read a visitor's saved settings
app.get('/api/settings/:deviceId', (req, res) => {
  const store = readStore();
  const found = store.settings[req.params.deviceId];
  if (!found) return res.status(404).json({ error: 'No settings saved for this device' });
  res.json(found);
});

// 5. save (or replace) a visitor's settings
app.put('/api/settings/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const body = req.body || {};

  if (!/^[a-zA-Z0-9-]{6,40}$/.test(deviceId)) {
    return res.status(400).json({ error: 'deviceId must be 6-40 letters, digits or dashes' });
  }
  const bad = validate(body);
  if (bad) return res.status(422).json({ error: bad });

  const store = readStore();
  store.settings[deviceId] = {
    ...body,
    updatedAt: new Date().toISOString()
  };
  store.lastSavedAt = store.settings[deviceId].updatedAt;
  writeStore(store);

  res.json({ saved: true, deviceId, updatedAt: store.settings[deviceId].updatedAt });
});

// 6. delete a visitor's settings
app.delete('/api/settings/:deviceId', (req, res) => {
  const store = readStore();
  if (!store.settings[req.params.deviceId]) {
    return res.status(404).json({ error: 'Nothing to delete' });
  }
  delete store.settings[req.params.deviceId];
  writeStore(store);
  res.json({ deleted: true });
});

/** Very small validation of the payload the page sends. */
function validate(body) {
  const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

  if (body.fonts) {
    const f = body.fonts;
    if (typeof f.family !== 'string' || f.family.length > 120) return 'fonts.family must be a short string';
    if (!num(f.size, 8, 96)) return 'fonts.size must be between 8 and 96';
    if (!num(f.weight, 100, 900)) return 'fonts.weight must be between 100 and 900';
    if (!num(f.lineHeight, 0.8, 4)) return 'fonts.lineHeight must be between 0.8 and 4';
    if (!num(f.letterSpacing, -2, 20)) return 'fonts.letterSpacing must be between -2 and 20';
  }
  if (body.borders) {
    const b = body.borders;
    const styles = ['solid', 'dashed', 'dotted', 'double', 'groove', 'none'];
    if (!styles.includes(b.style)) return 'borders.style is not a known border style';
    if (!num(b.width, 0, 40)) return 'borders.width must be between 0 and 40';
    if (typeof b.radius !== 'string' || !/^\d{1,3}(px|%)$/.test(b.radius)) return 'borders.radius must look like 12px or 50%';
    if (typeof b.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(b.color)) return 'borders.color must be a hex colour';
  }
  if (body.boxModel) {
    const m = body.boxModel;
    if (!num(m.width, 60, 1200)) return 'boxModel.width must be between 60 and 1200';
    if (!num(m.padding, 0, 200)) return 'boxModel.padding must be between 0 and 200';
    if (!num(m.borderWidth, 0, 40)) return 'boxModel.borderWidth must be between 0 and 40';
    if (!num(m.margin, 0, 200)) return 'boxModel.margin must be between 0 and 200';
    if (!['content-box', 'border-box'].includes(m.sizing)) return 'boxModel.sizing must be content-box or border-box';
  }
  return null;
}

/* ---------- static site ---------- */
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// unknown API routes stay JSON, not HTML
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown endpoint', path: req.originalUrl }));

// anything else goes to the single-page site
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- start ---------- */
const server = app.listen(PORT, () => {
  console.log(`CSS Lab backend v${VERSION} listening on http://localhost:${PORT}`);
  console.log(`Health check:  http://localhost:${PORT}/api/health`);
});

// export for the test script
module.exports = { app, server };
