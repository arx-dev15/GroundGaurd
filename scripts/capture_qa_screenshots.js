const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQA() {
  console.log('Launching Chrome for Visual Acceptance QA...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log('Navigating to http://localhost:3005...');
  await page.goto('http://localhost:3005', { waitUntil: 'networkidle0' });
  await wait(2500); // Allow Three.js animations to initialize

  // Helper to scroll to chapter by ID
  async function scrollToSection(sectionId) {
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'auto' });
      }
    }, sectionId);
    await wait(1800); // Allow camera lerp and mesh explode animations to settle
  }

  // 1. HERO
  console.log('Capturing 1. HERO (1920x1080)...');
  await scrollToSection('chapter-hero');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '1_hero_1920x1080.png'), fullPage: false });

  // 2. EXPLODED ARCHITECTURE
  console.log('Capturing 2. EXPLODED ARCHITECTURE (1920x1080)...');
  await scrollToSection('chapter-exploded');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '2_exploded_architecture_1920x1080.png'), fullPage: false });

  // 3. HYBRID RETRIEVAL / BRAIN
  console.log('Capturing 3. HYBRID RETRIEVAL / BRAIN (1920x1080)...');
  await scrollToSection('chapter-hybrid_retrieval');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '3_hybrid_retrieval_brain_1920x1080.png'), fullPage: false });

  // 4. TRUST CORE VERIFIED
  console.log('Capturing 4. TRUST CORE VERIFIED (1920x1080)...');
  await scrollToSection('chapter-trust_core');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '4_trust_core_verified_1920x1080.png'), fullPage: false });

  // 5. CONTRADICTION
  console.log('Capturing 5. CONTRADICTION (1920x1080)...');
  await scrollToSection('chapter-contradiction');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '5_contradiction_red_1920x1080.png'), fullPage: false });

  // 6. RECOVERY + REVERIFICATION
  console.log('Capturing 6. RECOVERY + REVERIFICATION (1920x1080)...');
  await scrollToSection('chapter-recovery');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '6_recovery_reverification_1920x1080.png'), fullPage: false });

  // 7. REASSEMBLED SENTINEL
  console.log('Capturing 7. REASSEMBLED SENTINEL (1920x1080)...');
  await scrollToSection('chapter-reassembly');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '7_reassembled_sentinel_1920x1080.png'), fullPage: false });

  // 8. FINAL CINEMATIC FLOW
  console.log('Capturing 8. FINAL CINEMATIC FLOW (1920x1080)...');
  // Open live flow modal via button
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Live Flow'));
    if (btn) btn.click();
  });
  await wait(2200);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '8_final_cinematic_flow_1920x1080.png'), fullPage: false });

  // Close live flow modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[title="Close Live Flow"]');
    if (closeBtn) closeBtn.click();
  });
  await wait(800);

  // 9. FINAL FRAME
  console.log('Capturing 9. FINAL FRAME (1920x1080)...');
  await scrollToSection('chapter-finale');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '9_final_verified_frame_1920x1080.png'), fullPage: false });

  // Responsive Check at 1366x768
  console.log('Testing 1366x768 responsive layout...');
  await page.setViewport({ width: 1366, height: 768 });
  await scrollToSection('chapter-hero');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'hero_1366x768.png'), fullPage: false });

  await scrollToSection('chapter-trust_core');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'trust_core_1366x768.png'), fullPage: false });

  await browser.close();
  console.log('Visual QA capture complete! All screenshots saved to:', OUTPUT_DIR);
}

runQA().catch((err) => {
  console.error('QA script failed:', err);
  process.exit(1);
});
