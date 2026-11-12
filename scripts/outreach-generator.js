import fs from 'fs';
import path from 'path';

// Curated directory of high-visibility repository showcase accounts & tech curators on X
const CURATED_TARGETS = [
    // Tech & GitHub Repository Curators
    {
        name: 'GitHub Projects',
        handle: 'githubprojects',
        platform: 'x',
        category: 'tech_curator',
        followers: '120K+',
        bio: 'Curating the most interesting open-source repositories daily.',
        angle: 'Open-source showcase feature'
    },
    {
        name: 'Daily Dev Tips',
        handle: 'DailyDevTips',
        platform: 'x',
        category: 'tech_curator',
        followers: '85K+',
        bio: 'Sharing cool tools, web dev tricks, and open source projects.',
        angle: 'Developer tool showcase'
    },
    {
        name: 'Madza',
        handle: 'madzadev',
        platform: 'x',
        category: 'tech_curator',
        followers: '190K+',
        bio: 'Shares web dev resources, GitHub repos, and UI design inspiration.',
        angle: 'Web dev & UI resource roundups'
    },
    {
        name: 'Catalin Pit',
        handle: 'catalinmpit',
        platform: 'x',
        category: 'tech_curator',
        followers: '170K+',
        bio: 'Software engineer sharing useful repositories and developer gems.',
        angle: 'Project spotlight'
    },
    {
        name: 'Florin Pop',
        handle: 'florinpop1705',
        platform: 'x',
        category: 'tech_curator',
        followers: '150K+',
        bio: 'Web development, 100 projects challenges, and open source discoveries.',
        angle: 'Creative React side-project'
    },
    {
        name: 'Prathamesh',
        handle: 'Prathkum',
        platform: 'x',
        category: 'tech_curator',
        followers: '130K+',
        bio: 'Threads on cool GitHub repos, developer productivity, and web design.',
        angle: 'Cool repositories thread feature'
    },
    {
        name: 'Francesco Ciulla',
        handle: 'FrancescoCiull4',
        platform: 'x',
        category: 'tech_curator',
        followers: '210K+',
        bio: 'Open source advocate sharing daily open-source projects.',
        angle: 'Open source spotlight'
    },
    {
        name: 'Marko Denic',
        handle: 'denicmarko',
        platform: 'x',
        category: 'tech_curator',
        followers: '110K+',
        bio: 'Curator of web tools, open-source gems, and dev resources.',
        angle: 'Useful tools thread'
    },

    // Fashion / Lifestyle / Micro-Influencers & Stylists
    {
        name: 'The Capsule Wardrobe',
        handle: 'capsule_closet',
        platform: 'threads_insta',
        category: 'fashion_lifestyle',
        followers: '25K',
        bio: 'Helping you curate minimal outfits and avoid shopping regret.',
        angle: 'Shortlisting & decision paralysis'
    },
    {
        name: 'Outfit Decisions',
        handle: 'outfitcuration',
        platform: 'threads_insta',
        category: 'fashion_lifestyle',
        followers: '18K',
        bio: 'Style advice, event shopping, and wedding guest shortlist help.',
        angle: 'Outfit coordination board'
    },
    {
        name: 'Smart Shopper Finds',
        handle: 'smartshopfinds',
        platform: 'threads_insta',
        category: 'fashion_lifestyle',
        followers: '40K',
        bio: 'Fashion finds across Amazon, Zara, ASOS, and Myntra.',
        angle: 'Universal shopping visualizer'
    },
    {
        name: 'Bridal & Event Style',
        handle: 'eventstyleguide',
        platform: 'threads_insta',
        category: 'fashion_lifestyle',
        followers: '30K',
        bio: 'Curating bridesmaid looks, heels, dresses, and accessories.',
        angle: 'Multi-store look coordination'
    },

    // Indie Hackers / Build in Public Curators
    {
        name: 'Indie Hackers Daily',
        handle: 'indiehackers',
        platform: 'x',
        category: 'indie_hacker',
        followers: '140K+',
        bio: 'Stories and projects from bootstrapped creators.',
        angle: 'Local-first side project launch'
    },
    {
        name: 'Build in Public Hub',
        handle: 'BuildInPublic',
        platform: 'x',
        category: 'indie_hacker',
        followers: '65K+',
        bio: 'Showcasing genuine maker projects solving real personal problems.',
        angle: 'Solving personal problem story'
    }
];

