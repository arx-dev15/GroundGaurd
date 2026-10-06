import puppeteer from 'puppeteer-core';
import path from 'path';

const OUTPUT_DIR = 'C:/Users/Ganesha/.gemini/antigravity-ide/brain/2619b0ac-91de-4da7-96b8-92d7dd325796';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function captureValidationGates() {
  console.log('Launching Chrome from:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars', '--enable-webgl'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  console.log('Navigating to http://localhost:3005/...');
  await page.goto('http://localhost:3005/', { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for 3D canvas and animation to settle
  await new Promise(r => setTimeout(r, 2500));

  // --- STATE A: HERO FRONT THREE-QUARTER ---
  console.log('Capturing State A: Hero Front Three-Quarter...');
  const pathA = path.join(OUTPUT_DIR, 'STATE_A_HERO_FRONT_THREE_QUARTER.png');
  await page.screenshot({ path: pathA });
  console.log('Saved:', pathA);

  // --- STATE B: USER-ROTATED SIDE/REAR THREE-QUARTER ---
  console.log('Dragging to rotate Sentinel to Side/Rear view...');
  // Drag on the canvas to rotate model via OrbitControls
  const canvasElement = await page.$('canvas');
  if (canvasElement) {
    const box = await canvasElement.boundingBox();
    if (box) {
      const startX = box.x + box.width * 0.50;
      const startY = box.y + box.height * 0.50;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 600, startY - 40, { steps: 40 });
      await page.mouse.up();
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  console.log('Capturing State B: Hero Rotated Side/Rear Three-Quarter...');
  const pathB = path.join(OUTPUT_DIR, 'STATE_B_HERO_SIDE_REAR_THREE_QUARTER.png');
  await page.screenshot({ path: pathB });
  console.log('Saved:', pathB);

  // --- STATE C: TRUST CORE CLOSE-UP ---
  console.log('Scrolling to Chapter: Trust Core...');
  await page.evaluate(() => {
    const el = document.getElementById('chapter-trust_core');
    if (el) el.scrollIntoView({ behavior: 'instant' });
  });
  // Wait for camera lerp to complete
  await new Promise(r => setTimeout(r, 3000));

  console.log('Capturing State C: Trust Core Close-Up...');
  const pathC = path.join(OUTPUT_DIR, 'STATE_C_TRUST_CORE_CLOSEUP.png');
  await page.screenshot({ path: pathC });
  console.log('Saved:', pathC);

  await browser.close();
  console.log('Three-state validation capture complete!');
}

captureValidationGates().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
