# Emlak yönetimi üretim olayı — 28 Eylül 2026

## Gözlenen durum

`emlak-yonetim-1` için arayüzde son ajan olayı Tester `FINISH` (18:52:32) iken Manager sohbeti uygulamanın tamamlandığını ve doğrulanmış ZIP'in indirilebileceğini söyledi. SQLite kaydında proje `implementing`, sözleşme `approved`, doğrulama koşusu ve tamamlama makbuzu yoktu. `RAPOR.md` de yalnız statik denetimin geçtiğini ve izole runtime doğrulamasının beklendiğini belirtiyordu. Dolayısıyla Tester `FINISH`, ürünün tamamlandığı anlamına gelmiyordu.

Çalışma girişiminin son kalp atışı 15:59:20 UTC, yeni backend sürecinin başlangıcı 15:59:21 UTC idi. Önceki girişim veritabanında `running` kaldı. Worker'ın bağımlılık hazırlama işi 16:00:32 UTC'de `Host fallback npm install exited with code 1` hatasıyla bitti. Worker kaydı npm'in ayrıntılı stderr çıktısını saklamadığından bu hata kodunun paket uyuşmazlığı mı, ağ mı, kayıt servisi mi kaynaklı olduğu kesinleştirilemedi. Üretilen manifestte React ve Vue bağımlılıkları birlikte bulunduğu ayrıca gözlendi; bu ayrı bir üretim kalitesi riskidir, ancak bu olayın npm hata kodunun doğrulanmış nedeni değildir.

İlk kullanıcı isteği Nuxt 4 dese de Manager planı Vue 3 + Vite olarak sunmuş; kullanıcı bu planı daha sonra onaylamış. Bu teknoloji sapması, takılmanın doğrulanmış nedeni değil, plan onayında ayrıca ele alınması gereken bir kapsam uyuşmazlığıdır. Üretilen README'nin NextAuth değişkenlerini tarif etmesi de seçilen Vue/Express yığınıyla uyuşmuyor.

## XFactor düzeltmeleri

- Backend açılışında süresi dolmuş workflow girişimleri uzlaştırılır; proje güvenle `paused` durumuna geçer ve kullanıcıya devam seçeneği görünür.
- Manager'a sorulan tamamlanma ve takılma soruları, sohbet modelinin tahminine bırakılmadan proje durumu, tamamlama makbuzu, doğrulanmış artefakt ve son log üzerinden yanıtlanır. Statik Tester sonucu tamamlanma kanıtı sayılmaz.
- Manager telemetrisinde son girişim kimlik dizilişine göre değil başlama zamanına göre seçilir.
- Frontend `implementing` durumunu “Üretiliyor” olarak gösterir.
- Bağımlılık hazırlığı logda ayrı aşama olarak görünür; worker hata döndürürse genel “lockfile yok” mesajı yerine bu hata XFactor süreç hatasına taşınır.

## İşletim notu

Bu değişiklikler mevcut üretilmiş projenin dosyalarını değiştirmez. Geliştirme backend'i kod değişikliği sonrasında yeniden başladığında bayat girişim otomatik olarak `stale_terminated`, proje `paused` oldu; arayüzde “Durduruldu” ve “Devam Et” göründüğü doğrulandı. Devam kararı verilirse bağımlılık hazırlığı yeniden çalışır; worker'ın npm hatası yeniden oluşursa proje doğrulanmış sayılmamalı ve ayrıntılı hata kanıtı toplanmalıdır.

## 20:30 bağımlılık hatası ve devam ettirme incelemesi

Sonraki emlak denemelerinde iki `Host fallback npm install exited with code 1` hatası görüldü. Kullanıcı 20:48'de yeniden devam ettirdiğinde Manager başlangıç ve mimari yazma logları tekrar oluştu; Coder görevleri geçerli checkpoint'ler için tek tek `skip` olayı kaydetti. SQLite incelemesinde 300 proje logu ve 36 görev checkpoint'i vardı. İş akışında görev bazlı CAS checkpoint bulunmasına rağmen statik Tester aşamasından bağımlılık hazırlığına geçişin kalıcı aşama kaydı yoktu. Bu nedenle devam isteği baştan yürümeye başlıyordu.

XFactor artık statik denetim ve README tamamlandıktan sonra onaylı sözleşme kimliği, sözleşme özeti ve artefakt dosyalarının içerik özetini `workflow_state` içinde saklar. Sonraki denemede sözleşme ve dosyalar aynıysa Manager/DAG/Tester üretimini atlayıp doğrudan bağımlılık hazırlığını yeniden dener; yalnızca tek bir `resume` olayı yazar. Sözleşme veya dosya değişmişse eski aşama kanıtı kullanılmaz. Bağımlılık hazırlığı başarılı olup lockfile özeti doğrulandıktan sonra bu aşama kaydı temizlenir; sonraki runtime doğrulama hatası bağımlılık hazırlığı hatası gibi ele alınmaz. Görev checkpoint'iyle atlanan her Coder işi için ayrı `skip` logu yazılması kaldırıldı. Böylece ilerleme kanıtı korunurken tekrar loglarının birikmesi önlenir.

Bu aşama kaydı eski denemelerde bulunmadığından, mevcut emlak projesinin ilk yeni denemesi güvenli doğrulama akışından geçer. Ondan sonraki bağımlılık hatalarında yukarıdaki doğrudan devam yolu çalışır. Mevcut `projects/emlak-yonetim-1` dosyaları bu inceleme sırasında değiştirilmedi ve üretim yeniden başlatılmadı.

Üretilen `package.json` içinde Vue 3 planına karşılık React eklentisi, React bağımlılıkları ve Vue ekosistemi için `^1.0.0` sürümleri bulunuyordu. XFactor şablonu artık Vue Vite projesinde Vue 3, Vue Router 4, Pinia ve `@vitejs/plugin-vue` kullanır; `.vue` importlarını tarar ve yalnızca XFactor'ın oluşturduğu varsayılan React Vite konfigürasyonunu Vue biçimine dönüştürür. Bu uyumsuzluk somut bir üretim kusurudur. Worker yalnız çıkış kodu sakladığı için 20:30 npm hatasının tek nedeninin bu olduğu kesinleşmiş değildir.

21:41'de başlatılmış yeni deneme bağımlılık hazırlığını geçti, ancak doğrulama koşusu 21:52'de `prisma_seed`, `typecheck`, `framework_build`, `readme_check`, `smoke_liveness_probe` ve `test_script_presence` kontrollerinde başarısız oldu. Veritabanında proje yine `paused` durumunda; doğrulanmış tamamlanma kanıtı yok. Bu yeni hata, npm kurulum hatasının aşıldığını gösterir; uygulamanın tamamlandığını göstermez. Bu kalite hatalarının otomatik ve hedefli onarımı bu değişikliğin kapsamında tamamlanmadı; mevcut görev checkpoint'lerinin geçerli olması aynı hatalı çıktının tekrar doğrulanmasına yol açabilir.