// Pitch Generator Templates
function generatePitch(target) {
    const repoUrl = 'https://github.com/gdroid7/shopDeck';
    const demoUrl = 'https://corliss-unveracious-onward.ngrok-free.dev';

    if (target.category === 'tech_curator') {
        const text = `Hey @${target.handle}! Love your repo curation threads. 

Built a local-first open-source tool called ShopDeck — turns messy shopping links from WhatsApp/notes (Amazon, Zara, Myntra) into a visual deck with a Tinder-style swipe UI to shortlist purchases.

Stack: React 19, Vite, Express, Cheerio, Better-SQLite3
Repo: ${repoUrl}

Attached a 7s preview. Thought your audience might like checking it out! 🚀`;

        const encodedTweet = encodeURIComponent(`Hey @${target.handle}, built a local-first open-source tool: ShopDeck — a Tinder-style swipe visualizer for messy shopping links (React 19 + SQLite). Check it out: ${repoUrl}`);
        const tweetUrl = `https://x.com/intent/tweet?text=${encodedTweet}`;
        const dmUrl = `https://x.com/messages/compose?recipient_id=&text=${encodeURIComponent(text)}`;

        return { text, tweetUrl, dmUrl };
    }

    if (target.category === 'fashion_lifestyle') {
        const text = `Hey ${target.name}! ✨ Loved your recent styling advice.

Quick question: whenever you're planning an outfit for a trip or event, how many shopping tabs do you end up juggling across Zara, ASOS, and Amazon?

I built a free visual tool called ShopDeck to fix this: you just dump all your messy links (or WhatsApp chat notes), and it renders a clean outfit board where you can swipe through items Tinder-style to pick the final shoe or dress.

Check the live preview: ${demoUrl}
Open source: ${repoUrl}

Would love your take on whether this would help your followers style hauls faster!`;

        const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(`Check out ShopDeck: Tinder-style swipe shortlisted outfits across Zara, ASOS & Amazon in one visual board ✨ ${demoUrl}`)}`;
        const dmUrl = `https://x.com/messages/compose?text=${encodeURIComponent(text)}`;

        return { text, tweetUrl, dmUrl };
    }

    // Indie Hacker
    const text = `Hey @${target.handle}! Built a small local-first project: ShopDeck.

The problem: Planning an outfit or event means 20 open tabs across 5 stores and a WhatsApp chat full of raw URLs.
The fix: Universal scraper + Tinder-style swipe cards to eliminate options down to 1 winner.

Tech: React 19, SQLite, Cheerio, Vite.
Repo: ${repoUrl}

Feedback welcome!`;

    const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(`Built ShopDeck: A local-first decision engine for event shopping with a Tinder-style swipe UI. Free & open source: ${repoUrl}`)}`;
    const dmUrl = `https://x.com/messages/compose?text=${encodeURIComponent(text)}`;

    return { text, tweetUrl, dmUrl };
}

