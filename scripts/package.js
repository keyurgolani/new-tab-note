#!/usr/bin/env node

/**
 * Package script for New Tab Note Chrome Extension
 * Creates a .zip file ready for Chrome Web Store upload
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_DIR = path.join(ROOT_DIR, 'releases');

/**
 * Get version from manifest.json
 */
function getVersion() {
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.error('Error: dist/manifest.json not found. Run `npm run build` first.');
    process.exit(1);
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
}

/**
 * Create zip package
 */
async function createPackage() {
  const version = getVersion();
  const filename = `new-tab-note-v${version}.zip`;
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const outputPath = path.join(OUTPUT_DIR, filename);
  
  // Remove existing file if present
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
  
  console.log(`\n📦 Packaging New Tab Note v${version}...\n`);
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });
    
    output.on('close', () => {
      const size = archive.pointer();
      console.log(`✅ Package created: ${filename}`);
      console.log(`   Size: ${formatBytes(size)}`);
      console.log(`   Path: ${outputPath}`);
      console.log('');
      resolve(outputPath);
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Warning:', err.message);
      } else {
        reject(err);
      }
    });
    
    archive.pipe(output);
    
    // Add dist directory contents to root of zip
    archive.directory(DIST_DIR, false);
    
    archive.finalize();
  });
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Run packaging
createPackage().catch(error => {
  console.error('Packaging failed:', error);
  process.exit(1);
});
