const net = require('net');

const database = new Map();
const expirationTimers = new Map();
const expirationTimes = new Map();

function clearExpiration(key) {
    if (expirationTimers.has(key)) {
        clearTimeout(expirationTimers.get(key));
        expirationTimers.delete(key);
    }

    expirationTimes.delete(key);
}

function removeIfExpired(key) {
    if (
        expirationTimes.has(key) &&
        Date.now() >= expirationTimes.get(key)
    ) {
        clearExpiration(key);
        database.delete(key);
    }
}

const server = net.createServer((connection) => {
    console.log('Client connected');

    connection.setEncoding('utf8');
    let pending = '';

    connection.on('data', (data) => {
        pending += data;

        let end;

        while ((end = pending.indexOf('\n')) !== -1) {
            const command = pending.slice(0, end).trim();
            pending = pending.slice(end + 1);

            if (!command) continue;

            console.log('Received:', command);

            const [action, key, ...words] = command.split(/\s+/);
            const operation = action.toUpperCase();

            removeIfExpired(key);

            if (operation === 'PING') {
                if (key !== undefined) {
                    connection.write('ERROR: Use PING\n');
                } else {
                    connection.write('PONG\n');
                }

            } else if (operation === 'SET') {
                if (!key || words.length === 0) {
                    connection.write('ERROR: Use SET key value\n');
                    continue;
                }

                let valueWords = [...words];
                let seconds = null;

                if (
                    valueWords.length >= 2 &&
                    valueWords[valueWords.length - 2]
                        .toUpperCase() === 'EX'
                ) {
                    const duration = valueWords[valueWords.length - 1];
                    seconds = Number(duration);

                    if (
                        !/^\d+$/.test(duration) ||
                        !Number.isInteger(seconds) ||
                        seconds < 1 ||
                        seconds > 2147483 ||
                        valueWords.length < 3
                    ) {
                        connection.write(
                            'ERROR: Use SET key value EX seconds\n'
                        );
                        continue;
                    }

                    valueWords = valueWords.slice(0, -2);
                }

                const value = valueWords.join(' ');

                clearExpiration(key);
                database.set(key, value);

                if (seconds !== null) {
                    expirationTimes.set(
                        key,
                        Date.now() + seconds * 1000
                    );

                    const timer = setTimeout(() => {
                        database.delete(key);
                        expirationTimers.delete(key);
                        expirationTimes.delete(key);

                        console.log('Expired:', key);
                    }, seconds * 1000);

                    expirationTimers.set(key, timer);
                }

                connection.write('OK\n');

            } else if (operation === 'GET') {
                if (!key || words.length > 0) {
                    connection.write('ERROR: Use GET key\n');
                } else if (database.has(key)) {
                    connection.write(database.get(key) + '\n');
                } else {
                    connection.write('(nil)\n');
                }

            } else if (operation === 'DEL') {
                if (!key || words.length > 0) {
                    connection.write('ERROR: Use DEL key\n');
                } else {
                    clearExpiration(key);

                    const deleted = database.delete(key);
                    connection.write(deleted ? '1\n' : '0\n');
                }

            } else if (operation === 'TTL') {
                if (!key || words.length > 0) {
                    connection.write('ERROR: Use TTL key\n');
                } else if (!database.has(key)) {
                    connection.write('-2\n');
                } else if (!expirationTimes.has(key)) {
                    connection.write('-1\n');
                } else {
                    const remaining = Math.max(
                        0,
                        Math.round(
                            (expirationTimes.get(key) - Date.now()) / 1000
                        )
                    );

                    connection.write(remaining + '\n');
                }

            } else {
                connection.write(
                    'ERROR: Use PING, SET, GET, DEL, or TTL\n'
                );
            }
        }
    });

    connection.on('error', (error) => {
        console.error('Client error:', error.message);
    });

    connection.on('end', () => {
        console.log('Client disconnected');
    });
});

server.on('error', (error) => {
    console.error('Server error:', error.message);
});

server.listen(8000, '127.0.0.1', () => {
    console.log('Custom Redis Server ready on port 8000');
});