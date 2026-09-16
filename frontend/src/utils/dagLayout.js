import { MarkerType } from 'reactflow';

/**
 * Ajan rollerine göre belirgin, yüksek kontrastlı ve sade renk temaları
 */
export function getAgentVisualTheme(agent, action, options = {}) {
  const ag = (agent || '').toLowerCase();
  const act = (action || '').toLowerCase();
  const isPlanned = act === 'planned';

  if (act === 'error' || act === 'veto' || ag === 'system') {
    return {
      bg: 'linear-gradient(135deg, #9f1239, #e11d48)',
      border: '1.5px solid #fda4af',
      shadow: '0 4px 12px rgba(225, 29, 72, 0.35)',
      icon: act === 'veto' ? '🚫' : '⚠️',
      text: '#ffffff',
      edgeColor: '#f43f5e',
      roleName: 'Veto / Hata',
      opacity: 1
    };
  }

  if (act === 'reviewer_feedback' || (options.reviewerState === 'feedback' && act !== 'finish' && act !== 'completed')) {
    return {
      bg: 'linear-gradient(135deg, #4c1d95, #7c3aed)',
      border: '2px solid #c4b5fd',
      shadow: '0 0 15px rgba(196, 181, 253, 0.5)',
      icon: '🔍',
      text: '#ffffff',
      edgeColor: '#8b5cf6',
      roleName: 'Reviewer Denetiminde',
      opacity: 1
    };
  }

  if (act === 'start' || act === 'delegate' || act === 'write' || act === 'in_progress') {
    return {
      bg: 'linear-gradient(135deg, #0369a1, #0284c7)',
      border: '2px solid #38bdf8',
      shadow: '0 0 15px rgba(56, 189, 248, 0.6)',
      icon: '⚡',
      text: '#ffffff',
      edgeColor: '#38bdf8',
      roleName: 'Çalışıyor',
      opacity: 1
    };
  }

  if (act === 'finish' || act === 'completed' || act === 'skip') {
    return {
      bg: 'linear-gradient(135deg, #065f46, #059669)',
      border: '1.5px solid #6ee7b7',
      shadow: '0 2px 10px rgba(5, 150, 105, 0.35)',
      icon: '✅',
      text: '#ffffff',
      edgeColor: '#10b981',
      roleName: 'Tamamlandı',
      opacity: 1
    };
  }

  if (isPlanned) {
    return {
      bg: 'linear-gradient(135deg, #1e293b, #334155)',
      border: '1.5px dashed #64748b',
      shadow: 'none',
      icon: '⏳',
      text: '#94a3b8',
      edgeColor: '#475569',
      roleName: 'Planlandı / Bekliyor',
      opacity: 0.8
    };
  }

  switch (ag) {
    case 'manager':
      return {
        bg: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
        border: '1.5px solid #93c5fd',
        shadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
        icon: '🏛️',
        text: '#ffffff',
        edgeColor: '#3b82f6',
        roleName: 'Manager',
        opacity: 1
      };
    case 'director':
      return {
        bg: 'linear-gradient(135deg, #065f46, #059669)',
        border: '1.5px solid #6ee7b7',
        shadow: '0 4px 12px rgba(5, 150, 105, 0.35)',
        icon: '📁',
        text: '#ffffff',
        edgeColor: '#10b981',
        roleName: 'Director',
        opacity: 1
      };
    case 'teamleader':
      return {
        bg: 'linear-gradient(135deg, #92400e, #d97706)',
        border: '1.5px solid #fcd34d',
        shadow: '0 4px 12px rgba(217, 119, 6, 0.35)',
        icon: '📋',
        text: '#ffffff',
        edgeColor: '#f59e0b',
        roleName: 'Teamleader',
        opacity: 1
      };
    case 'coder':
      return {
        bg: 'linear-gradient(135deg, #0369a1, #0284c7)',
        border: '1.5px solid #7dd3fc',
        shadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
        icon: '💻',
        text: '#ffffff',
        edgeColor: '#0ea5e9',
        roleName: 'Coder',
        opacity: 1
      };
    case 'reviewer':
      return {
        bg: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
        border: '1.5px solid #c4b5fd',
        shadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
        icon: '🔍',
        text: '#ffffff',
        edgeColor: '#8b5cf6',
        roleName: 'Reviewer',
        opacity: 1
      };
    case 'tester':
      return {
        bg: 'linear-gradient(135deg, #115e59, #0d9488)',
        border: '1.5px solid #5eead4',
        shadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
        icon: '🧪',
        text: '#ffffff',
        edgeColor: '#14b8a6',
        roleName: 'Tester',
        opacity: 1
      };
    default:
      return {
        bg: 'linear-gradient(135deg, #374151, #4b5563)',
        border: '1.5px solid #9ca3af',
        shadow: '0 4px 12px rgba(75, 85, 99, 0.3)',
        icon: '⚙️',
        text: '#ffffff',
        edgeColor: '#6b7280',
        roleName: agent || 'Ajan',
        opacity: 1
      };
  }
}

