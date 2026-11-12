import { exec } from 'child_process';
import net from 'net';

const START_PORT = 5173;
const MAX_PORT = 5183;
const RETRY_INTERVAL = 1000;
const MAX_RETRIES = 60; // Wait up to 60 seconds

const checkPort = (port) => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(200);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, '127.0.0.1');
    });
};

const findActivePort = async () => {
    for (let i = 0; i < MAX_RETRIES; i++) {
        for (let port = START_PORT; port <= MAX_PORT; port++) {
            const isOpen = await checkPort(port);
            if (isOpen) {
                return port;
            }
        }
        await new Promise(r => setTimeout(r, RETRY_INTERVAL));
        if (i % 5 === 0) process.stdout.write('.');
    }
    return null;
};

const checkNgrokInstalled = () => {
    return new Promise((resolve) => {
        exec('ngrok version', (error) => {
            resolve(!error);
        });
    });
};

const fetchPublicUrl = async () => {
    for (let i = 0; i < 15; i++) {
        try {
            const res = await fetch('http://127.0.0.1:4040/api/tunnels');
            if (res.ok) {
                const data = await res.json();
                const tunnel = data.tunnels?.find(t => t.public_url);
                if (tunnel?.public_url) {
                    return tunnel.public_url;
                }
            }
        } catch {
            // Tunnel API not yet ready
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return null;
};

const startNgrok = async () => {
    if (process.env.SKIP_NGROK === 'true') {
        console.log('[ngrok] SKIP_NGROK=true set; remote tunnel disabled.');
        return;
    }

    const hasNgrok = await checkNgrokInstalled();
    if (!hasNgrok) {
        console.log('\n[ngrok] Note: "ngrok" CLI was not found on your system PATH.');
        console.log('[ngrok] Remote tunneling is skipped. Access the app locally at http://localhost:5173');
        console.log('[ngrok] (To enable remote tunneling later, install ngrok from https://ngrok.com)\n');
        return;
    }

    console.log('Scanning for active Vite server (checking ports 5173-5183)...');
    const port = await findActivePort();

    if (!port) {
        console.error('\nCould not find active dev server port within timeout.');
        process.exit(1);
    }

    console.log(`\nFound active frontend on port ${port}. Starting ngrok tunnel...`);

    const cmd = `ngrok http ${port} --log=stdout > ngrok.log`;
    const child = exec(cmd);

    child.stderr.on('data', (data) => {
        process.stderr.write(data);
    });

    child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.log(`\n[ngrok] Tunnel closed (exit code: ${code}). See ngrok.log for details.`);
        }
    });

    // Attempt to retrieve and print the public URL
    fetchPublicUrl().then((url) => {
        if (url) {
            console.log(`\n🎉 Public URL ready: \x1b[32m${url}\x1b[0m`);
            console.log(`   Share this link to access ShopDeck on any device!\n`);
        }
    });

    const cleanup = () => {
        if (!child.killed) {
            console.log('Stopping ngrok...');
            child.kill();
        }
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
};

startNgrok();
