# 🧠 XFactor Bilgi Grafiği Raporu (Graphify)

**Oluşturulma Tarihi:** 2026-08-27  
**Toplam Düğüm (Nodes):** 59  
**Toplam Bağlantı (Edges):** 76  
**Modül Toplulukları:** 6 Temel Alt Sistem (Docs, Agents, Engine, Backend, Frontend, Tests)

---

## 🌟 Çekirdek Odak Düğümleri ("God Nodes" & Merkez Bileşenler)
1. **backend/engine/workflow.js**: 8 bağlantı — Master orkestratör, DAG dalga yürütme ve veto yöneticisi.
2. **backend/agents/agentLoader.js**: 7 bağlantı — Canlı Markdown anayasasını (docs/*.md) yapay zekâ promptlarına bağlayan çekirdek köprü.
3. **backend/server.js**: 6 bağlantı — Express REST API ve Sec-WebSocket-Protocol sunucusu.
4. **docs/ORKESTRASYON-TALIMATNAMESI.md**: 8 bağlantı — Platform anayasası ve tüm ajan kurallarının kaynağı.
5. **frontend/src/App.jsx**: 7 bağlantı — Canlı DAG görselleştirmesi, Monaco IDE ve Chat koordinatörü.
6. **backend/tests/test_runner.js**: 7 bağlantı — 71 testlik merkezi test koşucusu.

---

## 🎨 Alt Sistem Toplulukları (Communities)

| Renk Kodu | Topluluk | Dosya Sayısı | Açıklama |
|:---:|---|:---:|---|
| 🟣 **Mor** | **Docs & Anayasa** | 8 Dosya | docs/ORKESTRASYON-TALIMATNAMESI.md ve ajan kural Markdown dosyaları. |
| 🟣 **Eflatun** | **Agents** | 9 Dosya | Ajan tanımları, registry ve şema ayrıştırıcıları. |
| 🔵 **Mavi** | **Engine** | 5 Dosya | DAG motoru, dalga seviyelendirme, dosya protokolü ve scaffold guard. |
| 🟢 **Yeşil** | **Backend & API** | 7 Dosya | Express server, SQLite WAL, Scrypt, revocable session, CSRF, RBAC ve LLM yönlendirici. |
| 🟠 **Turuncu** | **Frontend** | 7 Dosya | React 18, Sidebar, Header, ChatView, DAGFlowView, Monaco IDE. |
| 🔴 **Kırmızı** | **Tests** | Süit bazlı | Merkezi backend/tests davranış süitleri ve master koşucu. |

---

## 📊 Görsel Haritalar
- **İnteraktif 2D/3D Ağ Grafiği:** graphify-out/graph.html
- **Hiyerarşik Ağaç Görünümü:** graphify-out/GRAPH_TREE.html
