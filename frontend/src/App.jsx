import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// 連接到後端伺服器
const socket = io('http://localhost:3001');

export default function App() {
  const [appState, setAppState] = useState('ENTRY'); // ENTRY, WAITING, CHATTING
  const [hourlyWage, setHourlyWage] = useState('');
  const [stolenMoney, setStolenMoney] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAgreed, setIsAgreed] = useState(false); // 新增：是否同意公約
  const messagesEndRef = useRef(null);

  // 計算摸魚薪水
  useEffect(() => {
    let timer;
    if (appState === 'CHATTING' && hourlyWage > 0) {
      const moneyPerSecond = Number(hourlyWage) / 3600;
      timer = setInterval(() => {
        setStolenMoney(prev => prev + moneyPerSecond);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [appState, hourlyWage]);

  // 自動滾動到最新訊息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket 事件監聽
  useEffect(() => {
    socket.on('chat_start', () => {
      setAppState('CHATTING');
      setMessages([{ sender: 'system', text: '已加入聊天室，正在和另一位薪水小偷連線。' }]);
    });

    socket.on('receive_message', (msg) => {
      setMessages(prev => [...prev, { sender: 'stranger', text: msg }]);
    });

    socket.on('partner_left', () => {
      setMessages(prev => [...prev, { sender: 'system', text: '對方覺得賺夠了，已經回去工作（或被老闆抓到了）。' }]);
    });

    return () => {
      socket.off('chat_start');
      socket.off('receive_message');
      socket.off('partner_left');
    };
  }, []);

  // 尋找配對（加入安全卡控）
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
    socket.emit('find_partner');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setMessages(prev => [...prev, { sender: 'me', text: inputValue }]);
    socket.emit('send_message', inputValue);
    setInputValue('');
  };

  // 正常離開
  const handleLeave = () => {
    if (window.confirm(`你確定要回去工作了嗎？你剛剛總共偷了 $${stolenMoney.toFixed(2)} 元喔！`)) {
      socket.emit('leave_chat');
      resetChat();
    }
  };

  // 檢舉並離開
  const handleReport = () => {
    if (window.confirm('遇到怪人了嗎？確定要檢舉對方並離開？系統將立即切斷連線。')) {
      socket.emit('leave_chat');
      resetChat();
      // 延遲一下跳出感謝視窗，體驗更好
      setTimeout(() => {
        alert('已成功檢舉並離開該聊天室。感謝您協助維護互助會的優質摸魚環境！');
      }, 100);
    }
  };

  // 重置狀態的共用函數
  const resetChat = () => {
    setAppState('ENTRY');
    setStolenMoney(0);
    setMessages([]);
    setHourlyWage('');
    setIsAgreed(false); // 回到首頁時取消勾選
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      <header className="bg-gray-800 text-white p-4 shadow-md flex justify-between items-center z-10">
        <h1 className="text-xl font-bold tracking-wider">🕵️‍♂️ 薪水小偷互助會</h1>
        {appState === 'CHATTING' && (
          <div className="bg-green-500 text-gray-900 px-4 py-1 rounded-full font-mono font-bold animate-pulse shadow-lg border border-green-400">
            已白賺：$ {stolenMoney.toFixed(2)}
          </div>
        )}
      </header>

      {/* 登入畫面 */}
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl bg-gray-50"
              />
            </div>

            {/* 安全公約打勾區塊 */}
            <div className="mb-6 flex items-start gap-3 text-left bg-blue-50 p-3 rounded-lg border border-blue-100">
              <input 
                type="checkbox" 
                id="agreement" 
                checked={isAgreed} 
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 rounded cursor-pointer" 
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

      {/* 等待畫面 */}
      {appState === 'WAITING' && (
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium text-lg">正在為您尋找同樣在偷懶的同事...</p>
        </div>
      )}

      {/* 聊天畫面 */}
      {appState === 'CHATTING' && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
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

          <div className="bg-white p-3 border-t shadow-lg z-10">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              {/* 新增檢舉按鈕 */}
              <button 
                type="button" 
                onClick={handleReport} 
                className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-2 rounded-lg font-medium transition text-sm flex items-center"
                title="檢舉此用戶"
              >
                🚨 檢舉
              </button>
              
              <button 
                type="button" 
                onClick={handleLeave} 
                className="bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 px-4 py-2 rounded-lg font-medium transition text-sm"
              >
                離開
              </button>
              
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="輸入訊息一起摸魚..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition shadow-md">
                發送
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}