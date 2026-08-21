import { MarkerType } from 'reactflow';

/**
 * Ajan rollerine göre belirgin, yüksek kontrastlı ve sade renk temaları
 */
export function getAgentVisualTheme(agent, action) {
  const ag = (agent || '').toLowerCase();
  const act = (action || '').toLowerCase();

  if (act === 'error' || act === 'veto' || ag === 'system') {
    return {
      bg: 'linear-gradient(135deg, #9f1239, #e11d48)',
      border: '1.5px solid #fda4af',
      shadow: '0 4px 12px rgba(225, 29, 72, 0.35)',
      icon: act === 'veto' ? '🚫' : '⚠️',
      text: '#ffffff',
      edgeColor: '#f43f5e',
      roleName: 'Veto / Hata'
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
        roleName: 'Manager'
      };
    case 'director':
      return {
        bg: 'linear-gradient(135deg, #065f46, #059669)',
        border: '1.5px solid #6ee7b7',
        shadow: '0 4px 12px rgba(5, 150, 105, 0.35)',
        icon: '📁',
        text: '#ffffff',
        edgeColor: '#10b981',
        roleName: 'Director'
      };
    case 'teamleader':
      return {
        bg: 'linear-gradient(135deg, #92400e, #d97706)',
        border: '1.5px solid #fcd34d',
        shadow: '0 4px 12px rgba(217, 119, 6, 0.35)',
        icon: '📋',
        text: '#ffffff',
        edgeColor: '#f59e0b',
        roleName: 'Teamleader'
      };
    case 'coder':
      return {
        bg: 'linear-gradient(135deg, #0369a1, #0284c7)',
        border: '1.5px solid #7dd3fc',
        shadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
        icon: '💻',
        text: '#ffffff',
        edgeColor: '#0ea5e9',
        roleName: 'Coder'
      };
    case 'reviewer':
      return {
        bg: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
        border: '1.5px solid #c4b5fd',
        shadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
        icon: '🔍',
        text: '#ffffff',
        edgeColor: '#8b5cf6',
        roleName: 'Reviewer'
      };
    case 'tester':
      return {
        bg: 'linear-gradient(135deg, #115e59, #0d9488)',
        border: '1.5px solid #5eead4',
        shadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
        icon: '🧪',
        text: '#ffffff',
        edgeColor: '#14b8a6',
        roleName: 'Tester'
      };
    default:
      return {
        bg: 'linear-gradient(135deg, #374151, #4b5563)',
        border: '1.5px solid #9ca3af',
        shadow: '0 4px 12px rgba(75, 85, 99, 0.3)',
        icon: '⚙️',
        text: '#ffffff',
        edgeColor: '#6b7280',
        roleName: agent || 'Ajan'
      };
  }
}

/**
 * Log kayıtlarından sade, kompakt, hiyerarşik ve çakışmasız 2 sütunlu ağaç grafiği üretir.
 */
