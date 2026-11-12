import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const FRAMES_DIR = path.resolve('temp_reel_frames');
const OUTPUT_GIF = path.resolve('assets/reel-demo.gif');
const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function recordReel() {
    if (fs.existsSync(FRAMES_DIR)) {
        fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(FRAMES_DIR, { recursive: true });

    console.log('Launching mobile browser simulation for 9:16 Reel...');
    const browser = await puppeteer.launch({
        executablePath: BRAVE_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // 9:16 mobile aspect ratio viewport (iPhone 14 style)
    await page.setViewport({ width: 390, height: 750, isMobile: true, hasTouch: true });

    // Inject session token for user
    await page.evaluateOnNewDocument(() => {
        localStorage.setItem('token', 'c845dc5d8f6d7aa8fb6f94c64c752187');
    });

    console.log('Navigating to http://localhost:5173 on mobile...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(1500);

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

    console.log('Frame 1: Mobile Grid View (2-column layout)...');
    await captureFrame(4);

    // Scroll down mobile grid
    const mainContainer = await page.$('main > div');
    if (mainContainer) {
        for (let scrollY of [150, 320, 180, 0]) {
            await page.evaluate((el, y) => { el.scrollTop = y; }, mainContainer, scrollY);
            await sleep(150);
            await captureFrame(1);
        }
    }
    await captureFrame(2);

    console.log('Frame 2: Switch to Swipe Mode on mobile...');
    const swipeBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Swipe'));
    });
    if (swipeBtn) {
        await swipeBtn.click();
        await sleep(500);
        await captureFrame(4);
    }

    console.log('Frame 3: Tinder Swiping on mobile...');
    const nextBtn = await page.$('button[title*="Next"]');
    if (nextBtn) {
        for (let s = 0; s < 3; s++) {
            await nextBtn.click();
            await sleep(350);
            await captureFrame(2);
        }
    }

    // Toggle favorite with glowing heart
    const favDockBtn = await page.$('button[title*="Favorite"]');
    if (favDockBtn) {
        await favDockBtn.click();
        await sleep(350);
        await captureFrame(3);
    }

    console.log('Frame 4: Open mobile drawer menu...');
    const menuBtn = await page.$('button.mobile-menu-btn');
    if (menuBtn) {
        await menuBtn.click();
        await sleep(400);
        await captureFrame(4);
    }

    await browser.close();
    console.log(`Captured ${frameCount} mobile frames. Generating vertical Reel GIF...`);

    const ffmpegCmd = `/opt/homebrew/bin/ffmpeg -y -framerate 4 -i "${FRAMES_DIR}/frame_%04d.png" -vf "fps=6,scale=390:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${OUTPUT_GIF}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });

    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    console.log(`Vertical 9:16 mobile Reel demo generated at: ${OUTPUT_GIF}`);
}

recordReel().catch(err => {
    console.error('Error generating reel:', err);
    process.exit(1);
});