/**
 * Node kimliği ve mesajdan insan tarafından okunabilir başlık üretir.
 */
export function formatNodeTitle(nodeId, agent, customTitle) {
  if (nodeId === 'manager') return 'Manager: Proje Mimarisi';
  if (nodeId === 'tester-qa' || nodeId === 'tester' || (agent || '').toLowerCase() === 'tester') return 'Tester: Doğrulama & QA';

  if (customTitle && typeof customTitle === 'string' && customTitle.trim().length > 0) {
    const clean = customTitle.trim();
    if ((agent || '').toLowerCase() === 'director' && !clean.toLowerCase().startsWith('director')) return `Director: ${clean}`;
    if ((agent || '').toLowerCase() === 'teamleader' && !clean.toLowerCase().startsWith('teamleader')) return `Teamleader: ${clean}`;
    return clean;
  }

  const parts = nodeId.split('.');
  let key = parts[parts.length - 1];
  if ((key === 'director' || key === 'teamleader') && parts.length > 1) {
    key = parts[0];
  }

  const cleaned = key
    .replace(/^(coder_|task_|req_|tl_)/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  const capitalized = cleaned ? (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)) : key;

  if (agent === 'Director') return `Director: ${capitalized}`;
  if (agent === 'Teamleader') return `Teamleader: ${capitalized}`;
  if (agent === 'Coder') return capitalized.toLowerCase().startsWith('task') ? capitalized : `Task: ${capitalized}`;
  return capitalized;
}

/**
 * Log kayıtlarından ve plan nesnesinden hiyerarşik ve canlı senkronize 2 sütunlu ağaç grafiği üretir.
 */
