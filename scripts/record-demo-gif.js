import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const FRAMES_DIR = path.resolve('temp_frames');
const OUTPUT_GIF = path.resolve('assets/demo.gif');
const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function record() {
    if (fs.existsSync(FRAMES_DIR)) {
        fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(FRAMES_DIR, { recursive: true });

    console.log('Launching browser to record demo...');
    const browser = await puppeteer.launch({
        executablePath: BRAVE_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1200,780']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 780, deviceScaleFactor: 1 });

    // Inject session token for user
    await page.evaluateOnNewDocument(() => {
        localStorage.setItem('token', 'c845dc5d8f6d7aa8fb6f94c64c752187');
    });

    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(2000);

    let frameCount = 0;
    const captureFrame = async (repeats = 1) => {
        const framePath = path.join(FRAMES_DIR, `frame_${String(frameCount).padStart(4, '0')}.png`);
        await page.screenshot({ path: framePath });
        for (let i = 1; i < repeats; i++) {
            frameCount++;
            const dupPath = path.join(FRAMES_DIR, `frame_${String(frameCount).padStart(4, '0')}.png`);
            fs.copyFileSync(framePath, dupPath);
        }
        frameCount++;
    };

    console.log('Capturing Scene 1: Responsive Grid View...');
    await captureFrame(4);

    // Scroll grid down smoothly
    const gridContainer = await page.$('main > div');
    if (gridContainer) {
        for (let scrollY of [120, 280, 420, 180, 0]) {
            await page.evaluate((el, y) => { el.scrollTop = y; }, gridContainer, scrollY);
            await sleep(150);
            await captureFrame(1);
        }
    }
    await captureFrame(2);

    console.log('Capturing Scene 2: Filter by category (Shoes)...');
    const shoesBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.trim() === 'Shoes');
    });
    if (shoesBtn) {
        await shoesBtn.click();
        await sleep(400);
        await captureFrame(3);
    }

    console.log('Capturing Scene 3: Switch to Swipe View...');
    const swipeBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Swipe'));
    });
    if (swipeBtn) {
        await swipeBtn.click();
        await sleep(500);
        await captureFrame(4);
    }

    console.log('Capturing Scene 4: Tinder-style Card Swiping with Tactile Dock...');
    const nextBtn = await page.$('button[title*="Next"]');
    if (nextBtn) {
        for (let s = 0; s < 3; s++) {
            await nextBtn.click();
            await sleep(350);
            await captureFrame(2);
        }
    }

    // Toggle favorite on card
    const favDockBtn = await page.$('button[title*="Favorite"]');
    if (favDockBtn) {
        await favDockBtn.click();
        await sleep(350);
        await captureFrame(3);
    }

    console.log('Capturing Scene 5: Back to Grid Mode...');
    const allCatBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.trim() === 'All');
    });
    if (allCatBtn) {
        await allCatBtn.click();
        await sleep(300);
    }

    const gridBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Grid'));
    });
    if (gridBtn) {
        await gridBtn.click();
        await sleep(400);
        await captureFrame(4);
    }

    await browser.close();
    console.log(`Captured ${frameCount} frames. Generating optimized GIF via ffmpeg...`);

    const ffmpegCmd = `/opt/homebrew/bin/ffmpeg -y -framerate 4 -i "${FRAMES_DIR}/frame_%04d.png" -vf "fps=6,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${OUTPUT_GIF}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });

    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    console.log(`Demo GIF updated at: ${OUTPUT_GIF}`);
}

record().catch((err) => {
    console.error('Error generating GIF:', err);
    process.exit(1);
});
