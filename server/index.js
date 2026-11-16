import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Feature Flag for Database Caching
const ENABLE_DB_CACHE = process.env.USE_DATABASE !== 'false';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'products.db');

// Initialise Database with high-efficiency PRAGMAs (minimal RAM & WAL mode)
let db;
if (ENABLE_DB_CACHE) {
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -2000'); // Frugal memory cap: ~2MB RAM cache
  db.pragma('temp_store = MEMORY');

  // Create users table with salt support
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      salt TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add salt to users if missing
  const userCols = db.prepare('PRAGMA table_info(users)').all();
  if (!userCols.find(c => c.name === 'salt')) {
    db.exec('ALTER TABLE users ADD COLUMN salt TEXT DEFAULT ""');
  }

  // Create sessions table with expiration
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME DEFAULT (datetime('now', '+30 days')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add expires_at to sessions if missing
  const sessionCols = db.prepare('PRAGMA table_info(sessions)').all();
  if (!sessionCols.find(c => c.name === 'expires_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN expires_at DATETIME DEFAULT (datetime("now", "+30 days"))');
  }

  // Auto-clean expired sessions on startup
  try {
    db.exec('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');
  } catch (e) {
    console.error('Session cleanup error:', e.message);
  }

  // Create workspaces table (Tenant-isolated per user_id)
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add user_id to workspaces if missing
  const wsCols = db.prepare('PRAGMA table_info(workspaces)').all();
  if (!wsCols.find(c => c.name === 'user_id')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN user_id INTEGER DEFAULT 1');
  }

  // Ensure default admin user
  if (!db.prepare('SELECT id FROM users WHERE id = 1').get()) {
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin';
    const hash = crypto.createHash('sha256').update(adminPassword).digest('hex');
    db.prepare('INSERT INTO users (id, username, password) VALUES (1, ?, ?)').run('admin', hash);
  }

  // Create products table with tenant isolation (user_id + workspace_id)
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT,
      workspace_id INTEGER DEFAULT 1,
      user_id INTEGER DEFAULT 1,
      url TEXT,
      title TEXT,
      image TEXT,
      price TEXT,
      size TEXT,
      is_favorite INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, workspace_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add user_id to products if missing and backfill from workspace
  const productCols = db.prepare('PRAGMA table_info(products)').all();
  if (!productCols.find(c => c.name === 'user_id')) {
    db.exec('ALTER TABLE products ADD COLUMN user_id INTEGER DEFAULT 1');
    try {
      db.exec(`
        UPDATE products 
        SET user_id = (SELECT user_id FROM workspaces WHERE workspaces.id = products.workspace_id)
        WHERE user_id IS NULL OR user_id = 1
      `);
    } catch (e) {
      console.error('Backfill products user_id error:', e.message);
    }
  }

  // Tenant-isolation indexes for rapid querying and zero scan overhead
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
    CREATE INDEX IF NOT EXISTS idx_products_favorite ON products(user_id, is_favorite);
    CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  // Insert default workspace if not exists
  const defaultWorkspace = db.prepare('SELECT COUNT(*) as count FROM workspaces').get();
  if (defaultWorkspace.count === 0) {
    db.prepare('INSERT INTO workspaces (name) VALUES (?)').run('My Collection');
  }
}

// Built-in scrypt Password Hashing (Zero dependencies, memory-hard security)
const hashPassword = (password) => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve({ salt, hash: derivedKey.toString('hex') });
    });
  });
};

const verifyPassword = (password, salt, storedHash) => {
  return new Promise((resolve, reject) => {
    if (!salt) {
      // Legacy SHA-256 fallback with timing-safe comparison
      const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
      const legBuf = Buffer.from(legacyHash, 'utf8');
      const storeBuf = Buffer.from(storedHash, 'utf8');
      if (legBuf.length !== storeBuf.length) return resolve(false);
      return resolve(crypto.timingSafeEqual(legBuf, storeBuf));
    }
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      const keyBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
      const hashBuffer = Buffer.from(storedHash, 'hex');
      if (keyBuffer.length !== hashBuffer.length) return resolve(false);
      resolve(crypto.timingSafeEqual(keyBuffer, hashBuffer));
    });
  });
};

// Enable trust proxy for ngrok/reverse proxy support
app.set('trust proxy', 1);

