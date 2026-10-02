# Depo temizliği ve refactor — 1 Ekim 2026

## İnceleme yöntemi

Başlangıç Git sürümü: `8b00ded`. README, kullanıcı kılavuzu, Graphify'nin
`graph.json`, `graph.html`, `GRAPH_TREE.html` çıktıları ve Git'te izlenen dosyalar
birlikte incelendi. Import bağlantılarına ek olarak npm komutları, Dockerfile,
HTML girişleri, CI, test envanteri ve dinamik dosya yolları kontrol edildi.
Backend/frontend kaynaklarında AST ile kullanılmayan import taraması yapıldı.
Statik haritada bağlantısız olmak tek başına silme ölçütü değildir.

## Temizlenenler

| Konum | Kanıt ve işlem |
| --- | --- |
| Frontend manifest ve lockfile | Kaynak kodda kullanılmayan `file-saver` kaldırıldı. ZIP indirme mevcut API/tarayıcı mekanizmasıyla çalışır. |
| `backend/scripts/complete_stok_takip.js` | Çağıranı olmayan, `stok-takip-mvp-1` projesinin DB durumunu doğrudan değiştiren tek kullanımlık betik kaldırıldı; çalıştırılmadı. |
| `scripts/validate-continuity.mjs` | npm/CI/uygulama çağıranı yok. İstediği eski kök plan/defter dosyaları bulunmuyor. Salt okuma denemesi ENOENT ile başarısız oldu; betik kaldırıldı. |
| Kök dizindeki dokuz `_tmp_library_*.mjs` | Belirli örnek projeye ait deneme betikleri. `.tmp/cleanup-recovery-2026-10-01/` içine kopyalanıp SHA-256 eşitliği doğrulandıktan sonra kökten kaldırıldı. `manifest.json` isim, boyut ve hash içerir. Kurtarma kopyaları Git dışında tutulur. |
| Kullanılmayan import'lar | Backend validator, dosya sistemi ve kalite politikası import'ları; frontend'de otomatik JSX dönüşümü sayesinde gerekmeyen React default import'ları kaldırıldı. Kullanılan doğrulama fonksiyonları korunur. |

## Korunan dosya ve klasörler

| Konum | Kullanım |
| --- | --- |
| `execution/entrypoint.js`, `execution/localBrowserRunner.cjs` | Dockerfile ve yerel worker tarafından başlatılan gerçek giriş noktaları. |
| `backend/scripts/backup.js`, `restore.js`, `create_admin.js` | Kullanıcı tarafından çalıştırılan bakım komutları. |
| `scripts/test-p6-*.mjs`, `scripts/test-p9-production-pipeline.mjs`, `e2e/`, `backend/tests/` | CI veya bağımsız test girişleri; uygulama import'u gerektirmezler. |
| `frontend/index.html`, Vite/Vitest/PostCSS/Tailwind ayarları | Araçlar tarafından yüklenen girişler ve yapılandırmalar. |
| `docs/`, `surec-raporu.md`, `x-agents/` | Operasyon/karar/test kayıtları ve güvenilir platform ajan talimatları. |
| `graphify-out/` Python metadata ve kılavuzları | Ayrı isteğe bağlı Python Graphify aracının önbellek ve kullanım dosyaları; Node haritasının güncellik göstergesi değiller. |
| `backend/data/`, `projects/` | Kullanıcı verileri ve üretilen uygulamalar. |
| `.worktrees/` | `git worktree list` içinde kayıtlı aktif çalışma alanı. |
| `.mimocode/`, `.superpowers/`, `.github/` | Geliştirme araçları ve CI yapılandırması. |
| `node_modules/`, `dist/`, `frontend/dist/`, diğer `.tmp/` kayıtları | Kurulu bağımlılıklar, worker paketleri, build çıktıları ve önceki test kanıtları. |

Frontend'de bağlantısız olduğu doğrulanan bir bileşen dosyası bulunmadı; bağımlılık
ve import temizliği yapıldı. Diğer backend rol, doğrulama ve repository modülleri
gerçek çağıranlarına bağlı. Dışarıdan elle kullanılabilecek her betiğin gereksizliği
statik analizle kesin olarak kanıtlanamaz; amacı olan dosyalar korunur.

## Kod refactor'u

- `frontend/src/utils/projectLogs.js`: HTTP/WebSocket log birleştirme, ID/event
  tekilleştirme, sıralama ve 500 kayıt sınırı App bileşeninden ayrıldı.
- `backend/projectFileReader.js`: dosya API'sinin filtreleme ve güvenli okuma
  politikası route dosyasından ayrıldı. Authentication/proje erişim kontrolü
  route üzerinde kaldı. Yanıt alanları değişmedi.
- Mevcut 2 MiB dosya / 500 dosya / 20 MiB toplam sınırları korunur. Son dosyada
  toplam sınırı aşma hatası giderildi; stat sonrasında büyüyen dosyada da gerçek
  okunan byte sayısı kontrol edilir. Özel dosyalar ve symlink'ler filtrelenir.

Varsayılan admin bilgileri ve Docker'sız worker seçimi değiştirilmedi.

## Doğrulama

- Windows üzerinde `frontend/` içinde `npm run test:unit`: 11 dosya, 75 test geçti.
- `npm run build`: 1700 modül dönüştürüldü; üretim build'i başarılı.
- Backend'in izole test runner'ı ile iki grupta toplam 16 farklı paket geçti:
  `test_project_file_reader`, `test_symlink_isolation`, `test_p7_files_api`,
  `test_http_integration`, `test_p1_13_async_error_propagation`,
  `test_p1_12_pagination_limits`, `test_agent_document_boundary`,
  `test_docs_agent_sync`, `test_p5_execution_boundary`, `test_graphify`,
  `test_agent_contract_schemas`, `test_p1_b_quality_policy_evidence`,
  `test_p5_artifact_completion`, `test_p9_artifact_pipeline`,
  `test_download_completion`, `test_project_tree_env_exclusion`.
- Yeni dosya okuyucu testi ayrıca `node backend/tests/test_project_file_reader.js`
  ile çalıştırıldı. Son dosyada bütçe aşımı, boş kalan bütçeye küçük dosya eklenmesi,
  stat/read arasında büyüyen dosya, 500 kayıt ve özel dosya filtreleri geçti.
- Mevcut HTTP symlink testlerinde 4 başarı, 0 hata, 0 atlama.
- Bağımsız kod incelemesinde düzeltme gerektiren bulgu çıkmadı.
- `npm run graph`: JSON, etkileşimli harita, ağaç ve rapor yeniden üretildi.
  Silinen betiklerin dosya düğümleri kaldırıldı; yeni modüller haritada mevcut.
- `git diff --check`: başarılı. Kullanıcı verileri ve kurtarma arşivi değişiklik
  kapsamına alınmadı. Bu liste seçilmiş regresyon kontrolleridir; tüm backend
  envanterinin veya Docker imaj testlerinin yeniden çalıştırıldığı anlamına gelmez.
