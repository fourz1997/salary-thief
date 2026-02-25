const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

let waitingUser = null; 
const activeRooms = {}; 
const userToRoom = {};  
const disconnectTimers = {}; 

io.on('connection', (socket) => {
  console.log('有新的連線:', socket.id);

  socket.on('register_user', (userId) => {
    socket.userId = userId;

    if (disconnectTimers[userId]) {
      clearTimeout(disconnectTimers[userId]);
      delete disconnectTimers[userId];
    }

    const roomId = userToRoom[userId];
    if (roomId && activeRooms[roomId]) {
      socket.join(roomId);
      socket.emit('reconnect_success', activeRooms[roomId].messages);
    }
  });

  socket.on('find_partner', () => {
    const userId = socket.userId;
    if (!userId) return;

    if (waitingUser && waitingUser.userId !== userId) {
      const roomId = `room_${Date.now()}`;
      const user1 = waitingUser.userId;
      const user2 = userId;

      activeRooms[roomId] = { user1, user2, messages: [] };
      userToRoom[user1] = roomId;
      userToRoom[user2] = roomId;

      waitingUser.socket.join(roomId);
      socket.join(roomId);

      io.to(roomId).emit('chat_start');
      waitingUser = null;
    } else {
      waitingUser = { userId, socket };
    }
  });

  socket.on('send_message', (msg) => {
    const userId = socket.userId;
    const roomId = userToRoom[userId];
    
    if (roomId && activeRooms[roomId]) {
      const messageData = { senderId: userId, text: msg };
      activeRooms[roomId].messages.push(messageData);
      socket.to(roomId).emit('receive_message', messageData);
    }
  });

  // 🌟【新增】：監聽正在打字的訊號，並偷偷告訴同房間的另一個人
  socket.on('typing', () => {
    const roomId = userToRoom[socket.userId];
    if (roomId) socket.to(roomId).emit('partner_typing');
  });

  // 🌟【新增】：監聽停止打字的訊號
  socket.on('stop_typing', () => {
    const roomId = userToRoom[socket.userId];
    if (roomId) socket.to(roomId).emit('partner_stop_typing');
  });

  socket.on('leave_chat', () => {
    handleUserLeave(socket.userId);
  });

  socket.on('disconnect', () => {
    const userId = socket.userId;
    if (!userId) return;

    if (waitingUser && waitingUser.userId === userId) {
      waitingUser = null;
    }

    const roomId = userToRoom[userId];
    if (roomId) {
      disconnectTimers[userId] = setTimeout(() => {
        handleUserLeave(userId);
      }, 5000); 
    }
  });

  function handleUserLeave(userId) {
    const roomId = userToRoom[userId];
    if (roomId) {
      io.to(roomId).emit('partner_left');
      
      const room = activeRooms[roomId];
      if (room) {
        delete userToRoom[room.user1];
        delete userToRoom[room.user2];
        delete activeRooms[roomId];
      }
    }
    if (disconnectTimers[userId]) {
      clearTimeout(disconnectTimers[userId]);
      delete disconnectTimers[userId];
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`後端伺服器升級完畢，運行於 port ${PORT}`);
});