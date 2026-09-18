import React from 'react';

export default function LoginView({
  loginUsername,
  setLoginUsername,
  loginPassword,
  setLoginPassword,
  loginError,
  handleLogin,
  mfaRequired,
  loginTotp,
  setLoginTotp,
  cancelMfa,
  logoutPending = false
}) {
  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-cream-100 via-cream-50 to-cream-200 font-sans">
      <div className="bg-cream-50/90 border border-cream-200 p-8 rounded-2xl shadow-xl w-96 backdrop-blur-xs">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xl">X</div>
          <h2 className="text-2xl font-bold text-indigo-700">XFactor</h2>
        </div>
        <p className="text-xs text-center text-gray-500 mb-6">Otonom AI Ajan Orkestrasyon Platformu</p>
        <form onSubmit={handleLogin} className="space-y-4">
          {mfaRequired ? (
            <>
              <p className="text-sm text-center text-gray-600">Hesap: <strong>{loginUsername}</strong></p>
              <div>
                <label htmlFor="login-totp" className="block text-sm font-medium text-gray-700 mb-1">Doğrulama Kodu</label>
                <input
                  id="login-totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={loginTotp}
                  onChange={e => setLoginTotp(e.target.value)}
                  required
                  pattern="[0-9]{6}"
                  maxLength="6"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:border-indigo-500"
                  placeholder="admin"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:border-indigo-500"
                  placeholder="••••••••"
                />
              </div>
            </>
          )}
          {!mfaRequired && (
            <div className="bg-cream-100/90 border border-cream-200 rounded-lg p-2.5 text-center text-xs text-indigo-900">
              <span className="font-medium text-gray-500">Varsayılan Giriş:</span>{' '}
              <span className="font-semibold text-indigo-900">admin</span> / <span className="font-semibold text-indigo-900">xfactor</span>
            </div>
          )}
          {loginError && <div role="alert" className="text-red-500 text-sm text-center font-medium">{loginError}</div>}
          <button
            type="submit"
            disabled={logoutPending}
            className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mfaRequired ? 'Kodu Doğrula' : 'Giriş Yap'}
          </button>
          {mfaRequired && (
            <button type="button" onClick={cancelMfa} className="w-full text-sm text-indigo-700 font-semibold">
              Parola ekranına dön
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
