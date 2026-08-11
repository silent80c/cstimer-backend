const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};

io.on("connection", (socket) => {
  socket.on("create-room", ({ roomCode, name }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = name;
    socket.isHost = true;

    rooms[roomCode] = [
      { id: socket.id, name, status: "Idle", isHost: true }
    ];

    io.to(roomCode).emit("room-update", { players: rooms[roomCode] });
  });

  socket.on("join-room", ({ roomCode, name }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = name;
    socket.isHost = false;

    if (!rooms[roomCode]) rooms[roomCode] = [];
    
    // Remove duplicate entry if reconnection happens
    rooms[roomCode] = rooms[roomCode].filter(p => p.id !== socket.id);
    rooms[roomCode].push({ id: socket.id, name, status: "Joined", isHost: false });

    io.to(roomCode).emit("room-update", { players: rooms[roomCode] });
  });

  socket.on("player-status-change", ({ roomCode, status }) => {
    if (rooms[roomCode]) {
      const player = rooms[roomCode].find(p => p.id === socket.id);
      if (player) player.status = status;
      io.to(roomCode).emit("room-update", { players: rooms[roomCode] });
    }
  });

  socket.on("disconnect", () => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms[roomCode]) {
      rooms[roomCode] = rooms[roomCode].filter(p => p.id !== socket.id);
      if (rooms[roomCode].length === 0) {
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit("room-update", { players: rooms[roomCode] });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
