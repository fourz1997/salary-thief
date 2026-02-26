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
  
  // 🌟【新增狀態】：用來記錄對方是不是正在打字
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  // 🌟【新增計時器】：用來計算對方有沒有發呆
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem('st_appState', appState);
    if (hourlyWage) sessionStorage.setItem('st_wage', hourlyWage);
  }, [appState, hourlyWage]);

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
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  // 當有新訊息，或是對方開始/停止打字時，都讓畫面往下滾一點
  useEffect(() => {
    scrollToBottom();
  }, [messages, isPartnerTyping]);

  useEffect(() => {
    socket.on('connect', () => {
      socket.emit('register_user', userId);
    });
    if (socket.connected) {
      socket.emit('register_user', userId);
    }

    socket.on('reconnect_success', (historyMessages) => {
      setAppState('CHATTING');
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
      sessionStorage.setItem('st_startTime', Date.now());
      setMessages([{ sender: 'system', text: '已加入聊天室，正在和另一位薪水小偷連線。' }]);
    });

    socket.on('receive_message', (msgData) => {
      // 收到訊息的瞬間，立刻把對方的打字狀態關掉，並把訊息印出來
      setIsPartnerTyping(false);
      setMessages(prev => [...prev, { sender: 'stranger', text: msgData.text }]);
    });

    socket.on('partner_left', () => {
      setIsPartnerTyping(false);
      setMessages(prev => [...prev, { sender: 'system', text: '對方覺得賺夠了，已經回去工作（或被老闆抓到了）。' }]);
    });

    // 🌟【新增監聽】：聽到大腦說對方正在打字
    socket.on('partner_typing', () => setIsPartnerTyping(true));
    // 🌟【新增監聽】：聽到大腦說對方停止打字了
    socket.on('partner_stop_typing', () => setIsPartnerTyping(false));

    return () => {
      socket.off('connect');
      socket.off('reconnect_success');
      socket.off('chat_start');
      socket.off('receive_message');
      socket.off('partner_left');
      socket.off('partner_typing');
      socket.off('partner_stop_typing');
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
    socket.emit('register_user', userId);
    socket.emit('find_partner');
  };

  // 🌟【新增功能】：當你正在鍵盤上敲擊時
  const handleTyping = (e) => {
    setInputValue(e.target.value);
    
    // 告訴大腦「我正在打字！」
    socket.emit('typing');

    // 如果 1.5 秒內沒有再按鍵盤，就自動告訴大腦「我停下來了」
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing');
    }, 1500);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setMessages(prev => [...prev, { sender: 'me', text: inputValue }]);
    socket.emit('send_message', inputValue);
    setInputValue('');
    
    // 🌟 發送出去的瞬間，立刻清空計時器，並告訴大腦「我打完了」
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing');
    
    scrollToBottom(); 
  };

  const resetChat = () => {
    setAppState('ENTRY');
    setStolenMoney(0);
    setMessages([]);
    setHourlyWage('');
    setIsAgreed(false);
    setIsPartnerTyping(false);
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

  return (
    <div className="flex flex-col min-h-[100dvh] bg-gray-100 font-sans w-full">
      
      <header className="sticky top-0 bg-gray-800 text-white p-3 shadow-md flex justify-between items-center z-50">
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
        <main className="flex-1 flex flex-col justify-center items-center p-4">
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
        </main>
      )}

      {appState === 'WAITING' && (
        <main className="flex-1 flex flex-col justify-center items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium text-lg">正在為您尋找同樣在偷懶的同事...</p>
        </main>
      )}

      {appState === 'CHATTING' && (
        <>
          <main className="flex-1 p-4 space-y-4 bg-gray-50 pb-6">
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
            
            {/* 🌟【對方正在輸入中動畫】 */}
            {isPartnerTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-200 text-gray-500 text-sm px-4 py-2 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-1.5 animate-pulse">
                  <span>對方正在輸入中</span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  </span>
                </div>
              </div>
            )}
          </main>

          <footer className="sticky bottom-0 bg-white p-3 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
            <div className="text-center text-gray-400 text-[10px] font-medium mb-2 tracking-widest select-none">
              薪水小偷互助會 by @fourzpoem
            </div>
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={handleTyping} /* 🌟 確保這裡是綁定 handleTyping */
                placeholder="輸入訊息一起摸魚..."
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full font-medium transition shadow-md shrink-0">
                傳送
              </button>
            </form>
          </footer>
        </>
      )}
    </div>
  );
}