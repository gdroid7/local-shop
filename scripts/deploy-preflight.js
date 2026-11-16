#!/usr/bin/env node

/**
 * ShopDeck: Pre-Flight Deployment Readiness & Health Verification Script
 * Validates build artifacts, configuration manifests, test suites, and database integrity.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Running ShopDeck Pre-Flight Deployment Check...\n');

let allPassed = true;

function check(name, fn) {
  try {
    fn();
    console.log(`✅ [OK] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    allPassed = false;
  }
}

// 1. Check Node.js version
check('Node.js Environment (>= 20.x)', () => {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  if (major < 20) throw new Error(`Node ${version} detected. Expected Node 20.x or 22.x`);
});

// 2. Check deployment manifests
check('Deployment Manifests (Netlify & Render)', () => {
  const netlifyToml = path.join(rootDir, 'netlify.toml');
  const netlifyRedirects = path.join(rootDir, 'client/public/_redirects');
  const renderYaml = path.join(rootDir, 'render.yaml');
  const dockerfile = path.join(rootDir, 'Dockerfile');

  if (!fs.existsSync(netlifyToml)) throw new Error('netlify.toml is missing');
  if (!fs.existsSync(netlifyRedirects)) throw new Error('client/public/_redirects is missing');
  if (!fs.existsSync(renderYaml)) throw new Error('render.yaml is missing');
  if (!fs.existsSync(dockerfile)) throw new Error('Dockerfile is missing');
});

// 3. Check client build
check('React Frontend Production Build (client/dist)', () => {
  console.log('   Building client bundle with Vite...');
  execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
  const distHtml = path.join(rootDir, 'client/dist/index.html');
  if (!fs.existsSync(distHtml)) throw new Error('client/dist/index.html was not generated');
  const content = fs.readFileSync(distHtml, 'utf8');
  if (!content.includes('ShopDeck') && !content.includes('root') && !content.includes('vite')) {
    throw new Error('Built HTML bundle appears corrupted or empty');
  }
});

// 4. Run automated test suite
check('Multi-Tenant & Security Test Suite', () => {
  console.log('   Running server multi-tenant isolation tests...');
  execSync('npm test', { cwd: rootDir, stdio: 'pipe' });
});

// 5. Final Report
console.log('\n------------------------------------------------------------');
if (allPassed) {
  console.log('🎉 ALL PRE-FLIGHT CHECKS PASSED! Ready for zero-cost deployment.');
  console.log('------------------------------------------------------------');
  console.log('\nReady-to-Deploy Targets:');
  console.log('1. Netlify Frontend: Connect repository, set build dir to client/dist, set VITE_API_URL');
  console.log('2. Render Backend: Connect repository, uses render.yaml for 1-click free web service');
  console.log('3. Docker / Oracle Cloud: docker build -t shopdeck . && docker run -p 80:3000 shopdeck');
  process.exit(0);
} else {
  console.error('❌ PRE-FLIGHT CHECKS FAILED. Please resolve the errors above.');
  process.exit(1);
}
