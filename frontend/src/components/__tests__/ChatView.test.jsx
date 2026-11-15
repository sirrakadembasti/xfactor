import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ChatView from '../ChatView';

describe('ChatView Component', () => {
  const mockSetChatInput = vi.fn();
  const mockHandleSendMessage = vi.fn();
  const mockHandleApprove = vi.fn();
  const mockHandleResume = vi.fn();
  const mockSetViewMode = vi.fn();

  const defaultProjectState = {
    status: 'completed',
    chatHistory: [
      { role: 'user', parts: [{ text: 'Merhaba Manager' }], timestamp: '10:00' },
      { role: 'model', parts: [{ text: 'Merhaba! Şartnameyi inceleyebilirsiniz.' }], timestamp: '10:01' }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  test('shows a waiting draft of a paused project with a reject action and no approval button', () => {
    const rejectDraft = vi.fn();
    const state = { ...defaultProjectState, status: 'paused', pendingContract: { id: 'contract-4', revision: 4 } };
    const props = { projectState: state, handleRejectDraft: rejectDraft, chatInput: '', setChatInput: mockSetChatInput };
    const { rerender } = render(<ChatView {...props} />);
    expect(screen.getByText(/Sözleşme taslağı 4 onay bekliyor/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Planı Onayla ve Başlat/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Taslağı Reddet' }));
    expect(rejectDraft).toHaveBeenCalledTimes(1);
    rerender(<ChatView {...props} isThinking />);
    expect(screen.getByRole('button', { name: 'Taslağı Reddet' })).toBeDisabled();
    rerender(<ChatView {...props} projectState={{ ...state, pendingContract: null }} />);
    expect(screen.queryByRole('button', { name: 'Taslağı Reddet' })).not.toBeInTheDocument();
  });

  test('offers reject next to approve on the pending approval card', () => {
    const rejectDraft = vi.fn();
    render(<ChatView projectState={{ ...defaultProjectState, status: 'pending_approval',
      pendingContract: { id: 'contract-2', revision: 2 } }} handleApprove={mockHandleApprove}
      handleRejectDraft={rejectDraft} chatInput="" setChatInput={mockSetChatInput} />);
    expect(screen.getByRole('button', { name: /Planı Onayla ve Başlat/ })).toBeInTheDocument();
    expect(screen.queryByText(/Sözleşme taslağı 2 onay bekliyor/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Taslağı Reddet' }));
    expect(rejectDraft).toHaveBeenCalledTimes(1);
    expect(mockHandleApprove).not.toHaveBeenCalled();
  });

  test('offers explicit review only for eligible patched repairs and disables it while busy', () => {
    const review = vi.fn();
    const state = { ...defaultProjectState, status: 'paused',
      repairSemanticReview: { available: true, planHash: 'private-plan-hash', remainingReviews: 1 },
      workflow: { controlledRepair: { phase: 'patched' } } };
    const props = { projectState: state, handleReviewRepair: review, chatInput: '', setChatInput: mockSetChatInput };
    const { rerender } = render(<ChatView {...props} />);
    const name = 'Mevcut düzeltmeleri incele ve yeniden kontrol et';
    fireEvent.click(screen.getByRole('button', { name }));
    expect(review).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Mevcut dosyalar korunur/)).toBeInTheDocument();
    expect(screen.queryByText(/private-plan-hash/)).not.toBeInTheDocument();
    rerender(<ChatView {...props} isThinking />);
    expect(screen.getByRole('button', { name })).toBeDisabled();
    rerender(<ChatView {...props} projectState={{ ...state, repairSemanticReview: { available: false } }} />);
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    rerender(<ChatView {...props} projectState={{ ...state, workflow: { controlledRepair: { phase: 'repairing' } } }} />);
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });

  test('offers source-preserving proposal preparation separately from plan approval and shows the bounded proposal', () => {
    const prepare = vi.fn();
    render(<ChatView projectState={{ ...defaultProjectState, status: 'paused',
      repairPreparation: { available: true, revision: 3 }, workflow: { controlledRepair: { phase: 'proposed', proposal: {
        summary: 'Mevcut giriş işlevini koruyarak eksikleri gider.', ready: false, uncoveredRequirementIds: ['REQ-9'],
        targets: [{ path: 'src/app.ts', instructions: 'Bağlantı izinlerini düzelt.' }]
      } } } }} handlePrepareRepair={prepare} chatInput="" setChatInput={mockSetChatInput} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mevcut çalışmayı koruyan onarım önerisi hazırla' }));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Bağlantı izinlerini düzelt.')).toBeInTheDocument();
    expect(screen.getByText(/REQ-9/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Planı Onayla ve Başlat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Listelenen eksikleri onar/ })).not.toBeInTheDocument();
  });

  test('only a ready unapplied proposal offers its separate repair action, which disappears while running', () => {
    const start = vi.fn();
    const state = { ...defaultProjectState, status: 'paused', workflow: { controlledRepair: { phase: 'proposed', proposal: {
      summary: 'Sınırlı onarım öneriliyor.', ready: true, planHash: 'hash', contractId: 'contract', targets: []
    } } } };
    const props = { projectState: state, handleStartRepair: start, chatInput: '', setChatInput: mockSetChatInput };
    const { rerender } = render(<ChatView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Listelenen dosyaları onar ve yeniden kontrol et' }));
    expect(start).toHaveBeenCalledTimes(1);
    rerender(<ChatView {...props} projectState={{ ...state, status: 'implementing', workflow: { controlledRepair: { ...state.workflow.controlledRepair, phase: 'repairing' } } }} />);
    expect(screen.queryByRole('button', { name: 'Listelenen dosyaları onar ve yeniden kontrol et' })).not.toBeInTheDocument();
  });

  test('an old proposal explains its stale state after a newer control and cannot start', () => {
    render(<ChatView projectState={{ ...defaultProjectState, status: 'paused', workflow: { controlledRepair: {
      phase: 'proposed', stale: true, proposal: { summary: 'Eski öneri', ready: true, targets: [] }
    } } }} handleStartRepair={vi.fn()} chatInput="" setChatInput={mockSetChatInput} />);
    expect(screen.getByText(/Bu öneri yeni kontrol sonrası güncelliğini yitirdi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Listelenen dosyaları onar ve yeniden kontrol et' })).not.toBeInTheDocument();
  });

  test('renders chat messages correctly with copy buttons', () => {
    render(
      <ChatView
        projectState={defaultProjectState}
        chatInput=""
        setChatInput={mockSetChatInput}
        handleSendMessage={mockHandleSendMessage}
        handleApprove={mockHandleApprove}
        handleResume={mockHandleResume}
        setViewMode={mockSetViewMode}
      />
    );

    expect(screen.getByText('Merhaba Manager')).toBeInTheDocument();
    expect(screen.getByText('Merhaba! Şartnameyi inceleyebilirsiniz.')).toBeInTheDocument();
    expect(screen.getByText('Siz (Boss)')).toBeInTheDocument();
    expect(screen.getByText('Manager (Kıdemli Mimar)')).toBeInTheDocument();

    const copyButtons = screen.getAllByTitle('Mesajı Kopyala');
    expect(copyButtons.length).toBe(2);
  });

  test('copies message text when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    });

    render(
      <ChatView
        projectState={defaultProjectState}
        chatInput=""
        setChatInput={mockSetChatInput}
        handleSendMessage={mockHandleSendMessage}
        handleApprove={mockHandleApprove}
        handleResume={mockHandleResume}
        setViewMode={mockSetViewMode}
      />
    );

    const copyButtons = screen.getAllByTitle('Mesajı Kopyala');
    fireEvent.click(copyButtons[0]);

    expect(writeTextMock).toHaveBeenCalledWith('Merhaba Manager');
    expect(await screen.findByText('Kopyalandı')).toBeInTheDocument();
  });

  test('handles textarea keydown: Enter sends message, Shift+Enter adds newline', () => {
    render(
      <ChatView
        projectState={defaultProjectState}
        chatInput="Yeni mesaj"
        setChatInput={mockSetChatInput}
        handleSendMessage={mockHandleSendMessage}
        handleApprove={mockHandleApprove}
        handleResume={mockHandleResume}
        setViewMode={mockSetViewMode}
      />
    );

    const textarea = screen.getByPlaceholderText(/Manager ile mimariyi tartışın/);

    // Shift + Enter -> Should NOT trigger handleSendMessage
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(mockHandleSendMessage).not.toHaveBeenCalled();

    // Enter without Shift -> Should trigger handleSendMessage
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(mockHandleSendMessage).toHaveBeenCalledTimes(1);
  });

  test('renders thinking state correctly', () => {
    render(
      <ChatView
        projectState={defaultProjectState}
        chatInput="Yeni mesaj"
        setChatInput={mockSetChatInput}
        handleSendMessage={mockHandleSendMessage}
        handleApprove={mockHandleApprove}
        handleResume={mockHandleResume}
        setViewMode={mockSetViewMode}
        isThinking={true}
      />
    );

    expect(screen.getByText(/Manager düşünüyor ve mimariyi analiz ediyor/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Manager yanıt hazırlıyor/)).toBeDisabled();
  });

  test('renders pending_approval banner and triggers handleApprove', () => {
    const pendingState = { ...defaultProjectState, status: 'pending_approval', plan: { summary: 'Otel planı', talimatname: 'Rezervasyon çakışmaları engellenir.', requirements: [{ id: 'REQ-1', statement: 'Oda yönetimi' }] } };
    render(
      <ChatView
        projectState={pendingState}
        chatInput=""
        setChatInput={mockSetChatInput}
        handleSendMessage={mockHandleSendMessage}
        handleApprove={mockHandleApprove}
        handleResume={mockHandleResume}
        setViewMode={mockSetViewMode}
      />
    );

    expect(screen.getByText(/Mimari Plan Hazırlandı — Onayınız Bekleniyor/)).toBeInTheDocument();
    expect(screen.getByText(/Planın kapsamını ve kabul kriterlerini incele/)).toBeInTheDocument();
    expect(screen.getByText(/Rezervasyon çakışmaları engellenir/)).toBeInTheDocument();
    const approveBtn = screen.getByRole('button', { name: /Planı Onayla ve Başlat/ });
    fireEvent.click(approveBtn);
    expect(mockHandleApprove).toHaveBeenCalledTimes(1);
  });

  test('blocks a draft that replaced approved scope and prepares an explicit Manager correction', () => {
    render(<ChatView projectState={{ ...defaultProjectState, status: 'pending_approval',
      planScopeReview: { valid: false, issues: [{ id: 'REQ-5', kind: 'changed',
        before: 'Kritik stok uyarıları ve gösterge paneli', after: 'Global AuthProvider' }] } }}
      chatInput="" setChatInput={mockSetChatInput} handleSendMessage={mockHandleSendMessage}
      handleApprove={mockHandleApprove} handleResume={mockHandleResume} setViewMode={mockSetViewMode} />);
    expect(screen.getByRole('button', { name: /Planı Onayla ve Başlat/ })).toBeDisabled();
    expect(screen.getByText('Kritik stok uyarıları ve gösterge paneli')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Kapsamı tamamla/ }));
    expect(mockSetChatInput).toHaveBeenCalledWith(expect.stringContaining('REQ-5: Kritik stok uyarıları ve gösterge paneli'));
    expect(mockHandleSendMessage).not.toHaveBeenCalled();
    expect(mockHandleApprove).not.toHaveBeenCalled();
  });

  test('renders paused banner and triggers handleResume / setViewMode', () => {
    const pausedState = { ...defaultProjectState, status: 'paused' };
    render(
      <ChatView
        projectState={pausedState}
        chatInput=""
        setChatInput={mockSetChatInput}
        handleSendMessage={mockHandleSendMessage}
        handleApprove={mockHandleApprove}
        handleResume={mockHandleResume}
        setViewMode={mockSetViewMode}
      />
    );

    expect(screen.getByText(/Süreç Durduruldu — Müdahale \/ Devam Modu/)).toBeInTheDocument();
    const resumeBtn = screen.getByRole('button', { name: /Devam Et \(Resume\)/ });
    fireEvent.click(resumeBtn);
    expect(mockHandleResume).toHaveBeenCalledTimes(1);

    const flowBtn = screen.getByRole('button', { name: /Grafiği Gör/ });
    fireEvent.click(flowBtn);
    expect(mockSetViewMode).toHaveBeenCalledWith('flow');
  });

  test('Manager revision veto explains source preservation and approval risk while hiding Resume', () => {
    render(<ChatView projectState={{ ...defaultProjectState, status: 'paused',
      last_error: 'Worker repair requires Manager revision: No safely routable product findings.' }}
      chatInput="" setChatInput={mockSetChatInput} handleSendMessage={mockHandleSendMessage}
      handleApprove={mockHandleApprove} handleResume={mockHandleResume} setViewMode={mockSetViewMode} />);
    expect(screen.queryByRole('button', { name: /Devam Et \(Resume\)/ })).not.toBeInTheDocument();
    expect(screen.getByText(/yeni.*revizyon.*onay/i)).toBeInTheDocument();
    expect(screen.getByText(/yeniden üretilmesine yol açabilir/i)).toBeInTheDocument();
    expect(screen.getByText(/Yalnız Yeniden Doğrula.*hataları onarmaz/i)).toBeInTheDocument();
    expect(screen.queryByText(/revizyonu isteyin ve planı onaylayın/i)).not.toBeInTheDocument();
  });

  test('a persisted worker blocker keeps Resume hidden after diagnostic error text changes', () => {
    render(<ChatView projectState={{ ...defaultProjectState, status: 'paused', resumeBlocked: true,
      last_error: 'Yeni doğrulama ürün hataları buldu.' }} chatInput="" setChatInput={mockSetChatInput}
      handleSendMessage={mockHandleSendMessage} handleApprove={mockHandleApprove} handleResume={mockHandleResume} />);
    expect(screen.queryByRole('button', { name: /Devam Et \(Resume\)/ })).not.toBeInTheDocument();
    expect(screen.getByText(/yeni.*revizyon.*onay/i)).toBeInTheDocument();
  });

  test('reverifies the approved implementation without approving a pending replacement plan', () => {
    const reverify = vi.fn();
    render(<ChatView projectState={{ ...defaultProjectState, status: 'pending_approval',
      reverification: { available: true, contractId: 'approved-original', revision: 3 } }}
      handleReverify={reverify} chatInput="" setChatInput={mockSetChatInput}
      handleSendMessage={mockHandleSendMessage} handleApprove={mockHandleApprove} />);
    fireEvent.click(screen.getByRole('button', { name: /Yalnız Yeniden Doğrula/i }));
    expect(reverify).toHaveBeenCalledTimes(1);
    expect(mockHandleApprove).not.toHaveBeenCalled();
    expect(screen.getByText(/kaynak.*değiştirmez/i)).toBeInTheDocument();
  });

  test('offers Resume when a quality gate leaves the project verification_failed', () => {
    render(
      <ChatView
        projectState={{
          ...defaultProjectState,
          status: 'verification_failed',
          chatHistory: [{ role: 'model', parts: [{ text: 'Tester Kalite Kapısı Uyarısı: devam ettirin.' }] }]
        }}
        chatInput=""
        setChatInput={mockSetChatInput}
        handleSendMessage={mockHandleSendMessage}
        handleApprove={mockHandleApprove}
        handleResume={mockHandleResume}
        setViewMode={mockSetViewMode}
      />
    );

    expect(screen.getByText(/Tester Kalite Kapısı Uyarısı/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Devam Et \(Resume\)/ }));
    expect(mockHandleResume).toHaveBeenCalledTimes(1);
  });
});
