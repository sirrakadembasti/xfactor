import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LoginView from '../LoginView';
import App from '../../App';
import { api } from '../../services/api';

function renderLogin(overrides = {}) {
  const props = {
    loginUsername: 'mfa-user',
    setLoginUsername: vi.fn(),
    loginPassword: 'MfaPassword123456!',
    setLoginPassword: vi.fn(),
    loginError: '',
    handleLogin: vi.fn(event => event.preventDefault()),
    mfaRequired: false,
    loginTotp: '',
    setLoginTotp: vi.fn(),
    cancelMfa: vi.fn(),
    ...overrides
  };
  return { props, ...render(<LoginView {...props} />) };
}

test('credential state shows username and password without a TOTP input', () => {
  renderLogin();

  expect(screen.getByLabelText('Kullanıcı Adı')).toBeInTheDocument();
  expect(screen.getByLabelText('Şifre')).toBeInTheDocument();
  expect(screen.queryByLabelText('Doğrulama Kodu')).not.toBeInTheDocument();
});

test('login page starts with empty credentials and does not advertise defaults', async () => {
  vi.spyOn(api, 'getSession').mockRejectedValue(new Error('No active session'));
  render(<App />);

  expect(await screen.findByLabelText('Kullanıcı Adı')).toHaveValue('');
  expect(screen.getByLabelText('Şifre')).toHaveValue('');
  expect(screen.queryByText('Varsayılan Giriş:')).not.toBeInTheDocument();
  expect(screen.queryByText('xfactor')).not.toBeInTheDocument();
});

test('MFA state renders a numeric one-time-code input and cancel control', () => {
  renderLogin({ mfaRequired: true });

  expect(screen.queryByLabelText('Kullanıcı Adı')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Şifre')).not.toBeInTheDocument();
  const totp = screen.getByLabelText('Doğrulama Kodu');
  expect(totp).toHaveAttribute('inputmode', 'numeric');
  expect(totp).toHaveAttribute('autocomplete', 'one-time-code');
  expect(screen.getByRole('button', { name: 'Parola ekranına dön' })).toBeInTheDocument();
});

test('MFA form submits through the same login callback and cancel clears MFA', () => {
  const { props } = renderLogin({ mfaRequired: true });

  fireEvent.submit(screen.getByRole('button', { name: 'Kodu Doğrula' }).closest('form'));
  expect(props.handleLogin).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Parola ekranına dön' }));
  expect(props.cancelMfa).toHaveBeenCalledTimes(1);
});