export function computeHierarchicalDAG(logs = [], plan = null) {
  const nodeMap = new Map();
  const rawEdges = new Set();

  // Kök Manager Node
  nodeMap.set('manager', {
    id: 'manager',
    agent: 'Manager',
    parent_id: null,
    label: 'Manager: Proje Mimarisi',
    action: 'start',
    children: []
  });

  // 1. Plan varsa önceden doldur (Pre-population)
  if (plan && typeof plan === 'object') {
    const rawDomains = plan.domains || plan.domain_list || plan.subdomains || [];
    const domainList = Array.isArray(rawDomains) && rawDomains.length > 0
      ? rawDomains.map((d, idx) => {
          if (typeof d === 'string') return { name: d, prefix: d.toLowerCase().replace(/\s+/g, '-') };
          return {
            name: d.name || `domain-${idx + 1}`,
            prefix: (d.prefix || d.name || `domain-${idx + 1}`).toLowerCase().replace(/\s+/g, '-')
          };
        })
      : [];

    for (const domain of domainList) {
      const dirId = `${domain.prefix}.director`;
      if (!nodeMap.has(dirId)) {
        nodeMap.set(dirId, {
          id: dirId,
          agent: 'Director',
          parent_id: 'manager',
          label: formatNodeTitle(dirId, 'Director', domain.name),
          action: 'planned',
          children: []
        });
        rawEdges.add(`manager->${dirId}`);
      }

      const tlId = `${domain.prefix}.tl_${domain.prefix}`;
      if (!nodeMap.has(tlId)) {
        nodeMap.set(tlId, {
          id: tlId,
          agent: 'Teamleader',
          parent_id: dirId,
          label: formatNodeTitle(tlId, 'Teamleader', domain.name),
          action: 'planned',
          children: []
        });
        rawEdges.add(`${dirId}->${tlId}`);
      }

      if (Array.isArray(plan.requirements) && plan.requirements.length > 0) {
        plan.requirements.forEach((req, rIdx) => {
          const reqId = typeof req === 'string' ? req : (req.id || `REQ-${rIdx + 1}`);
          const reqStatement = typeof req === 'object' && req.statement ? req.statement : reqId;
          const taskId = `${tlId}.req_${rIdx + 1}`;
          if (!nodeMap.has(taskId)) {
            nodeMap.set(taskId, {
              id: taskId,
              agent: 'Coder',
              parent_id: tlId,
              label: reqStatement.length > 25 ? reqStatement.substring(0, 25) + '...' : reqStatement,
              action: 'planned',
              children: []
            });
            rawEdges.add(`${tlId}->${taskId}`);
          }
        });
      }
    }
  }

  // Tester QA Node (Pre-populated)
  const testerNodeId = 'tester-qa';
  if (!nodeMap.has(testerNodeId)) {
    nodeMap.set(testerNodeId, {
      id: testerNodeId,
      agent: 'Tester',
      parent_id: 'manager',
      label: 'Tester: Doğrulama & QA',
      action: 'planned',
      children: []
    });
    rawEdges.add(`manager->${testerNodeId}`);
  }

  // 2. Canlı Log Katmanlarını İşle
  // Logların kronolojik sırasını tespit et (id/timestamp veya dizi yönü)
  const logList = Array.isArray(logs) ? logs : [];
  let chronological = [...logList];
  if (logList.length > 1 && logList[0].id && logList[logList.length - 1].id && logList[0].id > logList[logList.length - 1].id) {
    chronological = [...logList].reverse();
  }

  for (const log of chronological) {
    if (!log) continue;
    let nodeId = log.node_id;
    if (!nodeId && log.agent === 'Tester') {
      nodeId = testerNodeId;
    }
    if (!nodeId) continue;

    const canonicalNodeId = (nodeId === 'tester') ? testerNodeId : nodeId;
    let parentId = log.parent_node_id;
    if (!parentId) {
      if (log.agent === 'Director' || log.agent === 'Tester' || canonicalNodeId === testerNodeId) {
        parentId = 'manager';
      }
    }

    let extractedTitle = null;
    if (log.message) {
      const match = log.message.match(/Görev "([^"]+)"/);
      if (match) extractedTitle = match[1];
    }

    if (!nodeMap.has(canonicalNodeId)) {
      const displayLabel = formatNodeTitle(canonicalNodeId, log.agent, extractedTitle || log.file);
      nodeMap.set(canonicalNodeId, {
        id: canonicalNodeId,
        agent: log.agent || 'Agent',
        parent_id: parentId,
        label: displayLabel,
        action: log.action || 'info',
        file: log.file || '',
        children: []
      });
    } else {
      const existing = nodeMap.get(canonicalNodeId);
      if (log.agent === 'Reviewer') {
        existing.reviewerState = log.action; // 'feedback' or 'veto'
        existing.reviewerMessage = log.message;
        if (log.action === 'veto') existing.action = 'veto';
        else if (log.action === 'feedback') existing.action = 'reviewer_feedback';
      } else {
        if (log.agent) existing.agent = log.agent;
        if (log.action) existing.action = log.action;
      }
      if (log.file) existing.file = log.file;
      if (parentId && (!existing.parent_id || existing.parent_id === 'manager')) {
        existing.parent_id = parentId;
      }
      if (extractedTitle) {
        existing.label = formatNodeTitle(canonicalNodeId, existing.agent, extractedTitle);
      }
    }

    if (parentId && canonicalNodeId && parentId !== canonicalNodeId) {
      rawEdges.add(`${parentId}->${canonicalNodeId}`);
    } else if ((log.agent === 'Director' || log.agent === 'Tester') && canonicalNodeId !== 'manager') {
      rawEdges.add(`manager->${canonicalNodeId}`);
    }
  }

  // 3. Ağaç İlişkilerini Doldur
  for (const [id, node] of nodeMap.entries()) {
    if (id === 'manager') continue;
    const parentId = node.parent_id || 'manager';
    if (nodeMap.has(parentId) && parentId !== id) {
      const parent = nodeMap.get(parentId);
      if (!parent.children.includes(id)) {
        parent.children.push(id);
      }
    }
  }

  // 4. 2 Sütunlu Hiyerarşik Koordinat Düzeni
  const directors = (nodeMap.get('manager')?.children || []).filter(id => nodeMap.has(id) && id !== testerNodeId);
  const isMultiDomain = directors.length > 1;

  const domainColumns = {};
  if (directors.length === 0) {
    // Sadece manager
  } else if (directors.length === 1) {
    domainColumns[directors[0]] = 350;
  } else {
    directors.forEach((dirId, idx) => {
      domainColumns[dirId] = 200 + (idx * 420);
    });
  }

  const managerCenterX = isMultiDomain
    ? (domainColumns[directors[0]] + domainColumns[directors[directors.length - 1]]) / 2
    : 350;

  const finalNodes = [];

  // Manager Node
  const mgrTheme = getAgentVisualTheme('Manager', nodeMap.get('manager')?.action);
  finalNodes.push({
    id: 'manager',
    position: { x: managerCenterX - 95, y: 25 },
    data: { label: `${mgrTheme.icon} ${nodeMap.get('manager')?.label || 'Manager'}` },
    style: {
      background: mgrTheme.bg,
      border: mgrTheme.border,
      color: mgrTheme.text,
      boxShadow: mgrTheme.shadow,
      borderRadius: '10px',
      padding: '8px 14px',
      fontWeight: '600',
      fontSize: '12px',
      width: '190px',
      textAlign: 'center'
    }
  });

  // Directors, Teamleaders & Tasks
  directors.forEach(dirId => {
    const dirNode = nodeMap.get(dirId);
    if (!dirNode) return;
    const colX = domainColumns[dirId] || 350;

    const dirTheme = getAgentVisualTheme('Director', dirNode.action);
    finalNodes.push({
      id: dirId,
      position: { x: colX - 90, y: 115 },
      data: { label: `${dirTheme.icon} ${dirNode.label}` },
      style: {
        background: dirTheme.bg,
        border: dirTheme.border,
        color: dirTheme.text,
        boxShadow: dirTheme.shadow,
        borderRadius: '8px',
        padding: '7px 12px',
        fontWeight: '600',
        fontSize: '11px',
        width: '180px',
        textAlign: 'center',
        opacity: dirTheme.opacity
      }
    });

    const tlList = (dirNode.children || []).filter(id => nodeMap.has(id));
    tlList.forEach((tlId, tlIdx) => {
      const tlNode = nodeMap.get(tlId);
      if (!tlNode) return;

      const tlTheme = getAgentVisualTheme('Teamleader', tlNode.action);
      finalNodes.push({
        id: tlId,
        position: { x: colX - 90, y: 200 + (tlIdx * 45) },
        data: { label: `${tlTheme.icon} ${tlNode.label}` },
        style: {
          background: tlTheme.bg,
          border: tlTheme.border,
          color: tlTheme.text,
          boxShadow: tlTheme.shadow,
          borderRadius: '8px',
          padding: '6px 10px',
          fontWeight: '600',
          fontSize: '11px',
          width: '180px',
          textAlign: 'center',
          opacity: tlTheme.opacity
        }
      });

      const tasks = (tlNode.children || []).filter(id => nodeMap.has(id));
      tasks.forEach((taskId, taskIdx) => {
        const taskNode = nodeMap.get(taskId);
        if (!taskNode) return;

        const subCol = taskIdx % 2;
        const subRow = Math.floor(taskIdx / 2);

        const taskX = subCol === 0 ? (colX - 185) : (colX + 5);
        const taskY = 285 + (subRow * 65);

        const taskTheme = getAgentVisualTheme(taskNode.agent, taskNode.action, { reviewerState: taskNode.reviewerState });
        let labelPrefix = taskTheme.icon;
        let displayLabel = taskNode.label;
        if (taskNode.reviewerState === 'feedback' && taskNode.action !== 'finish' && taskNode.action !== 'completed') {
          displayLabel = `[Reviewer Denetiminde] ${taskNode.label}`;
        } else if (taskNode.reviewerState === 'veto') {
          displayLabel = `[Veto] ${taskNode.label}`;
        }

        finalNodes.push({
          id: taskId,
          position: { x: taskX, y: taskY },
          data: { label: `${labelPrefix} ${displayLabel}` },
          style: {
            background: taskTheme.bg,
            border: taskTheme.border,
            color: taskTheme.text,
            boxShadow: taskTheme.shadow,
            borderRadius: '6px',
            padding: '6px 8px',
            fontWeight: '500',
            fontSize: '10px',
            width: '175px',
            textAlign: 'center',
            wordBreak: 'break-word',
            opacity: taskTheme.opacity
          }
        });
      });
    });
  });

  // Tester Node (Doğrulama ve QA)
  const testerNode = nodeMap.get(testerNodeId);
  if (testerNode) {
    const testerTheme = getAgentVisualTheme('Tester', testerNode.action);
    const testerX = directors.length > 0
      ? (Math.max(...Object.values(domainColumns)) + 210)
      : (managerCenterX + 220);

    let testerLabel = testerNode.label;
    if (testerNode.action === 'finish') testerLabel = 'Tester: Testler Geçti';
    else if (testerNode.action === 'error') testerLabel = 'Tester: Hata / Veto';
    else if (testerNode.action === 'start' || testerNode.action === 'feedback') testerLabel = 'Tester: Test Ediliyor...';

    finalNodes.push({
      id: testerNodeId,
      position: { x: testerX, y: 115 },
      data: { label: `${testerTheme.icon} ${testerLabel}` },
      style: {
        background: testerTheme.bg,
        border: testerTheme.border,
        color: testerTheme.text,
        boxShadow: testerTheme.shadow,
        borderRadius: '8px',
        padding: '7px 12px',
        fontWeight: '600',
        fontSize: '11px',
        width: '180px',
        textAlign: 'center',
        opacity: testerTheme.opacity
      }
    });
  }

  // Yerleşmemiş Ek Düğümler Fallback
  const placedNodeIds = new Set(finalNodes.map(n => n.id));
  let extraIdx = 0;
  const maxPlacedY = finalNodes.reduce((max, n) => Math.max(max, n.position.y), 115);

  for (const [nodeId, node] of nodeMap.entries()) {
    if (!placedNodeIds.has(nodeId)) {
      const extraX = 100 + ((extraIdx % 4) * 200);
      const extraY = maxPlacedY + 90 + (Math.floor(extraIdx / 4) * 60);
      const theme = getAgentVisualTheme(node.agent, node.action, { reviewerState: node.reviewerState });

      finalNodes.push({
        id: nodeId,
        position: { x: extraX, y: extraY },
        data: { label: `${theme.icon} ${node.label}` },
        style: {
          background: theme.bg,
          border: theme.border,
          color: theme.text,
          boxShadow: theme.shadow,
          borderRadius: '6px',
          padding: '6px 8px',
          fontWeight: '500',
          fontSize: '10px',
          width: '175px',
          textAlign: 'center',
          wordBreak: 'break-word',
          opacity: theme.opacity
        }
      });
      placedNodeIds.add(nodeId);
      extraIdx++;
    }
  }

  // Kenarlar (Edges)
  const finalEdges = [];
  for (const edgeStr of rawEdges) {
    const [source, target] = edgeStr.split('->');
    if (source && target && placedNodeIds.has(source) && placedNodeIds.has(target)) {
      const sourceNode = nodeMap.get(source);
      const sourceTheme = getAgentVisualTheme(sourceNode?.agent, sourceNode?.action);

      finalEdges.push({
        id: `${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
        animated: sourceNode?.action === 'start' || sourceNode?.action === 'write' || sourceNode?.action === 'delegate',
        style: {
          stroke: sourceTheme.edgeColor,
          strokeWidth: 1.5
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: sourceTheme.edgeColor,
          width: 14,
          height: 14
        }
      });
    }
  }

  return { nodes: finalNodes, edges: finalEdges };
}
