# 🧠 XFactor Bilgi Grafiği Raporu (Graphify)

**Oluşturulma Tarihi:** 2026-09-18  
**Toplam Düğüm (Nodes):** 73  
**Toplam Bağlantı (Edges):** 98  
**Modül Toplulukları:** 6 Temel Alt Sistem (Docs, Agents, Engine, Backend, Frontend, Tests)

---

## 🌟 Çekirdek Odak Düğümleri ("God Nodes" & Merkez Bileşenler)
1. **backend/tests/test_runner.js**: 27 bağlantı — npm test master koşucusu
2. **docs/ORKESTRASYON-TALIMATNAMESI.md**: 12 bağlantı — Platformun en üst master orkestrasyon anayasası
3. **backend/engine/workflow.js**: 12 bağlantı — Paralel DAG dalgalarını yürüten ana iş akışı komutanı
4. **backend/agents/index.js**: 9 bağlantı — Merkezi Ajan Kayıt Defteri ve getAgent() fabrikası
5. **backend/routes/projectRoutes.js**: 8 bağlantı — Proje CRUD, Chat, Onay ve Revizyon uç noktaları
6. **frontend/src/App.jsx**: 8 bağlantı — React 18 ana panel koordinatörü ve WebSocket canlı istemcisi

---

## 🎨 Alt Sistem Toplulukları (Communities)

| Renk Kodu | Topluluk | Dosya Sayısı | Açıklama |
|:---:|---|:---:|---|
| 🟣 **Mor** | **Docs & Anayasa** | 12 Dosya | docs/ORKESTRASYON-TALIMATNAMESI.md, ajan kuralları ve SDD iyileştirme planları. |
| 🟣 **Eflatun** | **Agents** | 9 Dosya | Ajan tanımları, registry ve şema ayrıştırıcıları. |
| 🔵 **Mavi** | **Engine** | 6 Dosya | DAG motoru, durum makinesi, dalga seviyelendirme, dosya protokolü ve scaffold guard. |
| 🟢 **Yeşil** | **Backend & API** | 11 Dosya | Express server, SQLite WAL, projectRepository, reconciliationService, executionClient, auth ve LLM yönlendirici. |
| 🟠 **Turuncu** | **Frontend** | 8 Dosya | React 18, Sidebar, Header, ChatView, DAGFlowView, dagLayout, Monaco IDE. |
| 🔴 **Kırmızı** | **Tests** | 27 Dosya | Merkezi backend ve frontend davranış süitleri ve master test koşucu. |

---

## 📊 Görsel Haritalar
- **İnteraktif 2D/3D Ağ Grafiği:** graphify-out/graph.html
- **Hiyerarşik Ağaç Görünümü:** graphify-out/GRAPH_TREE.html