// Robust CORS: Allow any Netlify, Render, or localhost origin with credentials
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, or same-origin requests (origin is undefined)
    if (!origin) return callback(null, true);

    // If explicit CORS_ORIGIN is set, check it first
    if (process.env.CORS_ORIGIN) {
      const explicitOrigins = process.env.CORS_ORIGIN.split(',').map(s => s.trim().toLowerCase());
      if (explicitOrigins.includes(origin.toLowerCase())) return callback(null, true);
    }

    // Always allow Netlify apps, Render services, localhost, and ngrok tunnels
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname.toLowerCase();
      if (
        host.endsWith('.netlify.app') ||
        host.endsWith('.onrender.com') ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.ngrok-free.app') ||
        host.endsWith('.ngrok.io')
      ) {
        return callback(null, true);
      }
    } catch (_) {}

    // Fallback: Allow origin
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

const requireAuth = (req, res, next) => {
  if (!ENABLE_DB_CACHE) return next();
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const session = db.prepare(`
      SELECT user_id, expires_at FROM sessions 
      WHERE token = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `).get(token);

    if (!session) return res.status(401).json({ error: 'Session expired' });
    req.user = { id: session.user_id };
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Auth error' });
  }
};

app.post('/api/register', async (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // Case insensitive storage
    const normalizedUsername = username.toLowerCase().trim();

    // Check for existing user case-insensitively
    const existing = db.prepare('SELECT id FROM users WHERE lower(username) = ?').get(normalizedUsername);
    if (existing) return res.status(400).json({ error: 'Username taken' });

    const { salt, hash } = await hashPassword(password);
    const result = db.prepare('INSERT INTO users (username, password, salt) VALUES (?, ?, ?)').run(normalizedUsername, hash, salt);
    const userId = result.lastInsertRowid;

    db.prepare('INSERT INTO workspaces (name, user_id) VALUES (?, ?)').run('My Collection', userId);
    
    // 32-byte cryptographically secure session token with 30-day expiration
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);

    res.json({ token, username: normalizedUsername, userId });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username taken' });
    console.error('Register failed:', err);
    res.status(500).json({ error: 'Register failed' });
  }
});

app.post('/api/login', async (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    // Case insensitive lookup
    const normalizedUsername = username.toLowerCase().trim();
    const user = db.prepare('SELECT * FROM users WHERE lower(username) = ?').get(normalizedUsername);

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = await verifyPassword(password, user.salt, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    // Seamless auto-upgrade of legacy sha256 to modern scrypt
    if (!user.salt) {
      try {
        const upgraded = await hashPassword(password);
        db.prepare('UPDATE users SET password = ?, salt = ? WHERE id = ?').run(upgraded.hash, upgraded.salt, user.id);
      } catch (upgradeErr) {
        console.error('Password auto-upgrade notice:', upgradeErr.message);
      }
    }

    // Generate 32-byte session token with 30-day sliding expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

    res.json({ token, username: user.username, userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ success: true });
});

// Helper: MD5 Hash
const generateHash = (text) => {
  return crypto.createHash('md5').update(text).digest('hex');
};

// Helper: Check if URL is safe to scrape (blocks internal networks, loopback, cloud metadata)
const isSafeUrl = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();

    // Disallow loopback / localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return false;
    }

    // Disallow Cloud Metadata and Link-Local
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal' || hostname.endsWith('.internal')) {
      return false;
    }

    // Disallow private IPv4 ranges (10.x, 192.168.x, 172.16-31.x)
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const b0 = parseInt(ipMatch[1], 10);
      const b1 = parseInt(ipMatch[2], 10);
      if (b0 === 10) return false;
      if (b0 === 192 && b1 === 168) return false;
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return false;
      if (b0 === 127) return false;
    }

    return true;
  } catch {
    return false;
  }
};

// Helper: Extract valid and safe URLs from arbitrary text
const extractUrlsFromText = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex) || [];
  return matches
    .map(url => url.replace(/[.,;)]+$/, ''))
    .filter(url => isSafeUrl(url));
};

