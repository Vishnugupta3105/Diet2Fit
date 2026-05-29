/**
 * WebRTC Signaling Server using Socket.io
 * Handles room-based video calling between admin (Dt. Disha) and clients
 */
function setupSignaling(io) {
  const videoNamespace = io.of('/video');

  videoNamespace.on('connection', (socket) => {
    console.log(`🎥 User connected to video: ${socket.id}`);

    // Join a specific room
    socket.on('join-room', ({ roomId, userId, userName }) => {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userId = userId;
      socket.userName = userName;

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        socketId: socket.id,
        userId,
        userName,
      });

      // Send list of existing users in room
      const room = videoNamespace.adapter.rooms.get(roomId);
      const users = [];
      if (room) {
        for (const id of room) {
          if (id !== socket.id) {
            const s = videoNamespace.sockets.get(id);
            if (s) {
              users.push({
                socketId: id,
                userId: s.userId,
                userName: s.userName,
              });
            }
          }
        }
      }
      socket.emit('room-users', users);

      console.log(`👤 ${userName} joined room ${roomId}`);
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
        console.log(`👋 ${socket.userName} left room ${socket.roomId}`);
      }
    });
  });
}

module.exports = setupSignaling;
