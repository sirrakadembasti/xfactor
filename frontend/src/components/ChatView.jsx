import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Send, Clock, Sparkles, Loader2, User, Copy, Check, CornerDownLeft } from 'lucide-react';

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
  const [copiedIndex, setCopiedIndex] = useState(null);

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

  const handleCopy = (text, index) => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isThinking && chatInput.trim()) {
        handleSendMessage();
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-cream-100/60 overflow-hidden h-full">
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
          const isCopied = copiedIndex === i;
          const messageText = msg.parts?.[0]?.text || '';

          return (
            <div key={i} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-1 text-xs">
                  🏛️
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl p-4 shadow-sm relative group transition-all ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : msg.isError
                    ? 'bg-red-50 text-red-900 border border-red-200 rounded-tl-none'
                    : 'bg-cream-50 text-stone-800 border border-cream-200 rounded-tl-none'
                }`}
              >
                {/* Başlık (Rol Bilgisi ve Kopyalama Butonu) */}
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div
                    className={`text-[11px] font-semibold flex items-center gap-1 ${
                      isUser ? 'text-indigo-200' : 'text-indigo-600'
                    }`}
                  >
                    {isUser ? 'Siz (Boss)' : 'Manager (Kıdemli Mimar)'}
                  </div>

                  {messageText && (
                    <button
                      onClick={() => handleCopy(messageText, i)}
                      title={isCopied ? 'Kopyalandı' : 'Mesajı Kopyala'}
                      className={`p-1 rounded-md text-xs flex items-center gap-1 transition cursor-pointer ${
                        isUser
                          ? isCopied
                            ? 'bg-emerald-500/30 text-emerald-200'
                            : 'hover:bg-indigo-500/50 text-indigo-200 hover:text-white'
                          : isCopied
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check size={13} className={isUser ? 'text-emerald-200' : 'text-emerald-600'} />
                          <span className={`text-[10px] font-medium ${isUser ? 'text-emerald-200' : 'text-emerald-600'}`}>
                            Kopyalandı
                          </span>
                        </>
                      ) : (
                        <Copy size={13} className="shrink-0" />
                      )}
                    </button>
                  )}
                </div>

                <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed break-words">
                  {messageText}
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
            <div className="bg-cream-50 border border-indigo-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-xs flex items-center gap-3">
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

      {/* SOHBET GİRİŞ ALANI (FLOATING ELEVATED CARD CHAT INPUT) */}
      <div className="p-4 bg-gradient-to-t from-cream-200/80 via-cream-100/50 to-transparent shrink-0">
        <div className="max-w-4xl mx-auto">
          <div className="bg-cream-50 border border-cream-300 rounded-2xl shadow-lg p-3 transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <div className="flex flex-col gap-2">
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isThinking}
                rows={2}
                placeholder={
                  isThinking
                    ? "Manager yanıt hazırlıyor, lütfen bekleyin..."
                    : "Manager ile mimariyi tartışın, isteklerinizi veya revizyonlarınızı yazın..."
                }
                className="w-full text-sm bg-transparent resize-none border-0 focus:outline-none focus:ring-0 text-gray-800 placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px] max-h-36 leading-relaxed"
              />

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2 text-[11px] text-gray-400 select-none">
                  <CornerDownLeft size={12} className="text-gray-400" />
                  <span>Enter: Gönder • Shift+Enter: Yeni Satır</span>
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={isThinking || !chatInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 text-xs font-semibold shrink-0"
                  title="Gönder"
                >
                  {isThinking ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Düşünüyor...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Gönder</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}