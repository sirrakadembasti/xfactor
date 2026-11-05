# Windows native-worker trust review — 2026-11-02

Status: unresolved. Keep the local profile blocked pending trust/security review. Docker verification does not resolve native helper trust or permanent Windows distribution reliability.

Targeted Defender Operational evidence shows two detections (1116) and successful quarantines (1117) on2026-11-01:10:38/10:40 and15:14/15:16 Europe/Istanbul. Detection: Trojan:Win32/Bearfoos.A!ml; intelligence1.463.68.0; engine1.1.26100.4. Event records21401/21402/21418/21419 refer to the helper whose source/build-script hash is `65cd2c90230ad606a295b588b8310038b6d954ea36a47e59f51e997aca8ec732`. This establishes detection/action on that path, not a false positive or causality for a particular application failure.

Current cached candidate:8704 bytes, SHA256 `3c1071628c67c095d1074d06dfd6817092d72755aca517c9541a017660d24db9`, Authenticode NotSigned, creation/last-write2026-11-01T12:18:25.7664546Z (15:18:25 Turkey). Its receipt matches current bytes. **Byte identity with either detected sample is unproven.** Filename sourceHash is not PE SHA256; creation time follows the second quarantine. A local receipt does not establish trusted publisher provenance or malware safety.

The unchanged native build script invokes Add-Type without an explicit signing, timestamp, toolchain-pin or deterministic-output step. HEAD observed:c00d34443e5defbcaae8a626678a7e1b557175a3; native source/script working-tree diff empty at collection. Exact candidate build toolchain/attestation and reproducibility remain unknown.

Private, ignored evidence package: `.tmp/stok-diagnostic/native-trust-review-20261102/`. It contains narrowly matched raw event XML/JSON, a timestamped minimal Defender status, manifest, receipt, hash-verified candidate copied as `.bin`, provenance, English submission draft and release plan. Raw events contain local account/device/path identifiers; do not commit or automatically disclose the package. SHA256SUMS.json is an unsigned inventory. No external submission, native compilation/execution, quarantine restoration, AV change or certificate generation was performed.

Remaining work:

- Owner/security approval of sample identity, privacy/disclosure and Microsoft submission; record final determination. Do not describe a false positive as proven.
- Publisher/signing-provider and protected key custody decisions; supported platforms and pinned CI toolchain.
- Reproducible unsigned-build evidence, signed/timestamped versioned releases and independently trusted final-artifact manifests; explicit install/update in place of job-time compilation.
- Protection-enabled Windows acceptance testing only after separate authorization/security review, followed by explicit local-profile release decision.

Microsoft does not offer a developer false-positive-prevention/known-list enrollment program. Consistent trusted-root signing helps identify the publisher; it does not guarantee non-detection. See [developer FAQ](https://learn.microsoft.com/en-us/defender-xdr/developer-faq). The [submission portal](https://www.microsoft.com/en-us/wdsi/filesubmission) requests the relevant sample and product/detection/version/background details; submission/disclosure is still pending. Build reproducibility depends on pinned inputs beyond source text; see [C# deterministic compilation](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/code-generation#deterministic) and [SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool).