const SITE_CONFIGS = [
  {
    name: 'amazon',
    domains: ['amazon', 'amzn'],
    titleSelectors: ['#productTitle'],
    imageSelectors: ['#landingImage', '#imgTagWrapperId img'],
    priceSelectors: ['.a-price .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice', '#corePrice_desktop .a-price .a-offscreen', '.a-price-whole']
  },
  {
    name: 'flipkart',
    domains: ['flipkart'],
    titleSelectors: ['.B_NuCI', 'h1._3wtzKS'],
    imageSelectors: ['img._396cs4', 'img._2r_T1I'],
    priceSelectors: ['div.Nx9bqj', 'div._30jeq3', 'div._25b18c ._30jeq3']
  },
  {
    name: 'ajio',
    domains: ['ajio'],
    titleSelectors: ['h1.prod-name', '.prod-name', '.pdp-title'],
    imageSelectors: ['img.img-alignment', '.rilrtl-lazy-img-loaded', '.rilrtl-lazy-img'],
    priceSelectors: ['.prod-sp', '.prod-cp', '.prod-price-section .prod-sp']
  },
  {
    name: 'bewakoof',
    domains: ['bewakoof'],
    titleSelectors: ['h1#testProName'],
    priceSelectors: ['span#testNetProdPrice', '.sellingPrice']
  },
  {
    name: 'tatacliq',
    domains: ['tatacliq'],
    titleSelectors: ['h1.ProductDetailsMain__productName'],
    priceSelectors: ['div.ProductDetailsMain__price', 'h3']
  },
  {
    name: 'souledstore',
    domains: ['thesouledstore'],
    titleSelectors: ['h1.product-name'],
    priceSelectors: ['.product-price .price', '.special-price']
  },
  {
    name: 'decathlon',
    domains: ['decathlon'],
    titleSelectors: ['h1'],
    priceSelectors: ['.prc__active-price']
  },
  {
    name: 'nykaafashion',
    domains: ['nykaafashion'],
    titleSelectors: ['h1'],
    priceSelectors: ['span.css-1jczs19']
  },
  {
    name: 'palmonas',
    domains: ['palmonas'],
    titleSelectors: ['h1.t4s-product__title', 'h1.product_title', 'h1'],
    priceSelectors: ['.t4s-product-price', '.price__regular .price-item', '.price-item--regular', '.money']
  },
  {
    name: 'skechers',
    domains: ['skechers'],
    priceSelectors: ['.t4s-product-price', '.price__regular .price-item', '.price-item--regular', '.money']
  },
  {
    name: 'skechers',
    domains: ['skechers'],
    titleSelectors: ['.product-name', 'h1.product-name'],
    imageSelectors: ['#myimage', '.modal-open-zoom', '.product-image-main img'],
    priceSelectors: ['.price-sales', '.prices .sales']
  },
  {
    name: 'bata',
    domains: ['bata'],
    titleSelectors: ['h1.product-name', '.product-name'],
    priceSelectors: ['.sales .value', '.price-sales']
  },
  {
    name: 'redtape',
    domains: ['redtape'],
    titleSelectors: ['.product__title h1', 'h1'],
    imageSelectors: ['.product__media img', '.product__media-item img'],
    priceSelectors: ['.price-item--sale', '.price-item--regular']
  }
];

const getSiteConfig = (url) => {
  const lower = url.toLowerCase();
  return SITE_CONFIGS.find(config => config.domains.some(d => lower.includes(d)));
};

const extractFromSelectors = ($, selectors) => {
  if (!selectors) return null;
  for (const selector of selectors) {
    const el = $(selector).first();
    // For images, get src
    if (el.is('img')) {
      const src = el.attr('src') || el.attr('data-src');
      if (src) return src;
    }
    // Default to text
    const txt = el.text().trim();
    if (txt) return txt;
  }
  return null;
};

const extractPrice = ($, siteConfig) => {
  // 1. Try Site Specific Selectors
  if (siteConfig && siteConfig.priceSelectors) {
    const price = extractFromSelectors($, siteConfig.priceSelectors);
    if (price) return price;
  }

  // 2. Try JSON-LD
  const jsonLd = $('script[type="application/ld+json"]');
  let price = null;
  jsonLd.each((i, el) => {
    try {
      const data = JSON.parse($(el).html());
      // Handle array or object
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type'] === 'ProductGroup') {
          // Extract Price
          const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          if (offers) {
            if (offers.price) {
              price = `${offers.priceCurrency || ''} ${offers.price}`;
            } else if (offers.lowPrice) {
              price = `${offers.priceCurrency || ''} ${offers.lowPrice}`;
            }
          }

          // Extract Image if not already found from meta
          if (!image) {
            if (item.image) {
              if (Array.isArray(item.image)) image = item.image[0];
              else if (typeof item.image === 'string') image = item.image;
              else if (item.image.url) image = item.image.url;
            }
          }

          if (price) break;
        }
      }
    } catch (e) { }
  });
  if (price) return price;

  // 3. Try Meta Tags
  const ogPrice = $('meta[property="product:price:amount"]').attr('content');
  const ogCurrency = $('meta[property="product:price:currency"]').attr('content') || '$';
  if (ogPrice) return `${ogCurrency}${ogPrice}`;

  return 'Check Site';
};

