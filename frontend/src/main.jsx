import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("XFactor Frontend Error:", error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('xfactor_token');
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-100 font-sans p-6">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              ⚠️
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Arayüz Yüklenirken Bir Sorun Oluştu</h2>
            <p className="text-xs text-slate-600 mb-6">
              Tarayıcınızdaki eski oturum veya önbellek verisi nedeniyle bir hata oluşmuş olabilir.
            </p>
            <div className="space-y-2.5">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition"
              >
                Sayfayı Yenile
              </button>
              <button
                onClick={this.handleReset}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition border border-slate-300"
              >
                Önbelleği ve Oturumu Sıfırla (Girişe Dön)
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
