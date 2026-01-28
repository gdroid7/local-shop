import { exec, spawn } from 'child_process';
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
            resolve(true); // Something is listening
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
                // Check if it's likely our vite server? 
                // In simpler environments, just finding the open port is usually enough.
                // But 3000 is also open (backend). We loop from 5173, so we should hit vite first unless backend is on 5173.
                // Backend is on 3000. So we are good.
                return port;
            }
        }
        // No port found, wait and retry
        await new Promise(r => setTimeout(r, RETRY_INTERVAL));
        if (i % 5 === 0) process.stdout.write('.');
    }
    return null;
};

const startNgrok = async () => {
    console.log('Scanning for active Vite server (checking ports 5173-5183)...');
    const port = await findActivePort();

    if (!port) {
        console.error('\nCould not find active dev server port within timeout.');
        process.exit(1);
    }

    console.log(`\nFound active service on port ${port}. Starting ngrok...`);

    // Create write stream for log if needed, or just redirect in shell.
    // The command from package.json was: ngrok http 5173 --log=stdout > ngrok.log
    // We can replicate this using spawn and stream redirection, or just exec.
    // exec handles the redirection string for us if we use shell.

    const cmd = `ngrok http ${port} --log=stdout > ngrok.log`;
    console.log(`Executing: ${cmd}`);

    const child = exec(cmd);

    child.stderr.on('data', (data) => {
        process.stderr.write(data);
    });

    child.on('exit', (code) => {
        console.log(`ngrok process exited with code ${code}`);
        process.exit(code || 0);
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
