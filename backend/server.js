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

// --- 雲端大腦的記憶體 ---
let waitingUser = null; // 正在尋找配對的人 { userId, socket }
const activeRooms = {}; // 記錄聊天室狀態：roomId -> { user1, user2, messages: [] }
const userToRoom = {};  // 查詢小偷在哪個房間：userId -> roomId
const disconnectTimers = {}; // 斷線等門計時器：userId -> timer

io.on('connection', (socket) => {
  console.log('有新的連線:', socket.id);

  // 1. 報上名來：前端一連線就會傳專屬 ID 過來
  socket.on('register_user', (userId) => {
    socket.userId = userId;

    // 如果他是在「等門時間」內回來的，趕快把倒數計時取消！
    if (disconnectTimers[userId]) {
      clearTimeout(disconnectTimers[userId]);
      delete disconnectTimers[userId];
      console.log('小偷重連成功:', userId);
    }

    // 檢查他原本是不是有房間？
    const roomId = userToRoom[userId];
    if (roomId && activeRooms[roomId]) {
      // 讓他重新加入原本的房間
      socket.join(roomId);
      // 把歷史對話紀錄打包還給他
      socket.emit('reconnect_success', activeRooms[roomId].messages);
    }
  });

  // 2. 尋找配對
  socket.on('find_partner', () => {
    const userId = socket.userId;
    if (!userId) return;

    if (waitingUser && waitingUser.userId !== userId) {
      // 配對成功，開新房間
      const roomId = `room_${Date.now()}`;
      const user1 = waitingUser.userId;
      const user2 = userId;

      // 幫房間建立記憶體
      activeRooms[roomId] = { user1, user2, messages: [] };
      userToRoom[user1] = roomId;
      userToRoom[user2] = roomId;

      // 兩人都拉進房間
      waitingUser.socket.join(roomId);
      socket.join(roomId);

      io.to(roomId).emit('chat_start');
      waitingUser = null;
    } else {
      waitingUser = { userId, socket };
    }
  });

  // 3. 傳送訊息
  socket.on('send_message', (msg) => {
    const userId = socket.userId;
    const roomId = userToRoom[userId];
    
    if (roomId && activeRooms[roomId]) {
      const messageData = { senderId: userId, text: msg };
      
      // 寫入雲端記憶體（給重整的人看）
      activeRooms[roomId].messages.push(messageData);
      
      // 廣播給房間裡的「其他人」（排除自己）
      socket.to(roomId).emit('receive_message', messageData);
    }
  });

  // 4. 正常離開（按離開按鈕或檢舉）
  socket.on('leave_chat', () => {
    handleUserLeave(socket.userId);
  });

  // 5. 意外斷線（例如：按下重新整理、網路不穩）
  socket.on('disconnect', () => {
    const userId = socket.userId;
    if (!userId) return;

    // 如果他還在排隊就斷線，取消他的排隊
    if (waitingUser && waitingUser.userId === userId) {
      waitingUser = null;
    }

    const roomId = userToRoom[userId];
    if (roomId) {
      // 啟動 5 秒的「等門機制」
      console.log(`小偷 ${userId} 斷線，等待 5 秒...`);
      disconnectTimers[userId] = setTimeout(() => {
        // 如果 5 秒後沒回來，就真的當他離開了
        handleUserLeave(userId);
      }, 5000); 
    }
  });

  // 負責拆除房間與通知對方的共用邏輯
  function handleUserLeave(userId) {
    const roomId = userToRoom[userId];
    if (roomId) {
      // 通知另一個人
      io.to(roomId).emit('partner_left');
      
      // 銷毀記憶體
      const room = activeRooms[roomId];
      if (room) {
        delete userToRoom[room.user1];
        delete userToRoom[room.user2];
        delete activeRooms[roomId];
      }
    }
    // 清除計時器
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