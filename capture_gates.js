const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Ganesha\\.gemini\\antigravity-ide\\brain\\2619b0ac-91de-4da7-96b8-92d7dd325796';

async function capture() {
  console.log('Launching browser for visual gate inspection...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--ignore-gpu-blocklist']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log('Navigating to http://localhost:3005...');
  await page.goto('http://localhost:3005', { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait 3.5 seconds for initial Three.js render
  await new Promise(r => setTimeout(r, 3500));

  const clips = [
    {
      name: 'CLIP_1_PDF_INGESTION_TRANSFORMATION',
      selector: '#chapter-input_knowledge',
      waitMs: 2500,
      description: 'PDF approaches -> transforms -> enters left arm'
    },
    {
      name: 'CLIP_2_HEAD_RETRIEVAL_FUSION_DRAFT',
      selector: '#chapter-intelligence',
      waitMs: 2500,
      description: 'Query reaches head -> retrieval -> RRF -> rerank -> draft'
    },
    {
      name: 'CLIP_3_CLAIMS_VERIFICATION_RECOVERY',
      selector: '#chapter-trust_recovery',
      waitMs: 2500,
      description: 'Draft -> claims -> verified + contradiction -> recovery -> recovered'
    },
    {
      name: 'CLIP_4_OUTPUT_MATERIALIZATION',
      selector: '#chapter-output',
      waitMs: 2500,
      description: 'Trusted stream -> right arm -> output forms'
    },
  ];

  // Capture Hero First
  console.log('Capturing Hero state...');
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  await new Promise(r => setTimeout(r, 1500));
  const heroPath = path.join(ARTIFACT_DIR, 'HERO_MEET_GROUNDGUARD.png');
  await page.screenshot({ path: heroPath, type: 'png' });
  console.log(`Saved Hero to ${heroPath}`);

  // Capture Clips 1-4
  for (const clip of clips) {
    console.log(`Navigating to ${clip.name} (${clip.selector})...`);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'auto' });
      }
    }, clip.selector);

    await new Promise(r => setTimeout(r, clip.waitMs));

    const outputPath = path.join(ARTIFACT_DIR, `${clip.name}.png`);
    await page.screenshot({ path: outputPath, type: 'png' });
    console.log(`Saved screenshot to ${outputPath}`);
  }

  // Capture Clip 5: Full uninterrupted cinematic flow
  console.log('Triggering full uninterrupted cinematic flow...');
  await page.evaluate(() => {
    const replayBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Replay Flow'));
    if (replayBtn) replayBtn.click();
  });
  await new Promise(r => setTimeout(r, 3800));
  const cinematicPath = path.join(ARTIFACT_DIR, 'CLIP_5_FULL_UNINTERRUPTED_CINEMATIC.png');
  await page.screenshot({ path: cinematicPath, type: 'png' });
  console.log(`Saved cinematic screenshot to ${cinematicPath}`);

  await browser.close();
  console.log('Visual gate captures complete!');
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
