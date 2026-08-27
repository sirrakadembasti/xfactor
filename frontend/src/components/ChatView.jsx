import React, { useEffect, useRef } from 'react';
import { Play, Pause, Send, Clock, Sparkles, Loader2, Bot, User } from 'lucide-react';

export default function ChatView({
  projectState,
  chatInput,
  setChatInput,
  handleSendMessage,
  handleApprove,
  handleResume,
  setViewMode,
  isThinking = false
}) {
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isInitialMount = useRef(true);
  const chatHistory = projectState?.chatHistory || [];
  const historyLength = chatHistory.length;
  const lastMessageText = chatHistory[historyLength - 1]?.parts?.[0]?.text;

  // Sekme açıldığında anında (animasyonsuz) en altta başla, sadece yeni mesaj gelince smooth kaydır
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [historyLength, lastMessageText, isThinking]);
  return (
    <div className="flex-1 flex flex-col bg-slate-50/50 overflow-hidden h-full">
      {/* ÜST SABİT BİLDİRİM VE AKSİYON ŞERİDİ */}
      {projectState?.status === 'pending_approval' && (
        <div className="mx-6 mt-3 mb-1 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Play size={16} />
            </div>
            <div>
              <h4 className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                Mimari Plan Hazırlandı — Onayınız Bekleniyor
              </h4>
              <p className="text-emerald-700 text-[11px] mt-0.5">
                Manager mimari şartnameyi hazırladı. Otonom üretimi başlatmak için onay veriniz.
              </p>
            </div>
          </div>
          <button
            onClick={handleApprove}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 transition shrink-0 cursor-pointer"
          >
            <Play size={14} /> Planı Onayla ve Başlat
          </button>
        </div>
      )}

      {projectState?.status === 'paused' && (
        <div className="mx-6 mt-3 mb-1 p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Pause size={16} />
            </div>
            <div>
              <h4 className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                Süreç Durduruldu — Müdahale / Devam Modu
              </h4>
              <p className="text-amber-700 text-[11px] mt-0.5">
                Manager ile mimariyi tartışabilir veya kaldığı görevden devam ettirebilirsiniz.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setViewMode('flow')}
              className="bg-white hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-semibold text-xs border border-gray-300 transition cursor-pointer"
            >
              Grafiği Gör
            </button>
            <button
              onClick={handleResume}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <Play size={13} /> Devam Et (Resume)
            </button>
          </div>
        </div>
      )}

      {/* SOHBET MESAJ LİSTESİ */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {chatHistory.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div key={i} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-1 text-xs">
                  🏛️
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : msg.isError
                    ? 'bg-red-50 text-red-900 border border-red-200 rounded-tl-none'
                    : 'bg-white text-gray-800 border border-gray-200/80 rounded-tl-none'
                }`}
              >
                {/* Başlık (Rol Bilgisi) */}
                <div className={`text-[11px] font-semibold mb-1.5 flex items-center gap-1 ${isUser ? 'text-indigo-200 justify-end' : 'text-indigo-600'}`}>
                  {isUser ? 'Siz (Boss)' : 'Manager (Kıdemli Mimar)'}
                </div>

                <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed break-words">
                  {msg.parts?.[0]?.text || ''}
                </div>

                {msg.timestamp && (
                  <div
                    className={`text-[10px] mt-2 flex items-center gap-1 font-mono ${
                      isUser ? 'text-indigo-200 justify-end' : 'text-gray-400 justify-start'
                    }`}
                  >
                    <Clock size={10} />
                    <span>{msg.timestamp}</span>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center shrink-0 shadow-sm mt-1">
                  <User size={15} />
                </div>
              )}
            </div>
          );
        })}

        {/* GEMINI / CHATGPT STİLİ CANLI DÜŞÜNME GÖSTERGESİ */}
        {isThinking && (
          <div className="flex gap-3 justify-start items-center">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-1 text-xs">
              🏛️
            </div>
            <div className="bg-white border border-indigo-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <Sparkles size={16} className="text-indigo-600 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-indigo-950">
                  Manager düşünüyor ve mimariyi analiz ediyor
                </span>
                <div className="flex gap-1 items-center ml-1">
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* SOHBET GİRİŞ ALANI (CHAT INPUT) */}
      <div className="p-4 bg-white border-t border-gray-200 shrink-0">
        <div className="flex gap-2 max-w-4xl mx-auto items-center">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isThinking && handleSendMessage()}
            disabled={isThinking}
            placeholder={isThinking ? "Manager yanıt hazırlıyor, lütfen bekleyin..." : "Manager ile mimariyi tartışın, isteklerinizi veya revizyonlarınızı yazın..."}
            className="flex-1 border border-gray-300 rounded-full px-5 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
          />
          <button
            onClick={handleSendMessage}
            disabled={isThinking || !chatInput.trim()}
            className="bg-indigo-600 text-white p-2.5 rounded-full hover:bg-indigo-700 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center shrink-0"
            title="Gönder"
          >
            {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