export function computeHierarchicalDAG(logs = []) {
  if (!Array.isArray(logs) || logs.length === 0) {
    const theme = getAgentVisualTheme('Manager');
    return {
      nodes: [
        {
          id: 'manager',
          position: { x: 380, y: 30 },
          data: { label: `${theme.icon} Manager: Proje Mimarisi` },
          style: {
            background: theme.bg,
            border: theme.border,
            color: theme.text,
            boxShadow: theme.shadow,
            borderRadius: '10px',
            padding: '10px 16px',
            fontWeight: '600',
            fontSize: '12px',
            width: '200px',
            textAlign: 'center'
          }
        }
      ],
      edges: []
    };
  }

  // 1. Düğümleri ayrıştır ve haritala
  const nodeMap = new Map();
  const rawEdges = new Set();

  nodeMap.set('manager', {
    id: 'manager',
    agent: 'Manager',
    parent_id: null,
    label: 'Manager: Proje Mimarisi',
    action: 'start',
    children: []
  });

  const chronological = [...logs].reverse();
  for (const log of chronological) {
    if (!log.node_id) continue;
    const nodeId = log.node_id;

    if (!nodeMap.has(nodeId)) {
      let parentId = log.parent_node_id;
      if (!parentId && log.agent === 'Director') parentId = 'manager';

      let displayLabel = `${log.agent}: ${nodeId}`;
      if (nodeId === 'manager') displayLabel = 'Manager: Proje Mimarisi';
      else if (log.agent === 'Director') displayLabel = `Director: ${nodeId.replace('.director', '')}`;
      else if (log.agent === 'Teamleader') displayLabel = `Teamleader: ${nodeId.split('.').pop()}`;
      else displayLabel = `${nodeId.split('.').pop()}`;

      nodeMap.set(nodeId, {
        id: nodeId,
        agent: log.agent || 'Agent',
        parent_id: parentId,
        label: displayLabel,
        action: log.action || 'info',
        file: log.file || '',
        children: []
      });
    } else {
      const existing = nodeMap.get(nodeId);
      if (log.action) existing.action = log.action;
      if (log.file) existing.file = log.file;
      if (log.parent_node_id && !existing.parent_id) existing.parent_id = log.parent_node_id;
    }

    if (log.parent_node_id && log.node_id && log.parent_node_id !== log.node_id) {
      rawEdges.add(`${log.parent_node_id}->${log.node_id}`);
    } else if (log.agent === 'Director' && log.node_id !== 'manager') {
      rawEdges.add(`manager->${log.node_id}`);
    }
  }

  // 2. Ağaç ilişkilerini doldur
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

  // 3. Basit ve Düzenli 2 Sütunlu Hiyerarşik Koordinat Düzeni
  const directors = (nodeMap.get('manager')?.children || []).filter(id => nodeMap.has(id));
  const isMultiDomain = directors.length > 1;

  // Domain sütun merkezleri
  const domainColumns = {};
  if (directors.length === 0) {
    // Sadece manager var
  } else if (directors.length === 1) {
    domainColumns[directors[0]] = 400;
  } else {
    // 2 veya daha fazla domain: Backend sol sütunda (x: 200), Frontend sağ sütunda (x: 620)
    directors.forEach((dirId, idx) => {
      domainColumns[dirId] = 200 + (idx * 420);
    });
  }

  const finalNodes = [];
  const managerCenterX = isMultiDomain
    ? (domainColumns[directors[0]] + domainColumns[directors[directors.length - 1]]) / 2
    : 400;

  // 3.1. Manager Node
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

  // 3.2. Directors, Teamleaders & Tasks
  directors.forEach(dirId => {
    const dirNode = nodeMap.get(dirId);
    if (!dirNode) return;
    const colX = domainColumns[dirId] || 400;

    // Director Node (y: 115)
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
        textAlign: 'center'
      }
    });

    // Teamleaders (y: 200)
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
          textAlign: 'center'
        }
      });

      // Tasks under this Teamleader (y: 285+)
      // 2 sütunlu düzenli ızgara (col 0: x - 95, col 1: x + 95)
      const tasks = (tlNode.children || []).filter(id => nodeMap.has(id));
      tasks.forEach((taskId, taskIdx) => {
        const taskNode = nodeMap.get(taskId);
        if (!taskNode) return;

        const subCol = taskIdx % 2;
        const subRow = Math.floor(taskIdx / 2);

        const taskX = subCol === 0 ? (colX - 185) : (colX + 5);
        const taskY = 285 + (subRow * 65);

        const taskTheme = getAgentVisualTheme(taskNode.agent, taskNode.action);
        finalNodes.push({
          id: taskId,
          position: { x: taskX, y: taskY },
          data: { label: `${taskTheme.icon} ${taskNode.label}` },
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
            wordBreak: 'break-word'
          }
        });
      });
    });
  });

  // 4. Kenarları (Edges) oluştur
  const finalEdges = [];
  for (const edgeStr of rawEdges) {
    const [source, target] = edgeStr.split('->');
    if (source && target && nodeMap.has(source) && nodeMap.has(target)) {
      const sourceNode = nodeMap.get(source);
      const sourceTheme = getAgentVisualTheme(sourceNode.agent, sourceNode.action);

      finalEdges.push({
        id: `${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
        animated: true,
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
