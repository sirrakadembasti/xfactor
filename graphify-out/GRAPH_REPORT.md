# 🧠 XFactor Bilgi Grafiği Raporu (Graphify)

**Oluşturulma Tarihi:** 2026-09-21
**Toplam Düğüm (Nodes):** 288
**Toplam Bağlantı (Edges):** 738
**Modül Toplulukları:** 6 Temel Alt Sistem (Docs, Agents, Engine, Backend, Frontend, Tests)

Kaynak dosyaları ve yerel import/export bağlantıları AST taramasından; imports dışındaki mimari bağlantılar açıklamalı, elle tanımlanmış ilişkilerden gelir. Paket importları ve dinamik importlar bu grafiğe dahil değildir.

---

## 🌟 Çekirdek Odak Düğümleri ("God Nodes" & Merkez Bileşenler)
1. **backend/tests/test_runner.js**: 121 bağlantı — npm test master koşucusu
2. **backend/tests/testHarness.js**: 92 bağlantı — testHarness.js
3. **backend/tests/isolatedDb.js**: 43 bağlantı — isolatedDb.js
4. **backend/engine/workflow.js**: 42 bağlantı — Paralel DAG dalgalarını yürüten ana iş akışı komutanı
5. **backend/routes/projectRoutes.js**: 32 bağlantı — Proje CRUD, Chat, Onay ve Revizyon uç noktaları
6. **frontend/src/App.jsx**: 26 bağlantı — React 18 ana panel koordinatörü ve WebSocket canlı istemcisi

---

## 🎨 Alt Sistem Toplulukları (Communities)

| Renk Kodu | Topluluk | Dosya Sayısı | Açıklama |
|:---:|---|:---:|---|
| 🟣 **Mor** | **Docs & Anayasa** | 27 Dosya | docs/ORKESTRASYON-TALIMATNAMESI.md, ajan kuralları ve SDD iyileştirme planları. |
| 🟣 **Eflatun** | **Agents** | 9 Dosya | Ajan tanımları, registry ve şema ayrıştırıcıları. |
| 🔵 **Mavi** | **Engine** | 13 Dosya | DAG motoru, durum makinesi, dalga seviyelendirme, dosya protokolü ve scaffold guard. |
| 🟢 **Yeşil** | **Backend & API** | 78 Dosya | Express server, SQLite WAL, projectRepository, reconciliationService, executionClient, auth ve LLM yönlendirici. |
| 🟠 **Turuncu** | **Frontend** | 19 Dosya | React 18, Sidebar, Header, ChatView, DAGFlowView, dagLayout, Monaco IDE. |
| 🔴 **Kırmızı** | **Tests** | 142 Dosya | Merkezi backend ve frontend davranış süitleri ve master test koşucu. |

---

## 📊 Görsel Haritalar
- **İnteraktif 2D Ağ Grafiği:** graphify-out/graph.html
- **Hiyerarşik Ağaç Görünümü (seçilmiş mimari bileşenler):** graphify-out/GRAPH_TREE.html
