const net = require('node:net');

const PORT = 8000;

const server = net.createServer((connection) => {
    console.log('Client connected');

    connection.on('end', () => {
        console.log('Client disconnected');
    });

    connection.on('error', (error) => {
        console.error('Client error:', error.message);
    });
});

server.on('error', (error) => {
    console.error('Server error:', error.message);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Custom Redis Server listening on port ${PORT}`);
});