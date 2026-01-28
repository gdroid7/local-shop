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
  db.pragma('foreign_keys = ON');


  // Create workspaces table
  db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

  // We'll use 'id' (hash) as primary key to ensure idempotency
  db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT,
            workspace_id INTEGER DEFAULT 1,
            url TEXT,
            title TEXT,
            image TEXT,
            price TEXT,
            size TEXT,
            is_favorite INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id, workspace_id),
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
    `);

  // Insert default workspace if not exists
  const defaultWorkspace = db.prepare('SELECT COUNT(*) as count FROM workspaces').get();
  if (defaultWorkspace.count === 0) {
    db.prepare('INSERT INTO workspaces (name) VALUES (?)').run('My Collection');
  }
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
    titleSelectors: ['h1.prod-name'],
    priceSelectors: ['.prod-sp']
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
          const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          if (offers) {
            if (offers.price) {
              price = `${offers.priceCurrency || ''} ${offers.price}`;
              break;
            }
            if (offers.lowPrice) {
              price = `${offers.priceCurrency || ''} ${offers.lowPrice}`;
              break;
            }
          }
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

// GET: Fetch all cached products (with optional workspace filter and favorites filter)
app.get('/api/products', (req, res) => {
  if (!ENABLE_DB_CACHE) return res.json([]);
  try {
    const { workspace_id, favorites } = req.query;

    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (workspace_id) {
      query += ' AND workspace_id = ?';
      params.push(workspace_id);
    }

    if (favorites === 'true') {
      query += ' AND is_favorite = 1';
    }

    query += ' ORDER BY updated_at DESC';

    const products = db.prepare(query).all(...params);
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
    const { workspace_id } = req.query;

    if (workspace_id) {
      db.prepare('DELETE FROM products WHERE id = ? AND workspace_id = ?').run(id, workspace_id);
    } else {
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// GET: Fetch all workspaces
app.get('/api/workspaces', (req, res) => {
  if (!ENABLE_DB_CACHE) return res.json([]);
  try {
    const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all();
    res.json(workspaces);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// POST: Create a new workspace
app.post('/api/workspaces', (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    const result = db.prepare('INSERT INTO workspaces (name) VALUES (?)').run(name.trim());
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid);
    res.json(workspace);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// DELETE: Remove a workspace (and all its products)
app.delete('/api/workspaces/:id', (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { id } = req.params;

    // Prevent deletion of the last workspace
    const count = db.prepare('SELECT COUNT(*) as count FROM workspaces').get();
    if (count.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last workspace' });
    }

    db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

// PATCH: Toggle favorite status
app.patch('/api/products/:id/favorite', (req, res) => {
  if (!ENABLE_DB_CACHE) return res.status(501).json({ error: 'DB not enabled' });
  try {
    const { id } = req.params;
    const { workspace_id, is_favorite } = req.body;

    if (workspace_id) {
      db.prepare('UPDATE products SET is_favorite = ? WHERE id = ? AND workspace_id = ?')
        .run(is_favorite ? 1 : 0, id, workspace_id);
    } else {
      db.prepare('UPDATE products SET is_favorite = ? WHERE id = ?')
        .run(is_favorite ? 1 : 0, id);
    }

    res.json({ success: true, id, is_favorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});

app.post('/api/scrape', async (req, res) => {
  const { urls: rawInput, workspace_id } = req.body;
  if (!rawInput) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

  // Default to workspace 1 if not provided
  const workspaceId = workspace_id || 1;

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

      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1'
        },
        timeout: 10000 // 10s timeout
      });

      const $ = cheerio.load(data);

      let title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'No Title';
      let image = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '';

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

      const price = extractPrice($, siteConfig);
      const size = extractSize($);

      const productData = {
        id,
        workspace_id: workspaceId,
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
                INSERT OR REPLACE INTO products (id, workspace_id, url, title, image, price, size, is_favorite)
                VALUES (@id, @workspace_id, @url, @title, @image, @price, @size, @is_favorite)
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
