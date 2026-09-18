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
    const pendingState = { ...defaultProjectState, status: 'pending_approval' };
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
    const approveBtn = screen.getByRole('button', { name: /Planı Onayla ve Başlat/ });
    fireEvent.click(approveBtn);
    expect(mockHandleApprove).toHaveBeenCalledTimes(1);
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
});
