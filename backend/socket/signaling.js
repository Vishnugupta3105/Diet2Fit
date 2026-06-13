/**
 * WebRTC Signaling Server using Socket.io
 * Handles room-based video calling between admin (Dt. Disha) and clients
 */
const activeRooms = {};

function setupSignaling(io) {
  const videoNamespace = io.of('/video');

  videoNamespace.on('connection', (socket) => {
    console.log(`🎥 User connected to video: ${socket.id}`);

    // Join the lobby to receive live presence updates
    socket.on('join-lobby', () => {
      socket.join('lobby');
      socket.emit('active-rooms-update', activeRooms);
    });

    // Join a specific video room
    socket.on('join-room', ({ roomId, userId, userName, role }) => {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userId = userId;
      socket.userName = userName;
      socket.role = role || 'client'; // default to client

      // Update global active rooms tracker
      if (!activeRooms[roomId]) activeRooms[roomId] = [];
      activeRooms[roomId].push({ userId, userName, role: socket.role, socketId: socket.id });

      // Broadcast to lobby that room state changed
      videoNamespace.to('lobby').emit('active-rooms-update', activeRooms);

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        socketId: socket.id,
        userId,
        userName,
        role: socket.role,
      });

      // Send list of existing users in room
      const roomUsers = activeRooms[roomId].filter(u => u.socketId !== socket.id);
      socket.emit('room-users', roomUsers);

      console.log(`👤 ${userName} (${socket.role}) joined room ${roomId}`);
    });

    // Relay WebRTC offer
    socket.on('offer', ({ to, offer }) => {
      socket.to(to).emit('offer', {
        from: socket.id,
        offer,
        userName: socket.userName,
      });
    });

    // Relay WebRTC answer
    socket.on('answer', ({ to, answer }) => {
      socket.to(to).emit('answer', {
        from: socket.id,
        answer,
      });
    });

    // Relay ICE candidates
    socket.on('ice-candidate', ({ to, candidate }) => {
      socket.to(to).emit('ice-candidate', {
        from: socket.id,
        candidate,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-left', {
          socketId: socket.id,
          userId: socket.userId,
          userName: socket.userName,
        });
        
        // Remove from activeRooms tracker
        if (activeRooms[socket.roomId]) {
          activeRooms[socket.roomId] = activeRooms[socket.roomId].filter(u => u.socketId !== socket.id);
          if (activeRooms[socket.roomId].length === 0) {
            delete activeRooms[socket.roomId];
          }
          videoNamespace.to('lobby').emit('active-rooms-update', activeRooms);
        }

        console.log(`👋 ${socket.userName} left room ${socket.roomId}`);
      }
    });
  });
}

module.exports = setupSignaling;
