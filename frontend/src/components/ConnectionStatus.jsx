
const STATUS_BY_STATE = {
  connected: {
    label: 'Canlı bağlantı aktif',
    indicatorClass: 'bg-emerald-500'
  },
  reconnecting: {
    label: 'Canlı bağlantı yeniden kuruluyor...',
    indicatorClass: 'bg-amber-500'
  },
  connecting: {
    label: 'Canlı bağlantı yeniden kuruluyor...',
    indicatorClass: 'bg-amber-500'
  },
  disconnected: {
    label: 'Canlı bağlantı kesildi',
    indicatorClass: 'bg-slate-500'
  }
};

export default function ConnectionStatus({ state = 'disconnected' }) {
  const status = STATUS_BY_STATE[state] || STATUS_BY_STATE.disconnected;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={status.label}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-700"
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.indicatorClass}`} />
      <span>{status.label}</span>
    </div>
  );
}
