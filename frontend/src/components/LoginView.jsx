import React from 'react';

export default function LoginView({
  loginUsername,
  setLoginUsername,
  loginPassword,
  setLoginPassword,
  loginError,
  handleLogin
}) {
  return (
    <div className="flex items-center justify-center h-screen bg-indigo-50 font-sans">
      <div className="bg-white p-8 rounded-xl shadow-lg w-96">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xl">X</div>
          <h2 className="text-2xl font-bold text-indigo-700">XFactor</h2>
        </div>
        <p className="text-xs text-center text-gray-500 mb-6">Otonom AI Ajan Orkestrasyon Platformu</p>
        <form onSubmit={handleLogin} className="space-y-4">
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
          {loginError && <div role="alert" className="text-red-500 text-sm text-center font-medium">{loginError}</div>}
          <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 font-semibold transition">
            Giriş Yap
          </button>
        </form>
      </div>
    </div>
  );
}
