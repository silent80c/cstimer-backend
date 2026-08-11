const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on("connection", (socket) => {

  // Create Room (User becomes the ROOM CREATOR / HOST)
  socket.on("create-room", ({ roomCode, name }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = name;
    socket.isHost = true; // Flagged as Room Creator

    rooms[roomCode] = {
      players: [{ id: socket.id, name, status: "Idle", isHost: true, completed: false }],
      roundInProgress: false
    };

    io.to(roomCode).emit("room-update", { players: rooms[roomCode].players });
  });

  // Join Room
  socket.on("join-room", ({ roomCode, name }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = name;
    socket.isHost = false; // Regular joined player

    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: [], roundInProgress: false };
    }

    rooms[roomCode].players = rooms[roomCode].players.filter(p => p.id !== socket.id);
    rooms[roomCode].players.push({ id: socket.id, name, status: "Joined", isHost: false, completed: false });

    io.to(roomCode).emit("room-update", { players: rooms[roomCode].players });
  });

  // Update Player Solve Status & Check Room Completion
  socket.on("player-status-change", ({ roomCode, status, isFinished }) => {
    const room = rooms[roomCode];
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.status = status;
        if (isFinished) player.completed = true;
      }

      // Check if ALL players in the room have completed their solve
      const allFinished = room.players.length > 0 && room.players.every(p => p.completed);

      if (allFinished && room.roundInProgress) {
        room.roundInProgress = false;
        // Signal room that everyone is done
        io.to(roomCode).emit("all-players-finished");
      } else {
        io.to(roomCode).emit("room-update", { players: room.players });
      }
    }
  });

  // Kick Player (ONLY ALLOWED BY ROOM CREATOR / HOST)
  socket.on("kick-player", ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    // Strict Verification: Only execute if sender is socket.isHost
    if (room && socket.isHost) {
      // Notify target they were kicked
      io.to(targetId).emit("kicked");

      // Remove from room array
      room.players = room.players.filter(p => p.id !== targetId);

      // Remove socket from channel
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) targetSocket.leave(roomCode);

      // Broadcast updated player list
      io.to(roomCode).emit("room-update", { players: room.players });
    }
  });

  // Host Triggers Next Synced Scramble
  socket.on("trigger-next-round", ({ roomCode, scramble }) => {
    const room = rooms[roomCode];
    if (room && socket.isHost) {
      room.roundInProgress = true;
      room.players.forEach(p => p.completed = false); // Reset solve completion flags
      io.to(roomCode).emit("new-synced-round", { scramble });
    }
  });

  // Disconnect Handling
  socket.on("disconnect", () => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms[roomCode]) {
      rooms[roomCode].players = rooms[roomCode].players.filter(p => p.id !== socket.id);
      if (rooms[roomCode].players.length === 0) {
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit("room-update", { players: rooms[roomCode].players });
      }
    }
  });

  socket.on("kick-player", ({ roomCode, targetId }) => {
  const room = rooms[roomCode];
  if (room) {
    const requester = room.players.find(p => p.id === socket.id);
    if (requester && requester.isHost) {
      room.players = room.players.filter(p => p.id !== targetId);
      io.to(targetId).emit("kicked");
      io.to(roomCode).emit("room-update", { players: room.players });
    }
  }
});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
