import { describe, test, expect } from 'vitest';
import { computeHierarchicalDAG, getAgentVisualTheme, formatNodeTitle } from '../dagLayout';

describe('computeHierarchicalDAG and 6-agent role visual sync', () => {
  test('returns clean structure with only Manager when logs and plan are empty', () => {
    const result = computeHierarchicalDAG([]);
    expect(result.nodes).toBeDefined();
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].id).toBe('manager');
    expect(result.nodes.some(n => n.id.includes('tl_'))).toBe(false);
    expect(result.nodes.some(n => n.id.includes('req_'))).toBe(false);
    expect(result.nodes.some(n => n.id === 'tester-qa')).toBe(false);
  });

  test('pre-populates planned tree structure without fabricated dummy IDs when plan is provided', () => {
    const plan = {
      domains: [
        { name: 'Backend', prefix: 'backend' },
        { name: 'Frontend', prefix: 'frontend' }
      ],
      requirements: [
        { id: 'REQ-1', statement: 'Veritabanı bağlantısı' },
        { id: 'REQ-2', statement: 'Kullanıcı arayüzü' }
      ]
    };

    const result = computeHierarchicalDAG([], plan);
    const nodeIds = result.nodes.map(n => n.id);

    expect(nodeIds).toContain('manager');
    expect(nodeIds).toContain('backend.director');
    expect(nodeIds).toContain('frontend.director');
    expect(nodeIds).not.toContain('backend.tl_backend');
    expect(nodeIds).not.toContain('frontend.tl_frontend');
    expect(nodeIds.some(id => id.includes('req_'))).toBe(false);
    expect(nodeIds).not.toContain('tester-qa');

    const backendDirNode = result.nodes.find(n => n.id === 'backend.director');
    expect(backendDirNode.style.border).toContain('dashed');
  });

  test('overlays real-time states and Reviewer / Tester stages when logs arrive', () => {
    const logs = [
      {
        id: 1,
        agent: 'Manager',
        action: 'start',
        node_id: 'manager',
        message: 'Manager başladı'
      },
      {
        id: 2,
        agent: 'Director',
        action: 'start',
        node_id: 'backend.director',
        parent_node_id: 'manager',
        message: 'Backend Director görevi devraldı'
      },
      {
        id: 3,
        agent: 'Teamleader',
        action: 'delegate',
        node_id: 'backend.tl_backend',
        parent_node_id: 'backend.director',
        message: 'Teamleader görev dağıtıyor'
      },
      {
        id: 4,
        agent: 'Coder',
        action: 'write',
        node_id: 'backend.tl_backend.task_1',
        parent_node_id: 'backend.tl_backend',
        message: 'Görev "Veritabanı Bağlantısı" Coder\'a iletildi'
      },
      {
        id: 5,
        agent: 'Reviewer',
        action: 'feedback',
        node_id: 'backend.tl_backend.task_1',
        parent_node_id: 'backend.tl_backend',
        message: '[1. Tur İnceleme] Düzeltme istendi'
      },
      {
        id: 6,
        agent: 'Tester',
        action: 'start',
        node_id: 'tester-qa',
        parent_node_id: 'manager',
        message: 'Proje kabul testleri başlatılıyor'
      }
    ];

    const result = computeHierarchicalDAG(logs);

    const taskNode = result.nodes.find(n => n.id === 'backend.tl_backend.task_1');
    expect(taskNode).toBeDefined();
    expect(taskNode.data.label).toContain('Reviewer Denetiminde');
    expect(taskNode.data.label).toContain('Veritabanı Bağlantısı');

    const testerNode = result.nodes.find(n => n.id === 'tester-qa');
    expect(testerNode).toBeDefined();
    expect(testerNode.data.label).toContain('Tester: Test Ediliyor...');
  });

  test('formatNodeTitle produces human-friendly titles', () => {
    expect(formatNodeTitle('manager', 'Manager')).toBe('Manager: Proje Mimarisi');
    expect(formatNodeTitle('tester-qa', 'Tester')).toBe('Tester: Doğrulama & QA');
    expect(formatNodeTitle('backend.director', 'Director')).toBe('Director: Backend');
    expect(formatNodeTitle('backend.tl_backend', 'Teamleader')).toBe('Teamleader: Backend');
    expect(formatNodeTitle('backend.tl_backend.task-1-setup-ui', 'Coder')).toBe('Task 1 setup ui');
  });

  test('getAgentVisualTheme supports all 6 agent roles and states', () => {
    const roles = ['Manager', 'Director', 'Teamleader', 'Coder', 'Reviewer', 'Tester'];
    roles.forEach(role => {
      const theme = getAgentVisualTheme(role, 'info');
      expect(theme).toBeDefined();
      expect(theme.icon).toBeDefined();
      expect(theme.bg).toBeDefined();
    });

    const reviewerFeedbackTheme = getAgentVisualTheme('Coder', 'reviewer_feedback');
    expect(reviewerFeedbackTheme.roleName).toBe('Reviewer Denetiminde');

    const plannedTheme = getAgentVisualTheme('Coder', 'planned');
    expect(plannedTheme.border).toContain('dashed');
  });
});
