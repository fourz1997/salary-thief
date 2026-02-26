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
  
  // 🌟【新增】：摸魚存摺長期記憶 (localStorage)
  const [passbook, setPassbook] = useState(() => {
    const saved = localStorage.getItem('st_passbook');
    return saved ? JSON.parse(saved) : { total: 0, daily: {} };
  });

  const [stolenMoney, setStolenMoney] = useState(0); // 本次聊天偷到的錢
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAgreed, setIsAgreed] = useState(false);
  
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  // 取得今天的日期字串 (例如 "2026-02-26")
  const getTodayDateKey = () => {
    // 解決時區問題，確保拿到的是本地日期
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzOffset).toISOString().split('T')[0];
  };

  // 當狀態改變時，存進 Session 短期記憶
  useEffect(() => {
    sessionStorage.setItem('st_appState', appState);
    if (hourlyWage) sessionStorage.setItem('st_wage', hourlyWage);
  }, [appState, hourlyWage]);

  // 當存摺改變時，存進 Local 長期記憶
  useEffect(() => {
    localStorage.setItem('st_passbook', JSON.stringify(passbook));
  }, [passbook]);

  // 🌟【升級版計時器】：同時更新「本次偷的錢」跟「存摺裡的錢」
  useEffect(() => {
    let timer;
    if (appState === 'CHATTING' && hourlyWage > 0) {
      const moneyPerSecond = Number(hourlyWage) / 3600;

      timer = setInterval(() => {
        const now = Date.now();
        let lastTick = sessionStorage.getItem('st_lastTick');
        
        // 如果是剛進來，或是重整後的第一秒，以上一秒當基準
        if (!lastTick) lastTick = now - 1000; 
        
        const deltaSeconds = (now - parseInt(lastTick)) / 1000;
        const earnedNow = deltaSeconds * moneyPerSecond;

        sessionStorage.setItem('st_lastTick', now);
        
        // 更新畫面上本次的錢
        setStolenMoney(prev => prev + earnedNow);

        // 存進長期存摺裡
        setPassbook(prev => {
          const today = getTodayDateKey();
          const currentDaily = prev.daily[today] || 0;
          return {
            ...prev,
            total: prev.total + earnedNow,
            daily: {
              ...prev.daily,
              [today]: currentDaily + earnedNow
            }
          };
        });

      }, 1000);
    } else {
      // 不在聊天室時，停止計算時間差
      sessionStorage.removeItem('st_lastTick');
    }
    return () => clearInterval(timer);
  }, [appState, hourlyWage]);

  const scrollToBottom = () => {
    setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

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
      sessionStorage.setItem('st_lastTick', Date.now()); // 開始計時
      setMessages([{ sender: 'system', text: '已加入聊天室，正在和另一位薪水小偷連線。' }]);
    });

    socket.on('receive_message', (msgData) => {
      setIsPartnerTyping(false);
      setMessages(prev => [...prev, { sender: 'stranger', text: msgData.text }]);
    });

    socket.on('partner_left', () => {
      setIsPartnerTyping(false);
      setMessages(prev => [...prev, { sender: 'system', text: '對方覺得賺夠了，已經回去工作（或被老闆抓到了）。' }]);
    });

    socket.on('partner_typing', () => setIsPartnerTyping(true));
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

  const handleTyping = (e) => {
    setInputValue(e.target.value);
    socket.emit('typing');

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
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing');
    
    scrollToBottom(); 
  };

  const resetChat = () => {
    setAppState('ENTRY');
    setStolenMoney(0);
    setMessages([]);
    // 不清空時薪，讓使用者下次不用重打
    setIsAgreed(false);
    setIsPartnerTyping(false);
    sessionStorage.removeItem('st_appState');
    sessionStorage.removeItem('st_lastTick');
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

  // 取得今天的存摺金額
  const todayEarned = passbook.daily[getTodayDateKey()] || 0;

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
          
          {/* 🌟【新增】：摸魚存摺戰績看板 */}
          <div className="w-full max-w-md bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl shadow-lg p-6 mb-6 text-white text-center transform transition hover:scale-105">
            <h3 className="text-blue-100 font-medium tracking-widest mb-4 flex items-center justify-center gap-2">
              <span className="text-xl">🏦</span> 你的專屬摸魚存摺
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-lg p-3 border border-white/20">
                <p className="text-xs text-blue-200 mb-1">今日已白賺</p>
                <p className="text-2xl font-bold font-mono">$ {todayEarned.toFixed(2)}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3 border border-white/20">
                <p className="text-xs text-blue-200 mb-1">歷史總收益</p>
                <p className="text-2xl font-bold font-mono">$ {passbook.total.toFixed(2)}</p>
              </div>
            </div>
          </div>

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
                onChange={handleTyping}
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