import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const getUserId = () => {
  let id = sessionStorage.getItem('st_userId');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('st_userId', id);
  }
  return id;
};

const userId = getUserId();
// ⚠️ 確認這裡是你的 Render 網址
const socket = io('https://salary-thief-backend.onrender.com');

export default function App() {
  const [appState, setAppState] = useState(() => {
    const saved = sessionStorage.getItem('st_appState');
    return saved === 'CHATTING' ? 'CHATTING' : 'ENTRY';
  });
  
  const [hourlyWage, setHourlyWage] = useState(() => sessionStorage.getItem('st_wage') || '');
  const [stolenMoney, setStolenMoney] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAgreed, setIsAgreed] = useState(false);
  const messagesEndRef = useRef(null);

  // 🌟【終極大絕招：用 JavaScript 監聽並強制改變網頁的真實高度】
  const [viewportHeight, setViewportHeight] = useState('100vh'); // 初始設定為整個螢幕高

  useEffect(() => {
    const handleResize = () => {
      // 只要發現有可視範圍 (visualViewport) 存在，我們就只用這個「真實能看見的高度」
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
        window.scrollTo(0, 0); // 防禦機制：如果有其他程式想把它往上推，我們強迫它在原地待好
      } else {
        setViewportHeight(`${window.innerHeight}px`);
      }
    };

    handleResize(); // 網頁載入時立刻抓取一次高度

    // 監聽各種「鍵盤彈出 / 收合 / 手機旋轉」的尺寸變化
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize); // IG 常常是用卷動事件偷蓋
    }
    window.addEventListener('resize', handleResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 當狀態改變時，隨時存進記憶卡
  useEffect(() => {
    sessionStorage.setItem('st_appState', appState);
    if (hourlyWage) sessionStorage.setItem('st_wage', hourlyWage);
  }, [appState, hourlyWage]);

  // 3. 計時器升級：用「真實時間差」計算，重整也不怕漏算錢！
  useEffect(() => {
    let timer;
    if (appState === 'CHATTING' && hourlyWage > 0) {
      let startTime = sessionStorage.getItem('st_startTime');
      if (!startTime) {
        startTime = Date.now();
        sessionStorage.setItem('st_startTime', startTime);
      }

      const moneyPerSecond = Number(hourlyWage) / 3600;
      timer = setInterval(() => {
        const elapsedSeconds = (Date.now() - parseInt(startTime)) / 1000;
        setStolenMoney(elapsedSeconds * moneyPerSecond);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [appState, hourlyWage]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Socket 事件監聽
  useEffect(() => {
    // 一連線，立刻向大腦報上身分證號碼
    socket.on('connect', () => {
      socket.emit('register_user', userId);
    });
    if (socket.connected) {
      socket.emit('register_user', userId);
    }

    // 🌟 收到大腦傳來的重連成功與歷史紀錄
    socket.on('reconnect_success', (historyMessages) => {
      setAppState('CHATTING');
      // 將歷史紀錄轉換成畫面看得懂的格式
      const formattedMessages = historyMessages.map(msg => ({
        sender: msg.senderId === userId ? 'me' : 'stranger',
        text: msg.text
      }));
      setMessages([
        { sender: 'system', text: '⚡️ 重新連線成功，已還原對話。' },
        ...formattedMessages
      ]);
    });

    socket.on('chat_start', () => {
      setAppState('CHATTING');
      sessionStorage.setItem('st_startTime', Date.now()); // 記錄進去房間的精準時間
      setMessages([{ sender: 'system', text: '已加入聊天室，正在和另一位薪水小偷連線。' }]);
    });

    socket.on('receive_message', (msgData) => {
      // 後端現在傳來的是物件 { senderId, text }
      setMessages(prev => [...prev, { sender: 'stranger', text: msgData.text }]);
    });

    socket.on('partner_left', () => {
      setMessages(prev => [...prev, { sender: 'system', text: '對方覺得賺夠了，已經回去工作（或被老闆抓到了）。' }]);
    });

    return () => {
      socket.off('connect');
      socket.off('reconnect_success');
      socket.off('chat_start');
      socket.off('receive_message');
      socket.off('partner_left');
    };
  }, []);

  const handleStartMatching = () => {
    if (!hourlyWage || isNaN(hourlyWage)) {
      alert('請先誠實輸入你的時薪（台幣）！');
      return;
    }
    if (!isAgreed) {
      alert('請先閱讀並勾選同意互助會公約，才能開始摸魚喔！');
      return;
    }
    setAppState('WAITING');
    socket.emit('register_user', userId); // 確保大腦知道是誰在排隊
    socket.emit('find_partner');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setMessages(prev => [...prev, { sender: 'me', text: inputValue }]);
    socket.emit('send_message', inputValue);
    setInputValue('');
    scrollToBottom(); 
  };

  // 離開時要清空記憶卡，免得下次一進來又卡在舊房間
  const resetChat = () => {
    setAppState('ENTRY');
    setStolenMoney(0);
    setMessages([]);
    setHourlyWage('');
    setIsAgreed(false);
    sessionStorage.removeItem('st_appState');
    sessionStorage.removeItem('st_startTime');
    sessionStorage.removeItem('st_wage');
  };

  const handleLeave = () => {
    if (window.confirm(`你確定要回去工作了嗎？你剛剛總共偷了 $${stolenMoney.toFixed(2)} 元喔！`)) {
      socket.emit('leave_chat');
      resetChat();
    }
  };

  const handleReport = () => {
    if (window.confirm('遇到怪人了嗎？確定要檢舉對方並離開？系統將立即切斷連線。')) {
      socket.emit('leave_chat');
      resetChat();
      setTimeout(() => {
        alert('已成功檢舉並離開該聊天室。感謝您協助維護互助會的優質摸魚環境！');
      }, 100);
    }
  };

  // 🌟【排版設計的防禦堡壘】將最外層鎖死為絕對定位，並動態吃我們計算出的高度
  return (
    <div 
      className="flex flex-col bg-gray-100 font-sans w-full"
      style={{
        height: viewportHeight, // 這裡會因為鍵盤彈出而「動態」變短，完全不吃 dvh 或 CSS 變數
        position: 'absolute',   // 鎖死絕對定位，它就只能乖乖待在頂部
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden'      // 封殺所有的滾動行為，不留任何讓畫面跳動的機會
      }}
    >
      <header className="bg-gray-800 text-white p-3 shadow-md flex justify-between items-center z-10 shrink-0">
        <h1 className="text-lg font-bold tracking-wider truncate">🕵️‍♂️ 薪水小偷互助會</h1>
        {appState === 'CHATTING' && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-green-500 text-gray-900 px-3 py-1 rounded-full font-mono font-bold text-sm animate-pulse shadow border border-green-400">
              $ {stolenMoney.toFixed(2)}
            </div>
            <button onClick={handleReport} className="text-red-400 text-xl hover:text-red-300" title="檢舉">🚨</button>
            <button onClick={handleLeave} className="text-gray-300 text-xl hover:text-white" title="離開">🚪</button>
          </div>
        )}
      </header>

      {appState === 'ENTRY' && (
        <div className="flex-1 flex flex-col justify-center items-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">開始摸魚</h2>
            
            <div className="mb-6">
              <label className="block text-gray-600 text-sm mb-2 font-medium">你的換算時薪 (NTD)</label>
              <input 
                type="number" 
                value={hourlyWage}
                onChange={(e) => setHourlyWage(e.target.value)}
                placeholder="例如: 250"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl bg-gray-50 text-base"
              />
            </div>

            <div className="mb-6 flex items-start gap-3 text-left bg-blue-50 p-3 rounded-lg border border-blue-100">
              <input 
                type="checkbox" 
                id="agreement" 
                checked={isAgreed} 
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0" 
              />
              <label htmlFor="agreement" className="text-sm text-gray-700 cursor-pointer select-none leading-relaxed">
                我承諾不發送騷擾、色情或違法訊息，並尊重每一位認真摸魚的薪水小偷。若遭檢舉將被踢出互助會。
              </label>
            </div>

            <button 
              onClick={handleStartMatching}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md flex justify-center items-center gap-2"
            >
              🔍 尋找摸魚共犯
            </button>
          </div>
        </div>
      )}

      {appState === 'WAITING' && (
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium text-lg">正在為您尋找同樣在偷懶的同事...</p>
        </div>
      )}

      {appState === 'CHATTING' && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 pb-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'me' ? 'justify-end' : msg.sender === 'system' ? 'justify-center' : 'justify-start'}`}>
                {msg.sender === 'system' ? (
                  <span className="bg-gray-200 text-gray-600 text-xs py-1.5 px-4 rounded-full font-medium shadow-sm">
                    {msg.text}
                  </span>
                ) : (
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${msg.sender === 'me' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border rounded-bl-none'}`}>
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="bg-white p-3 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] shrink-0 z-10">
            <div className="text-center text-gray-400 text-[10px] font-medium mb-2 tracking-widest select-none">
              薪水小偷互助會 by @fourzpoem
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="輸入訊息一起摸魚..."
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full font-medium transition shadow-md shrink-0">
                傳送
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}