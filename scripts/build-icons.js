/**
 * Icon generation script for New Tab Note
 * Run with: node scripts/build-icons.js
 * 
 * This creates PNG icons from canvas drawings.
 * Requires: npm install canvas (node-canvas)
 */

const fs = require('fs');
const path = require('path');

// Try to use node-canvas if available, otherwise provide instructions
let createCanvas;
try {
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  console.log('node-canvas not installed. Creating placeholder icons...');
  console.log('To generate proper icons, run: npm install canvas');
  console.log('Then run this script again.\n');
  
  // Create simple placeholder PNGs (1x1 blue pixel as base64)
  const placeholder = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );
  
  const iconsDir = path.join(__dirname, '..', 'icons');
  fs.writeFileSync(path.join(iconsDir, 'icon16.png'), placeholder);
  fs.writeFileSync(path.join(iconsDir, 'icon48.png'), placeholder);
  fs.writeFileSync(path.join(iconsDir, 'icon128.png'), placeholder);
  
  console.log('Placeholder icons created. Open scripts/generate-icons.html in a browser');
  console.log('to manually generate and save the icons.');
  process.exit(0);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const scale = size / 48;
  
  // Background
  ctx.fillStyle = '#4a90d9';
  roundRect(ctx, 2 * scale, 2 * scale, 44 * scale, 44 * scale, 8 * scale);
  ctx.fill();
  
  // Rectangle element
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  roundRect(ctx, 8 * scale, 8 * scale, 14 * scale, 10 * scale, 2 * scale);
  ctx.fill();
  
  // Circle element
  ctx.beginPath();
  ctx.arc(35 * scale, 14 * scale, 5 * scale, 0, Math.PI * 2);
  ctx.fill();
  
  // Checkmark/path element
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, 4 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(10 * scale, 28 * scale);
  ctx.lineTo(18 * scale, 38 * scale);
  ctx.lineTo(38 * scale, 18 * scale);
  ctx.stroke();
  
  return canvas.toBuffer('image/png');
}

const iconsDir = path.join(__dirname, '..', 'icons');

// Generate icons
const sizes = [16, 48, 128];
for (const size of sizes) {
  const buffer = drawIcon(size);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, buffer);
  console.log(`Created ${filename}`);
}

console.log('\nIcons generated successfully!');
