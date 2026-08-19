import React from 'react';
import { Play, Pause, Send, Clock } from 'lucide-react';

export default function ChatView({
  projectState,
  chatInput,
  setChatInput,
  handleSendMessage,
  handleApprove,
  handleResume,
  setViewMode
}) {
  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {(projectState.chatHistory || []).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] p-4 rounded-xl shadow-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : msg.isError
                  ? 'bg-red-100 text-red-800 rounded-bl-none border border-red-300 font-medium'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm">{msg.parts?.[0]?.text || ''}</pre>
              {msg.timestamp && (
                <div
                  className={`text-[10px] mt-2 flex items-center gap-1 font-mono ${
                    msg.role === 'user' ? 'text-indigo-200 justify-end' : 'text-gray-400 justify-start'
                  }`}
                >
                  <Clock size={10} />
                  <span>{msg.timestamp}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pending Approval Banner */}
      {projectState.status === 'pending_approval' && (
        <div className="mx-6 mb-3 p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <h4 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
              <Play size={16} className="text-emerald-600" /> Mimari Plan Hazırlandı — Onayınız Bekleniyor
            </h4>
            <p className="text-emerald-700 text-xs mt-1">
              Manager mimari şartnameyi hazırladı. Onay verdiğinizde otonom ajan üretim süreci başlayacaktır.
            </p>
          </div>
          <button
            onClick={handleApprove}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 transition shrink-0"
          >
            <Play size={15} /> Planı Onayla ve Başlat
          </button>
        </div>
      )}

      {/* Paused Banner with Active Resume Button */}
      {projectState.status === 'paused' && (
        <div className="mx-6 mb-3 p-4 bg-amber-50 border-2 border-amber-400 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <h4 className="font-bold text-amber-900 text-sm flex items-center gap-2">
              <Pause size={16} className="text-amber-600" /> Süreç Durduruldu — Müdahale / Devam Modu
            </h4>
            <p className="text-amber-700 text-xs mt-1">
              Aşağıdan Manager ile mimari değişiklikleri tartışabilir veya projeyi kaldığı görevden devam ettirebilirsiniz.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setViewMode('flow')}
              className="bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-lg font-semibold text-xs border border-gray-300 transition"
            >
              Grafiği Gör
            </button>
            <button
              onClick={handleResume}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition"
            >
              <Play size={14} /> Devam Et (Resume)
            </button>
          </div>
        </div>
      )}

      {/* Chat Input */}
      <div className="p-4 bg-gray-50 border-t">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            placeholder="Manager ile mimariyi tartışın, isteklerinizi veya revizyonlarınızı yazın..."
            className="flex-1 border border-gray-300 rounded-full px-5 py-2.5 text-sm focus:outline-none focus:border-indigo-500 shadow-sm"
          />
          <button
            onClick={handleSendMessage}
            className="bg-indigo-600 text-white p-2.5 rounded-full hover:bg-indigo-700 shadow-sm transition"
            title="Gönder"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
