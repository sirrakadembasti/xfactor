# Proje Kalite İyileştirme Yol Haritası

<!-- continuity:schema_version=1 -->
<!-- continuity:initiative=project-quality-improvement -->
<!-- continuity:improvement_plan_sha256=b6ca1549990034bdd391ac89eebd7677522d13fc6f9192a5ad24c14d898f0db8 -->
<!-- continuity:master_plan=implementation-plans/00-MASTER-EXECUTION-PLAN.md -->
<!-- continuity:current_unit=P2 -->
<!-- continuity:status=pending -->

Bu dosya kullanıcı tarafından ön yüzde/Kod Editörü görünümünde izlenebilen yol haritasıdır. Kanonik oturum devri `PROJECT-CONTINUITY.md`, ayrıntılı iş tanımı `implementation-plans/`, gerçek doğrulama makbuzları `implementation-evidence/` altındadır.

## Durum Anahtarı

- `[ ]` Bekliyor
- `[~]` Devam ediyor
- `[!]` Bloke veya reddedildi
- `[x]` Kanıtla doğrulandı

Bir satır yalnız ilgili evidence dosyası `verified` olduğunda `[x]` yapılabilir. Ajan beyanı veya dosya varlığı yeterli değildir.

## Baseline

| Alan | Değer |
| --- | --- |
| Pre-ledger commit | `4164592f6a633f6094ff7fe45b4662c6bdbd835e` |
| Planning checkpoint commit | `42a3eae0c7e8ae9291380c95dfa0c8e2a6af5fd5` |
| İyileştirme planı | `PROJECT-QUALITY-IMPROVEMENT-PLAN.md` |
| Plan SHA-256 | `b6ca1549990034bdd391ac89eebd7677522d13fc6f9192a5ad24c14d898f0db8` |
| Master plan | `implementation-plans/00-MASTER-EXECUTION-PLAN.md` |
| Aktif birim | `P2` |
| Genel durum | `pending` |

## Teslim Birimleri

### P0 — Yanlış completion üretimini durdur

- [x] **P0-A — State ve contract safety**
  - Plan: `implementation-plans/01-P0-A-state-contract-safety.md`
  - Evidence: `implementation-evidence/P0-A.md`
  - Hedef: sürümlü contract, ayrılmış state machine, rejection semantics, coarse checkpoint invalidation.
- [x] **P0-B — OS sandbox ve fail-closed verification**
  - Plan: `implementation-plans/02-P0-B-sandbox-verification.md`
  - Evidence: `implementation-evidence/P0-B.md`
  - Bağımlılık: P0-A verified.
- [x] **P0-C — Selective checkpoint safety**
  - Plan: `implementation-plans/03-P0-C-checkpoint-safety.md`
  - Evidence: `implementation-evidence/P0-C.md`
  - Bağımlılık: P0-A verified.

### P1 — Contract, runtime ve artifact doğrulaması

- [x] **P1-A — Contract ve requirement traceability**
  - Plan: `implementation-plans/04-P1-A-contract-traceability.md`
  - Evidence: `implementation-evidence/P1-A.md`
  - Bağımlılık: P0-A ve P0-B verified.
- [x] **P1-B — Runtime/API/browser verifier**
  - Plan: `implementation-plans/05-P1-B-runtime-verifier.md`
  - Evidence: `implementation-evidence/P1-B.md`
  - Bağımlılık: P0-B ve P1-A verified.
- [x] **P1-C — ZIP artifact clean-room validation**
  - Plan: `implementation-plans/06-P1-C-artifact-validation.md`
  - Evidence: `implementation-evidence/P1-C.md`
  - Bağımlılık: P0-B, P0-C ve P1-B verified.

### P2 — Kalite hardening

- [ ] **P2 — Domain/skeleton/template/security/README/scope hardening**
  - Plan: `implementation-plans/07-P2-quality-hardening.md`
  - Evidence: `implementation-evidence/P2.md`
  - Bağımlılık: P1-A, P1-B ve P1-C verified.

### P3 — Gözlemlenebilirlik ve metrikler

- [ ] **P3 — Evidence dashboard, audit history ve quality metrics**
  - Plan: `implementation-plans/08-P3-observability-metrics.md`
  - Evidence: `implementation-evidence/P3.md`
  - Bağımlılık: P2 verified.

## Genel Doğrulama Kapıları

Her teslim biriminde:

- [ ] Unit plan checklist tamamlandı.
- [ ] Task-specific testler geçti.
- [ ] Unit-level davranış doğrulaması geçti.
- [ ] Bağımsız reviewer blocking bulgu vermedi.
- [ ] Bağımsız tester sonucu yeniden üretti.
- [ ] Evidence receipt gerçek komut/exit code/commit içeriyor.
- [ ] `PROJECT-CONTINUITY.md` ile bu dosya uyumlu.
- [ ] `node scripts/validate-continuity.mjs` PASS.

## Şu Anki Adım

P2 Step P2.6.1 (Enforce Core Requirement Priority in DAG) tamamlandı ve bağımsız testle doğrulandı. Sıradaki görev P2 Step P2.6.2 (Reject Unsolicited Features from Planner).

Sonraki görev:

```text
P2 Task 6 — Core-over-Optional Scope Planner and DAG Policy (Step P2.6.2: Reject Unsolicited Features from Planner)
RED: node backend/tests/test_p2_scope_priority.js --test=unsolicited-features
```

## Yeni Sohbet İçin Başlangıç

1. `PROJECT-CONTINUITY.md` oku.
2. `implementation-plans/00-MASTER-EXECUTION-PLAN.md` oku.
3. Yalnız aktif unit planını ve evidence dosyasını oku.
4. `node scripts/validate-continuity.mjs` çalıştır.
5. Git HEAD/worktree ile ledger durumunu karşılaştır.
6. Yalnız `Exact Next Action` ile devam et.

## Kapsam Dışı

- Mevcut `todo-app` çıktısını düzeltmek.
- Kanıtsız satırı tamamlandı işaretlemek.
- Plan onayı olmadan framework/state/gate sözleşmesi değiştirmek.
- Yeni sohbet hafızasını kanonik kaynak saymak.
