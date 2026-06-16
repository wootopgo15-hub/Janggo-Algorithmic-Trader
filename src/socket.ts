import { io } from 'socket.io-client';
export const socket = io('/', { transports: ['websocket'] });

socket.on("connect_error", () => {
    // silently catch connection errors
});
