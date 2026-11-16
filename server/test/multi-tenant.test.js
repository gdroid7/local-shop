import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ephemeral isolated test database
const testDbPath = path.join(__dirname, 'test_multi_tenant.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const TEST_PORT = 3999;
process.env.DB_PATH = testDbPath;
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';

// Start server
await import('../index.js');
await new Promise(r => setTimeout(r, 800));

async function api(endpoint, opts = {}) {
  const res = await fetch(`http://localhost:${TEST_PORT}${endpoint}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

let failed = false;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failed = true;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('🧪 Starting Multi-Tenant & Security Test Suite...\n');

try {
  // Test 1: User Registration with scrypt
  const regAlice = await api('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'secure_password_alice' })
  });
  assert(regAlice.status === 200, 'Alice registered successfully');
  assert(regAlice.data.token && regAlice.data.token.length === 64, 'Generated 32-byte (64 hex char) session token');

  const regBob = await api('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'secure_password_bob' })
  });
  assert(regBob.status === 200, 'Bob registered successfully');

  const db = new Database(testDbPath);
  const aliceRow = db.prepare('SELECT password, salt FROM users WHERE username = ?').get('alice');
  assert(aliceRow.salt && aliceRow.salt.length === 32, 'Password salt stored (16 bytes random hex)');
  assert(aliceRow.password && aliceRow.password.length === 128, 'Password stored with scrypt hash (64 bytes hex)');

  // Test 2: User Login
  const loginAlice = await api('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'secure_password_alice' })
  });
  assert(loginAlice.status === 200, 'Alice logged in successfully');

  const badLogin = await api('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'wrong_password' })
  });
  assert(badLogin.status === 401, 'Bad credentials rejected with 401');

  // Test 3: Multi-tenant Workspace Isolation
  const aliceToken = regAlice.data.token;
  const bobToken = regBob.data.token;

  const aliceWorkspaces = (await api('/api/workspaces', { headers: { Authorization: aliceToken } })).data;
  const bobWorkspaces = (await api('/api/workspaces', { headers: { Authorization: bobToken } })).data;

  assert(aliceWorkspaces.length === 1, 'Alice has 1 default workspace');
  assert(bobWorkspaces.length === 1, 'Bob has 1 default workspace');
  assert(aliceWorkspaces[0].id !== bobWorkspaces[0].id, 'Alice and Bob have different workspace IDs');

  const aliceWsId = aliceWorkspaces[0].id;
  const bobWsId = bobWorkspaces[0].id;

  // Test 4: BOLA Protection on Cross-Tenant Product Operations
  const commonProductId = 'product_md5_hash_sample_01';
  db.prepare(`
    INSERT INTO products (id, workspace_id, user_id, url, title, image, price, size, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(commonProductId, aliceWsId, regAlice.data.userId, 'https://example.com/item', 'Product 1', 'img.png', '$20', 'L', 0);

  db.prepare(`
    INSERT INTO products (id, workspace_id, user_id, url, title, image, price, size, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(commonProductId, bobWsId, regBob.data.userId, 'https://example.com/item', 'Product 1', 'img.png', '$20', 'L', 0);

  // Alice favorites her product
  const favRes = await api(`/api/products/${commonProductId}/favorite`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: aliceToken },
    body: JSON.stringify({ is_favorite: true, workspace_id: aliceWsId })
  });
  assert(favRes.status === 200, 'Alice favorited her product');

  const bobProdCheck = db.prepare('SELECT is_favorite FROM products WHERE id = ? AND user_id = ?').get(commonProductId, regBob.data.userId);
  assert(bobProdCheck.is_favorite === 0, 'Bob product is_favorite remains 0 (Cross-tenant favoriting blocked)');

  // Alice deletes her product
  const delRes = await api(`/api/products/${commonProductId}?workspace_id=${aliceWsId}`, {
    method: 'DELETE',
    headers: { Authorization: aliceToken }
  });
  assert(delRes.status === 200, 'Alice deleted her product');

  const aliceProdAfter = db.prepare('SELECT id FROM products WHERE id = ? AND user_id = ?').get(commonProductId, regAlice.data.userId);
  const bobProdAfter = db.prepare('SELECT id FROM products WHERE id = ? AND user_id = ?').get(commonProductId, regBob.data.userId);
  assert(!aliceProdAfter, 'Alice product is deleted from her workspace');
  assert(!!bobProdAfter, 'Bob product STILL EXISTS intact (Cross-tenant deletion blocked)');

  // Test 5: Unauthorized Workspace Deletion
  const unauthDel = await api(`/api/workspaces/${aliceWsId}`, {
    method: 'DELETE',
    headers: { Authorization: bobToken }
  });
  assert(unauthDel.status === 404, 'Bob cannot delete Alice workspace (Returns 404 access denied)');

  // Test 6: Image Proxy SSRF Protection
  const ssrfCheck = await fetch(`http://localhost:${TEST_PORT}/api/proxy-image?url=http://127.0.0.1:8080/admin`);
  assert(ssrfCheck.status === 403, 'Image proxy blocks loopback / private IP SSRF attempt (Returns 403)');

  const metaCheck = await fetch(`http://localhost:${TEST_PORT}/api/proxy-image?url=http://169.254.169.254/latest/meta-data/`);
  assert(metaCheck.status === 403, 'Image proxy blocks cloud metadata IP attempt (Returns 403)');

  // Test 7: Social Login Providers Status
  const provRes = await api('/api/auth/providers');
  assert(provRes.status === 200, 'Social auth providers endpoint accessible');
  assert('google' in provRes.data && 'github' in provRes.data, 'Social auth status returns Google & GitHub configurations');

} catch (err) {
  console.error('Test execution error:', err);
  failed = true;
} finally {
  // Cleanup test db
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (_) {}
  }
}

if (failed) {
  console.error('\n❌ SOME TESTS FAILED.');
  process.exit(1);
} else {
  console.log('\n🎉 ALL TESTS PASSED! Verification 100% complete.');
  process.exit(0);
}