const extractSize = ($) => {
  return 'Visit Site';
};

// GET: Fetch all cached products (Strict multi-tenant isolation via user_id)
app.get('/api/products', requireAuth, (req, res) => {
  if (!ENABLE_DB_CACHE) return res.json([]);
  try {
    const { workspace_id, favorites } = req.query;
    const userId = req.user.id;

    let query = `
      SELECT p.* FROM products p
      WHERE p.user_id = ?
    `;
    const params = [userId];

    if (workspace_id && workspace_id !== 'all') {
      query += ' AND p.workspace_id = ?';
      params.push(workspace_id);
    }

    if (favorites === 'true') {
      query += ' AND p.is_favorite = 1';
    }

    query += ' ORDER BY p.updated_at DESC';

    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// DELETE: Remove a product (Fix BOLA/IDOR: strictly scoped to req.user.id and optional workspace)
app.delete('/api/products/:id', requireAuth, (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { id } = req.params;
    const { workspace_id } = req.query;
    const userId = req.user.id;

    let result;
    if (workspace_id && workspace_id !== 'all') {
      result = db.prepare(`
        DELETE FROM products 
        WHERE id = ? AND workspace_id = ? AND user_id = ?
      `).run(id, workspace_id, userId);
    } else {
      result = db.prepare(`
        DELETE FROM products 
        WHERE id = ? AND user_id = ?
      `).run(id, userId);
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// GET: Fetch all workspaces
app.get('/api/workspaces', requireAuth, (req, res) => {
  if (!ENABLE_DB_CACHE) return res.json([]);
  try {
    const workspaces = db.prepare('SELECT * FROM workspaces WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id);
    res.json(workspaces);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// POST: Create a new workspace
app.post('/api/workspaces', requireAuth, (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    const result = db.prepare('INSERT INTO workspaces (name, user_id) VALUES (?, ?)').run(name.trim(), req.user.id);
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid);
    res.json(workspace);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// DELETE: Remove a workspace (Fix BOLA: scoped strictly to user_id)
app.delete('/api/workspaces/:id', requireAuth, (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Prevent deletion of the last workspace
    const workspaces = db.prepare('SELECT id FROM workspaces WHERE user_id = ?').all(userId);
    const workspace = workspaces.find(w => w.id == id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    if (workspaces.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last workspace' });
    }

    // Scoped strictly to user_id to prevent cross-tenant deletion
    db.prepare('DELETE FROM workspaces WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

// PATCH: Toggle favorite status (Fix BOLA: scoped strictly to user_id)
app.patch('/api/products/:id/favorite', requireAuth, (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { id } = req.params;
    const { is_favorite, workspace_id } = req.body;
    const userId = req.user.id;

    let result;
    if (workspace_id && workspace_id !== 'all') {
      result = db.prepare(`
        UPDATE products SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND workspace_id = ? AND user_id = ?
      `).run(is_favorite ? 1 : 0, id, workspace_id, userId);
    } else {
      result = db.prepare(`
        UPDATE products SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(is_favorite ? 1 : 0, id, userId);
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true, id, is_favorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});

app.post('/api/scrape', requireAuth, async (req, res) => {
  const { urls: rawInput, workspace_id } = req.body;
  if (!rawInput) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

  const userId = req.user.id;
  let targetWorkspaceId = workspace_id;

  // Validate workspace
  if (targetWorkspaceId) {
    const ws = db.prepare('SELECT id FROM workspaces WHERE id = ? AND user_id = ?').get(targetWorkspaceId, userId);
    if (!ws) return res.status(403).json({ error: 'Invalid workspace' });
  } else {
    // Default to first available
    const ws = db.prepare('SELECT id FROM workspaces WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId);
    if (!ws) return res.status(400).json({ error: 'No workspace found' });
    targetWorkspaceId = ws.id;
  }

  const workspaceId = targetWorkspaceId;

  // Handle both array of strings and single block of text
  let urls = [];
  if (Array.isArray(rawInput)) {
    rawInput.forEach(input => {
      urls = [...urls, ...extractUrlsFromText(input)];
    });
  } else if (typeof rawInput === 'string') {
    urls = extractUrlsFromText(rawInput);
  }

  // Dedup URLs
  urls = [...new Set(urls)];

  if (urls.length === 0) {
    return res.json([]);
  }

  const results = [];

  for (const url of urls) {
    const id = generateHash(url);

    // 1. Check DB if enabled
    if (ENABLE_DB_CACHE) {
      const cached = db.prepare('SELECT * FROM products WHERE id = ? AND workspace_id = ?').get(id, workspaceId);
      if (cached) {
        console.log(`[CACHE HIT] ${url}`);
        results.push({
          id: cached.id,
          workspace_id: cached.workspace_id,
          url: cached.url,
          title: cached.title,
          image: cached.image,
          price: cached.price,
          size: cached.size,
          is_favorite: cached.is_favorite
        });
        continue;
      }
    }

    // 2. Scrape if not in DB or Cache disabled
    try {
      console.log(`[SCRAPING] ${url}`);

      const siteConfig = getSiteConfig(url);

      const getHeaders = (u) => {
        const isAjio = u.toLowerCase().includes('ajio');
        const ua = isAjio
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        return {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Referer': 'https://www.google.com/'
        };
      };

      const { data } = await axios.get(url, {
        headers: getHeaders(url),
        timeout: 10000 // 10s timeout
      });

      const $ = cheerio.load(data);

      let title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'No Title';
      let image = null;

      // 1. Site Specific Config
      if (siteConfig) {
        if (siteConfig.titleSelectors) {
          const extractedTitle = extractFromSelectors($, siteConfig.titleSelectors);
          if (extractedTitle) title = extractedTitle;
        }
        if (siteConfig.imageSelectors) {
          const extractedImage = extractFromSelectors($, siteConfig.imageSelectors);
          if (extractedImage) image = extractedImage;
        }
      }

      // 2. Open Graph
      if (!image) {
        image = $('meta[property="og:image"]').attr('content');
      }

      // 3. JSON-LD
      if (!image) {
        try {
          $('script[type="application/ld+json"]').each((i, el) => {
            if (image) return;
            const content = $(el).html();
            if (!content) return;
            const data = JSON.parse(content);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if ((item['@type'] === 'Product' || item['@type'] === 'ProductGroup') && item.image) {
                if (Array.isArray(item.image)) image = item.image[0];
                else if (typeof item.image === 'string') image = item.image;
                else if (item.image.url) image = item.image.url;
                if (image) break;
              }
            }
          });
        } catch (e) { }
      }

      // 4. Fallback to first image (if not SVG/small icons ideally, but simplistic for now)
      if (!image) {
        image = $('img').first().attr('src') || '';
      }
      const price = extractPrice($, siteConfig);
      const size = extractSize($);

      const productData = {
        id,
        workspace_id: workspaceId,
        user_id: userId,
        url,
        title: title.trim(),
        image,
        price,
        size,
        is_favorite: 0
      };

      results.push(productData);

      // 3. Store in DB if enabled
      if (ENABLE_DB_CACHE) {
        try {
          db.prepare(`
                INSERT OR REPLACE INTO products (id, workspace_id, user_id, url, title, image, price, size, is_favorite)
                VALUES (@id, @workspace_id, @user_id, @url, @title, @image, @price, @size, @is_favorite)
            `).run(productData);
        } catch (dbErr) {
          console.error('DB Write Error:', dbErr);
        }
      }

    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error.message);
      results.push({
        id,
        url,
        error: 'Failed to load product data',
        title: 'Error Loading Product',
        image: '',
        price: '',
        size: ''
      });
    }
  }

  res.json(results);
});

// Lightweight Streaming Image Proxy (Frugal zero-disk fallback for anti-hotlinking stores)
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid protocol');
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return res.status(403).send('Restricted destination');
    }

    const imageStream = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': `${parsed.protocol}//${parsed.hostname}/`
      },
      maxContentLength: 8 * 1024 * 1024 // 8MB memory protection
    });

    const contentType = imageStream.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // Cache 7 days in client
    imageStream.data.pipe(res);
  } catch (err) {
    res.status(502).send('Failed to fetch image');
  }
});

// Serve static frontend assets in production if built
const clientDistPath = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database Caching is: ${ENABLE_DB_CACHE ? 'ENABLED' : 'DISABLED'}`);
});
