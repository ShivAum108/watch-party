const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, message: "Watch party server is running" });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

/* =====================
   IN-MEMORY ROOM STORE
===================== */
const rooms = {};

/* =====================
   HELPERS
===================== */
function createDefaultVideoState() {
  return {
    videoId: "aIIEI33EUqI",
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
  };
}

function getRoom(roomId) {
  return rooms[roomId];
}

function getParticipant(room, socketId) {
  return room?.participants.find((p) => p.id === socketId);
}

function canControlPlayback(user) {
  return user && (user.role === "host" || user.role === "moderator");
}

function sanitizeUsername(username) {
  return String(username || "").trim().slice(0, 30);
}

function sanitizeRole(role) {
  const allowedRoles = ["host", "moderator", "participant"];
  return allowedRoles.includes(role) ? role : null;
}

function emitRoomParticipants(roomId, eventName, extra = {}) {
  const room = getRoom(roomId);
  if (!room) return;

  io.to(roomId).emit(eventName, {
    participants: room.participants,
    hostId: room.host,
    ...extra,
  });
}

function transferHostIfNeeded(room) {
  if (!room) return;

  const hasHost = room.participants.some((p) => p.role === "host");
  if (hasHost) {
    const hostUser = room.participants.find((p) => p.role === "host");
    if (hostUser) {
      room.host = hostUser.id;
    }
    return;
  }

  if (room.participants.length > 0) {
    room.participants[0].role = "host";
    room.host = room.participants[0].id;
  }
}

