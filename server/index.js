import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

// Feature Flag for Database Caching
const ENABLE_DB_CACHE = process.env.USE_DATABASE !== 'false';

// Initialise Database
let db;
if (ENABLE_DB_CACHE) {
  db = new Database('products.db');
  // We'll use 'id' (hash) as primary key to ensure idempotency
  db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            url TEXT,
            title TEXT,
            image TEXT,
            price TEXT,
            size TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// Enable trust proxy for ngrok/reverse proxy support
app.set('trust proxy', 1);

// CORS configuration - allow all origins for development (including ngrok)
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));
app.use(express.json());

// Helper: MD5 Hash
const generateHash = (text) => {
  return crypto.createHash('md5').update(text).digest('hex');
};

// Helper: Extract valid URLs from arbitrary text
const extractUrlsFromText = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex) || [];
  return matches.map(url => url.replace(/[.,;)]+$/, ''));
};

const extractPrice = ($) => {
  const jsonLd = $('script[type="application/ld+json"]');
  let price = null;
  jsonLd.each((i, el) => {
    try {
      const data = JSON.parse($(el).html());
      if (data['@type'] === 'Product' || data['@type'] === 'ProductGroup') {
        const offers = Array.isArray(data.offers) ? data.offers[0] : data.offers;
        if (offers) {
          if (offers.price) price = `${offers.priceCurrency || ''} ${offers.price}`;
          if (offers.lowPrice) price = `${offers.priceCurrency || ''} ${offers.lowPrice}`;
        }
      }
    } catch (e) { }
  });
  if (price) return price;
  const ogPrice = $('meta[property="product:price:amount"]').attr('content');
  const ogCurrency = $('meta[property="product:price:currency"]').attr('content') || '$';
  if (ogPrice) return `${ogCurrency}${ogPrice}`;
  return 'Check Site';
};

const extractSize = ($) => {
  return 'Visit Site';
};

// GET: Fetch all cached products
app.get('/api/products', (req, res) => {
  if (!ENABLE_DB_CACHE) return res.json([]);
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY updated_at DESC').all();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// DELETE: Remove a product
app.delete('/api/products/:id', (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

app.post('/api/scrape', async (req, res) => {
  const { urls: rawInput } = req.body;
  if (!rawInput) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

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
      const cached = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (cached) {
        console.log(`[CACHE HIT] ${url}`);
        results.push({
          id: cached.id,
          url: cached.url,
          title: cached.title,
          image: cached.image,
          price: cached.price,
          size: cached.size
        });
        continue;
      }
    }

    // 2. Scrape if not in DB or Cache disabled
    try {
      console.log(`[SCRAPING] ${url}`);
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000 // 10s timeout
      });

      const $ = cheerio.load(data);
      const title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'No Title';
      const image = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '';
      const price = extractPrice($);
      const size = extractSize($);

      const productData = {
        id,
        url,
        title: title.trim(),
        image,
        price,
        size
      };

      results.push(productData);

      // 3. Store in DB if enabled
      if (ENABLE_DB_CACHE) {
        try {
          db.prepare(`
                INSERT OR REPLACE INTO products (id, url, title, image, price, size)
                VALUES (@id, @url, @title, @image, @price, @size)
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database Caching is: ${ENABLE_DB_CACHE ? 'ENABLED' : 'DISABLED'}`);
});
