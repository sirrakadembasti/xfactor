export const MAX_LOGS = 500;
export const mergeProjectLogs = (incoming, current) => {
  const seenIds = new Set();
  const seenEvents = new Set();
  return [...incoming, ...current]
    .sort((left, right) => Number(right.id != null) - Number(left.id != null))
    .filter(log => {
      const eventKey = log.created_at
        ? JSON.stringify([log.created_at, log.node_id, log.action, log.message, log.agent, log.file])
        : null;
      if (log.id != null) {
        if (seenIds.has(log.id)) return false;
        seenIds.add(log.id);
      } else if (eventKey && seenEvents.has(eventKey)) {
        return false;
      }
      if (eventKey) seenEvents.add(eventKey);
      return true;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.created_at || '');
      const rightTime = Date.parse(right.created_at || '');
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return (Number(right.id) || 0) - (Number(left.id) || 0);
    })
    .slice(0, MAX_LOGS);
};