// Generate Interactive HTML Outreach Dashboard
function buildDashboard() {
    const targetsWithPitches = CURATED_TARGETS.map(t => ({
        ...t,
        pitch: generatePitch(t)
    }));

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ShopDeck — Outreach Hub</title>
    <style>
        :root {
            --bg-primary: #0a0a0c;
            --bg-secondary: #121216;
            --bg-card: #18181e;
            --text-primary: #f4f4f5;
            --text-secondary: #a1a1aa;
            --accent: #6366f1;
            --accent-hover: #4f46e5;
            --border: rgba(255, 255, 255, 0.08);
            --success: #10b981;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            padding: 2rem;
            line-height: 1.5;
        }
        .header {
            max-width: 1100px;
            margin: 0 auto 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
            padding-bottom: 1.5rem;
        }
        h1 { font-size: 1.75rem; font-weight: 800; background: linear-gradient(135deg, #fff, #a1a1aa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .stats { display: flex; gap: 1.5rem; font-size: 0.9rem; color: var(--text-secondary); }
        .filter-bar {
            max-width: 1100px;
            margin: 0 auto 1.5rem;
            display: flex;
            gap: 0.5rem;
        }
        .filter-btn {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            padding: 0.5rem 1rem;
            border-radius: 999px;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 600;
            transition: all 0.2s;
        }
        .filter-btn.active, .filter-btn:hover {
            background: var(--accent);
            color: white;
            border-color: var(--accent);
        }
        .grid {
            max-width: 1100px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
            gap: 1.25rem;
        }
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 1.25rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 1rem;
            transition: transform 0.2s, border-color 0.2s;
        }
        .card:hover { border-color: rgba(255, 255, 255, 0.18); transform: translateY(-2px); }
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .target-name { font-size: 1.1rem; font-weight: 700; color: #fff; }
        .target-handle { font-size: 0.85rem; color: var(--accent); text-decoration: none; display: block; margin-top: 2px; }
        .target-tag { font-size: 0.75rem; padding: 2px 8px; border-radius: 6px; background: rgba(99, 102, 241, 0.15); color: #818cf8; font-weight: 600; }
        .bio { font-size: 0.85rem; color: var(--text-secondary); }
        .message-box {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            padding: 0.85rem;
            border-radius: 8px;
            font-size: 0.825rem;
            color: #d4d4d8;
            white-space: pre-wrap;
            max-height: 140px;
            overflow-y: auto;
            font-family: monospace;
        }
        .actions { display: flex; gap: 0.5rem; }
        .btn {
            flex: 1;
            padding: 0.6rem;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            text-align: center;
            text-decoration: none;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        .btn-copy { background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border); color: #fff; }
        .btn-copy:hover { background: rgba(255, 255, 255, 0.15); }
        .btn-send { background: var(--accent); border: none; color: white; }
        .btn-send:hover { background: var(--accent-hover); }
        .status-pill {
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.75rem;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-secondary);
        }
        .status-pill.contacted { background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.3); }
    </style>
</head>
<body>

    <div class="header">
        <div>
            <h1>ShopDeck Outreach Hub</h1>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
                Curated creator registry with one-click direct message & tweet launches.
            </p>
        </div>
        <div class="stats">
            <div>Total Targets: <strong style="color: #fff;">${targetsWithPitches.length}</strong></div>
            <div>Sent: <strong style="color: var(--success);" id="sentCount">0</strong></div>
        </div>
    </div>

    <div class="filter-bar">
        <button class="filter-btn active" onclick="filterCategory('all')">All Targets (${targetsWithPitches.length})</button>
        <button class="filter-btn" onclick="filterCategory('tech_curator')">GitHub & Tech Curators</button>
        <button class="filter-btn" onclick="filterCategory('fashion_lifestyle')">Fashion & Lifestyle Stylists</button>
        <button class="filter-btn" onclick="filterCategory('indie_hacker')">Indie Hacker Curators</button>
    </div>

    <div class="grid" id="targetGrid">
        ${targetsWithPitches.map((t, idx) => `
            <div class="card" data-cat="${t.category}" id="card-${idx}">
                <div>
                    <div class="card-header">
                        <div>
                            <div class="target-name">${t.name}</div>
                            <a href="https://x.com/${t.handle}" target="_blank" class="target-handle">@${t.handle} (${t.followers})</a>
                        </div>
                        <button class="status-pill" id="status-${idx}" onclick="toggleStatus(${idx})">Pending</button>
                    </div>
                    <p class="bio" style="margin: 0.5rem 0;">${t.bio}</p>
                    <div class="message-box" id="msg-${idx}">${t.pitch.text}</div>
                </div>

                <div class="actions">
                    <button class="btn btn-copy" onclick="copyMessage(${idx})">📋 Copy</button>
                    <a href="${t.pitch.tweetUrl}" target="_blank" class="btn btn-send" onclick="markSent(${idx})">🐦 Tweet / DM</a>
                </div>
            </div>
        `).join('')}
    </div>

    <script>
        function copyMessage(idx) {
            const text = document.getElementById('msg-' + idx).innerText;
            navigator.clipboard.writeText(text).then(() => {
                alert('Copied personalized pitch to clipboard!');
            });
        }

        function markSent(idx) {
            const pill = document.getElementById('status-' + idx);
            pill.innerText = '✓ Sent';
            pill.classList.add('contacted');
            localStorage.setItem('status-' + idx, 'sent');
            updateCount();
        }

        function toggleStatus(idx) {
            const pill = document.getElementById('status-' + idx);
            if (pill.classList.contains('contacted')) {
                pill.innerText = 'Pending';
                pill.classList.remove('contacted');
                localStorage.removeItem('status-' + idx);
            } else {
                markSent(idx);
            }
            updateCount();
        }

        function updateCount() {
            let sent = 0;
            for (let i = 0; i < ${targetsWithPitches.length}; i++) {
                if (localStorage.getItem('status-' + i) === 'sent') sent++;
            }
            document.getElementById('sentCount').innerText = sent;
        }

        function filterCategory(cat) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');

            document.querySelectorAll('.card').forEach(card => {
                if (cat === 'all' || card.getAttribute('data-cat') === cat) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        // Restore saved status on load
        window.addEventListener('DOMContentLoaded', () => {
            for (let i = 0; i < ${targetsWithPitches.length}; i++) {
                if (localStorage.getItem('status-' + i) === 'sent') {
                    const pill = document.getElementById('status-' + i);
                    if (pill) {
                        pill.innerText = '✓ Sent';
                        pill.classList.add('contacted');
                    }
                }
            }
            updateCount();
        });
    </script>
</body>
</html>`;

    const outputPath = path.resolve('outreach/index.html');
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`Outreach Hub dashboard created at: ${outputPath}`);
}

buildDashboard();
