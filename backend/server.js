// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// 設定 Socket.io 允許跨域請求
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Vite 預設 port
    methods: ["GET", "POST"]
  }
});

let waitingUser = null; // 儲存正在等待配對的用戶

io.on('connection', (socket) => {
  console.log(`小偷上線: ${socket.id}`);

  // 接收尋找配對請求
  socket.on('find_partner', () => {
    if (waitingUser) {
      // 有人在等，配對成功！建立一個專屬房間
      const roomName = `room_${waitingUser.id}_${socket.id}`;
      socket.join(roomName);
      waitingUser.join(roomName);

      // 通知雙方配對成功
      io.to(roomName).emit('chat_start');

      // 紀錄雙方所在的房間
      socket.room = roomName;
      waitingUser.room = roomName;
      
      // 清空等待位
      waitingUser = null; 
    } else {
      // 沒人在等，自己成為等待者
      waitingUser = socket;
    }
  });

  // 處理訊息發送
  socket.on('send_message', (msg) => {
    if (socket.room) {
      // 將訊息廣播給同房間的「其他人」
      socket.to(socket.room).emit('receive_message', msg);
    }
  });

  // 處理離開聊天室
  socket.on('leave_chat', () => {
    if (socket.room) {
      socket.to(socket.room).emit('partner_left');
      socket.leave(socket.room);
      socket.room = null;
    }
    if (waitingUser === socket) {
      waitingUser = null;
    }
  });

  // 處理斷線
  socket.on('disconnect', () => {
    console.log(`小偷下線: ${socket.id}`);
    if (socket.room) {
      socket.to(socket.room).emit('partner_left');
    }
    if (waitingUser === socket) {
      waitingUser = null;
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`後端伺服器運行於 port ${PORT}`);
});