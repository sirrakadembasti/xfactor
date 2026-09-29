# Library ZIP execution ledger

All commands ran on 2026-09-27 against the ZIP extracted to `C:\Users\ahmet\AppData\Local\Temp\xfactor-library-audit-5i4x82vk`, except repository-local read-only queries and the probe script. This file retains decisive console observations; it is not a full unabridged terminal log. Test containers used only loopback ports and private databases.

## Host and source

```text
node --version -> v22.23.2
npm --version -> 11.11.1
docker info --format '{{.ServerVersion}}' -> 29.2.0 (after Docker Desktop start)
python zipfile testzip -> None; entries -> 59; SHA-256 -> fa4de0c3590d1ee22919d0315cb318254b366ae135844c88033613b9f7f64f86
```

Windows `npm ci --ignore-scripts` first ended with `EPERM` on npm cache `stat`. A second authorized Windows invocation stayed silent for several minutes and was interrupted. Neither is counted as a delivery dependency failure.

## Docker and build

From the isolated extraction:

```text
docker build -t xfactor-library-audit:20260927 .
#9 [builder 4/7] RUN npm ci -> CACHED
#11 [builder 6/7] RUN npx prisma generate -> DONE
#12 [builder 7/7] RUN npm run build -> DONE 196.3s
Next.js 16.3.6: Compiled successfully; Finished TypeScript; static pages (12/12)
#16 [runner 6/7] COPY --from=builder /app/public ./public
ERROR: failed to calculate checksum ... "/app/public": not found
exit 1
```

`Dockerfile.audit` existed only in the scratch extraction. Its sole change from ZIP `Dockerfile` was insertion of `RUN mkdir -p public` before `RUN npx prisma generate`.

```text
docker build -f Dockerfile.audit -t xfactor-library-audit:patched .
#11 [builder 6/8] RUN mkdir -p public -> DONE
#13 [builder 8/8] RUN npm run build -> DONE 162.8s
#19 naming to docker.io/library/xfactor-library-audit:patched
exit 0

docker build --target builder -f Dockerfile.audit -t xfactor-library-audit:builder .
#13 [builder 8/8] RUN npm run build -> CACHED
#14 naming to docker.io/library/xfactor-library-audit:builder
exit 0

docker run --rm --entrypoint sh xfactor-library-audit:builder -lc 'npm ci --ignore-scripts'
added 153 packages, and audited 154 packages in 5m
3 high severity vulnerabilities
exit 0
```

## First run and API

```text
docker run -d --name xfactor-library-audit-20260927 -p 127.0.0.1:43127:3000 -e DATABASE_URL=file:./audit.db xfactor-library-audit:patched
container ID 5026e7d14af765cf9e59ff78a17d62668ea5e82db20414344153202eb5086d6
GET http://127.0.0.1:43127/ -> 200
GET http://127.0.0.1:43127/api/categories -> 500
docker logs ... -> Prisma P2021: The table `main.Category` does not exist in the current database.
docker exec xfactor-library-audit-20260927 npx prisma validate -> exit 0, schema valid
docker exec xfactor-library-audit-20260927 npx prisma db push -> exit 0, database in sync
GET http://127.0.0.1:43127/api/categories -> 200
```

Before issuing writes, `docker inspect --format '{{.Id}} {{.Name}} {{json .HostConfig.PortBindings}}' xfactor-library-audit-20260927` returned that same ID, `/xfactor-library-audit-20260927`, and `{"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":"43127"}]}`. This was a **manual preflight**. The Python probe itself only enforces a fixed loopback URL and a caller-supplied environment marker; it does not independently validate Docker identity.

```text
$env:XFACTOR_LIBRARY_AUDIT_DISPOSABLE='xfactor-library-audit-20260927'; python docs\audits\library_http_probe.py
dashboard GET -> 200; anonymous member list GET -> 200
invalid category POST -> 400; category POST -> 201; duplicate POST -> 409
book POST -> 201; member POST -> 201; loan POST -> 201
second loan POST -> 400; stock after borrow -> 0
return PUT -> 200; double return PUT -> 400; stock after return -> 1
loan GET before member DELETE -> 200; anonymous member DELETE -> 200; loan GET afterward -> 404
exit 0; FLOW COMPLETE
```

The probe's full request sequence and assertions are in [library_http_probe.py](library_http_probe.py). It was run only on this throwaway database.

## Seed, unit test, type check, lint

```text
docker run --rm -e DATABASE_URL=file:./unit-audit.db --entrypoint sh xfactor-library-audit:builder -lc 'npx prisma validate && npx prisma db push && npm run prisma:seed && npm test && npx tsc --noEmit'
schema valid; SQLite unit-audit.db created; seed completed
TAP tests 1, pass 1, fail 0
tsc --noEmit exit 0; whole command exit 0

docker run --rm --entrypoint sh xfactor-library-audit:builder -lc 'npm run lint'
> next lint
Invalid project directory provided, no such directory: /app/lint
exit 1

docker run --rm --entrypoint sh xfactor-library-audit:builder -lc 'npm audit --omit=dev --audit-level=high'
deepmerge-ts <8.0.0, Severity: high
prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5
3 high severity vulnerabilities; exit 1

docker run --rm --entrypoint sh xfactor-library-audit:builder -lc 'npm ls deepmerge-ts --all'
prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5; exit 0
```

## Persistence and real-browser UI

```text
docker volume create xfactor-library-audit-data-20260927 -> exit 0
docker run -d --name xfactor-library-audit-persist-20260927 -p 127.0.0.1:43128:3000 -v xfactor-library-audit-data-20260927:/app/prisma -e DATABASE_URL=file:./audit.db xfactor-library-audit:patched
docker exec xfactor-library-audit-persist-20260927 npx prisma db push -> exit 0
POST /api/categories {"name":"Persistence Audit 20260927"} -> 201, id cmuk02om60000ms0ixgqy15hg
docker stop xfactor-library-audit-persist-20260927; docker rm xfactor-library-audit-persist-20260927
docker run -d --name xfactor-library-audit-persist-20260927b -p 127.0.0.1:43128:3000 -v xfactor-library-audit-data-20260927:/app/prisma -e DATABASE_URL=file:./audit.db xfactor-library-audit:patched
GET /api/categories -> [('cmuk02om60000ms0ixgqy15hg', 'Persistence Audit 20260927')]
```

Codex in-app browser, accessibility-tree observations:

```text
URL /loans?new=true: heading 'Ödünç Takip Sistemi', button '+ Yeni Ödünç Ver', no 'Yeni Ödünç Verme' heading/form.
URL /loans?modal=borrow: heading 'Yeni Ödünç Verme', book/member selectors, due-date field, 'Ödünç Ver' button present.
```

The navbar's `Hızlı Ödünç Ver` link points to `/loans?new=true` in both observations.

## Cleanup and final source check

```text
docker stop xfactor-library-audit-20260927 xfactor-library-audit-persist-20260927b -> exit 0
docker rm xfactor-library-audit-20260927 xfactor-library-audit-persist-20260927b -> exit 0
docker volume rm xfactor-library-audit-data-20260927 -> exit 0
docker image rm xfactor-library-audit:patched xfactor-library-audit:builder -> exit 0
docker ps --format '{{.Names}}' -> no running containers
Test-Path C:\Users\ahmet\AppData\Local\Temp\xfactor-library-audit-5i4x82vk -> False
source ZIP SHA-256 recheck -> fa4de0c3590d1ee22919d0315cb318254b366ae135844c88033613b9f7f64f86
```
