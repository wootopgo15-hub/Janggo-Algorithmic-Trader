import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');
socket.on('connect', () => {
    console.log('connected');
});
socket.on('seed:BTC/USDT', (data) => {
    console.log('seed length:', data.length);
});
socket.on('candle:BTC/USDT', (candle) => {
    console.log('received candle:', candle);
});

setTimeout(() => {
    console.log('timeout');
    process.exit(0);
}, 5000);