function removeUserFromRoom(socket, roomId, reason = "left") {
  const room = getRoom(roomId);
  if (!room) return;

  const leavingUser = getParticipant(room, socket.id);
  if (!leavingUser) return;

  const wasHost = room.host === socket.id;

  room.participants = room.participants.filter((p) => p.id !== socket.id);
  socket.leave(roomId);

  if (room.participants.length === 0) {
    delete rooms[roomId];
    return;
  }

  if (wasHost) {
    transferHostIfNeeded(room);
  }

  io.to(roomId).emit("user_left", {
    userId: leavingUser.id,
    username: leavingUser.username,
    reason,
    participants: room.participants,
    hostId: room.host,
  });
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  /* =====================
     JOIN ROOM
  ===================== */
  socket.on("join_room", ({ roomId, username }, ack) => {
    try {
      if (!roomId) {
        ack?.({ ok: false, message: "roomId is required" });
        return;
      }

      const cleanUsername = sanitizeUsername(username);
      if (!cleanUsername) {
        ack?.({ ok: false, message: "username is required" });
        return;
      }

      if (!rooms[roomId]) {
        rooms[roomId] = {
          host: socket.id,
          participants: [],
          videoState: createDefaultVideoState(),
        };
      }

      const room = rooms[roomId];

      const usernameTaken = room.participants.some(
        (p) => p.username.toLowerCase() === cleanUsername.toLowerCase()
      );

      if (usernameTaken) {
        ack?.({ ok: false, message: "Username already taken in this room" });
        return;
      }

      socket.join(roomId);

      const role = room.participants.length === 0 ? "host" : "participant";

      const user = {
        id: socket.id,
        username: cleanUsername,
        role,
      };

      room.participants.push(user);

      socket.data.roomId = roomId;
      socket.data.username = cleanUsername;

      socket.emit("sync_state", room.videoState);

      io.to(roomId).emit("user_joined", {
        userId: user.id,
        username: user.username,
        role: user.role,
        participants: room.participants,
        hostId: room.host,
      });

      ack?.({
        ok: true,
        participant: user,
        participants: room.participants,
        hostId: room.host,
      });
    } catch (error) {
      console.error("join_room error:", error);
      ack?.({ ok: false, message: "Failed to join room" });
    }
  });

  /* =====================
     PLAY
  ===================== */
  socket.on("play", ({ roomId, currentTime }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const user = getParticipant(room, socket.id);
    if (!canControlPlayback(user)) return;

    if (typeof currentTime === "number" && !Number.isNaN(currentTime)) {
      room.videoState.currentTime = currentTime;
    }

    room.videoState.isPlaying = true;
    room.videoState.updatedAt = Date.now();

    socket.to(roomId).emit("play", {
      currentTime: room.videoState.currentTime,
    });
  });

  /* =====================
     PAUSE
  ===================== */
  socket.on("pause", ({ roomId, currentTime }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const user = getParticipant(room, socket.id);
    if (!canControlPlayback(user)) return;

    if (typeof currentTime === "number" && !Number.isNaN(currentTime)) {
      room.videoState.currentTime = currentTime;
    }

    room.videoState.isPlaying = false;
    room.videoState.updatedAt = Date.now();

    socket.to(roomId).emit("pause", {
      currentTime: room.videoState.currentTime,
    });
  });

  /* =====================
     SEEK
  ===================== */
  socket.on("seek", ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const user = getParticipant(room, socket.id);
    if (!canControlPlayback(user)) return;
    if (typeof time !== "number" || Number.isNaN(time)) return;

    room.videoState.currentTime = time;
    room.videoState.updatedAt = Date.now();

    io.to(roomId).emit("seek", { time });
  });

  /* =====================
     CHANGE VIDEO
  ===================== */
  socket.on("change_video", ({ roomId, videoId }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const user = getParticipant(room, socket.id);
    if (!canControlPlayback(user)) return;
    if (!videoId || typeof videoId !== "string") return;

    const cleanVideoId = videoId.trim();
    if (!cleanVideoId) return;

    room.videoState.videoId = cleanVideoId;
    room.videoState.currentTime = 0;
    room.videoState.isPlaying = false;
    room.videoState.updatedAt = Date.now();

    io.to(roomId).emit("change_video", { videoId: cleanVideoId });
  });

  /* =====================
     ASSIGN ROLE
  ===================== */
  socket.on("assign_role", ({ roomId, userId, role }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const currentUser = getParticipant(room, socket.id);
    if (!currentUser || currentUser.role !== "host") return;

    const targetUser = getParticipant(room, userId);
    if (!targetUser) return;

    const safeRole = sanitizeRole(role);
    if (!safeRole) return;

    if (safeRole === "host") {
      room.participants.forEach((p) => {
        if (p.id === userId) {
          p.role = "host";
        } else if (p.role === "host") {
          p.role = "participant";
        }
      });
      room.host = userId;
    } else {
      targetUser.role = safeRole;
    }

    io.to(roomId).emit("role_assigned", {
      userId,
      role: safeRole,
      participants: room.participants,
      hostId: room.host,
    });
  });

  /* =====================
     REMOVE PARTICIPANT
  ===================== */
  socket.on("remove_participant", ({ roomId, userId }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const currentUser = getParticipant(room, socket.id);
    if (!currentUser || currentUser.role !== "host") return;
    if (socket.id === userId) return;

    const targetUser = getParticipant(room, userId);
    if (!targetUser) return;

    room.participants = room.participants.filter((p) => p.id !== userId);

    const targetSocket = io.sockets.sockets.get(userId);
    if (targetSocket) {
      targetSocket.emit("kicked", { roomId });
      targetSocket.leave(roomId);
      targetSocket.data.roomId = undefined;
    }

    if (room.participants.length === 0) {
      delete rooms[roomId];
      return;
    }

    transferHostIfNeeded(room);

    io.to(roomId).emit("participant_removed", {
      userId,
      participants: room.participants,
      hostId: room.host,
    });
  });

  /* =====================
     LEAVE ROOM
  ===================== */
  socket.on("leave_room", ({ roomId }) => {
    removeUserFromRoom(socket, roomId, "left");
    socket.data.roomId = undefined;
  });

  /* =====================
     DISCONNECT
  ===================== */
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      removeUserFromRoom(socket, roomId, "disconnected");
    }
    console.log("Socket disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});