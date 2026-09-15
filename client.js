const net = require('net');
const readline = require('readline');

let terminal;
let pending = '';

const client = net.createConnection(
    { host: '127.0.0.1', port: 8000 },
    () => {
        console.log('Connected to your server.');
        console.log('Type commands below. Type EXIT to disconnect.');

        terminal = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'myredis> '
        });

        terminal.prompt();

        terminal.on('line', (line) => {
            const command = line.trim();

            if (command.toUpperCase() === 'EXIT') {
                terminal.close();
                return;
            }

            if (!command) {
                terminal.prompt();
                return;
            }

            client.write(command + '\n');
        });

        terminal.on('close', () => {
            client.end();
        });
    }
);

client.setEncoding('utf8');

client.on('data', (data) => {
    pending += data;

    let end;

    while ((end = pending.indexOf('\n')) !== -1) {
        const reply = pending.slice(0, end);
        pending = pending.slice(end + 1);

        console.log(reply);

        if (terminal) {
            terminal.prompt();
        }
    }
});

client.on('error', (error) => {
    console.error('Connection error:', error.message);
});

client.on('close', () => {
    console.log('Disconnected.');

    if (terminal) {
        terminal.close();
    }
});