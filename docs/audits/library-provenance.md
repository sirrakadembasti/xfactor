# Library delivery provenance (Task 1)

Checked 2026-09-27. Source: `backend/data/deliveries/kutuphane-takip-sistemi-2.zip`. No delivery, artifact, receipt, database, or application file was changed.

## Identity and receipt

| Item | Observed value |
| --- | --- |
| Delivery ZIP | 132,943 bytes; SHA-256 `fa4de0c3590d1ee22919d0315cb318254b366ae135844c88033613b9f7f64f86` |
| Verified artifact | `backend/data/artifacts/kutuphane-takip-sistemi-2-artifact-e946bc50-2f04-48f1-a7dd-45a38bd80bad.zip`; same size and SHA-256, hence byte identical |
| Artifact row | `artifact-e946bc50-2f04-48f1-a7dd-45a38bd80bad`, status `verified` |
| Verification run | `verification-64c92082-78b7-43cd-97fa-25fe8a3c1874`, status `verified`, policy `2.0` |
| Completion receipt | `completion-2c2a938f-37fc-4094-9241-1d254207e466`; links that artifact ID, hash, and run ID; revisions 53 → 54; completed `2026-09-24T17:23:23.670Z` |

An earlier artifact, `artifact-2f590083-23c2-4191-b367-5a17a1f9896b`, was also marked verified with the same hash, but is not linked by the completion receipt. Several rejected artifacts share this hash. The receipt identifies the particular completed run.

## Archive checks and listing

Python `ZipFile.testzip()` returned `None` across all 59 entries: CRC check passed. No entry had an absolute or drive path, backslash, `..` component, colon, or Unix symlink mode. The ZIP was inspected in place; no extraction was performed. Central-directory order:

```text
.dockerignore
.env.example
Dockerfile
DURUM.md
jsconfig.json
next-env.d.ts
next.config.js
package-lock.json
package.json
postcss.config.js
prisma/schema.prisma
prisma/seed.ts
README.md
service-manifest.json
src/app/admin/books/page.tsx
src/app/admin/page.tsx
src/app/api/books/[id]/route.ts
src/app/api/books/route.ts
src/app/api/categories/[id]/route.ts
src/app/api/categories/route.ts
src/app/api/dashboard/stats/route.ts
src/app/api/loans/[id]/return/route.ts
src/app/api/loans/[id]/route.ts
src/app/api/loans/route.ts
src/app/api/members/[id]/route.ts
src/app/api/members/route.ts
src/app/books/[id]/page.tsx
src/app/books/page.tsx
src/app/categories/page.tsx
src/app/globals.css
src/app/layout.tsx
src/app/loans/page.tsx
src/app/members/page.tsx
src/app/page.tsx
src/components/admin/book-form-dialog.tsx
src/components/books/book-filters.tsx
src/components/Navbar.tsx
src/components/ui/book-card.tsx
src/components/ui/book-skeleton.tsx
src/components/ui/empty-state.tsx
src/lib/api.ts
src/lib/auth.ts
src/lib/db.ts
src/lib/prisma.ts
src/lib/services/bookService.ts
src/lib/services/loanService.ts
src/lib/utils.ts
src/lib/validations.ts
src/lib/validations/book.schema.ts
src/lib/validations/book.ts
src/lib/validations/category.schema.ts
src/lib/validations/loan.schema.ts
src/lib/validations/loan.ts
src/lib/validations/member.schema.ts
src/types/index.ts
tailwind.config.ts
tests/library.test.ts
tsconfig.json
tsconfig.tsbuildinfo
```

## Expanded sibling

Each ZIP file has a counterpart under `backend/data/deliveries/kutuphane-takip-sistemi-2`, but `Dockerfile` and `next-env.d.ts` differ by SHA-256. The sibling also contains `.env`, `prisma/dev.db`, `node_modules`, and `.next` files absent from the ZIP. It is not a byte-for-byte extraction of the delivered archive. No `.env` contents were read or recorded.

## Exact read-only commands

Run from the repository root:

```powershell
python -c "from pathlib import Path; from hashlib import sha256; p=Path('backend/data/deliveries/kutuphane-takip-sistemi-2.zip'); print(p.stat().st_size,sha256(p.read_bytes()).hexdigest()); [(print(x.name,x.stat().st_size,sha256(x.read_bytes()).hexdigest())) for x in Path('backend/data/artifacts').glob('kutuphane-takip-sistemi-2-*')]"

@'
from pathlib import Path, PurePosixPath, PureWindowsPath
from zipfile import ZipFile
from hashlib import sha256
p=Path('backend/data/deliveries/kutuphane-takip-sistemi-2.zip')
s=Path('backend/data/deliveries/kutuphane-takip-sistemi-2')
with ZipFile(p) as z:
    entries=z.infolist()
    print('count',len(entries),'crc_failure',z.testzip())
    bad=[]; links=[]; missing=[]; different=[]
    for i in entries:
        n=i.filename; parts=PurePosixPath(n).parts
        if n.startswith(('/', '\\')) or '\\' in n or '..' in parts or PureWindowsPath(n).is_absolute() or ':' in n: bad.append(n)
        if ((i.external_attr >> 16) & 0o170000) == 0o120000: links.append(n)
        if not i.is_dir():
            q=s.joinpath(*parts)
            if not q.is_file(): missing.append(n)
            elif sha256(z.read(i)).digest()!=sha256(q.read_bytes()).digest(): different.append(n)
        print(n,format(i.CRC,'08x'))
    print('unsafe',bad,'symlinks',links,'missing',missing,'different',different)
'@ | python -

@'
import sqlite3
c=sqlite3.connect('file:backend/data/projects.db?mode=ro',uri=True)
pid='kutuphane-takip-sistemi-2'
print(list(c.execute('select id,sha256,size,status,verification_run_id from artifacts where project_id=?',(pid,))))
print(list(c.execute('select id,artifact_id,artifact_hash,run_id,policy_version,previous_revision,next_revision,completed_at from completion_receipts where project_id=?',(pid,))))
print(list(c.execute('select id,status,policy_version from verification_runs where project_id=?',(pid,))))
'@ | python -
```

## Limits

CRC and path checks establish archive readability and basic extraction path safety; they do not establish build, runtime, or behavioral correctness. The production SQLite file was queried read-only for provenance metadata. No fresh scratch extraction was made in this task, and no application or Docker command was run. A later runtime audit should extract this exact ZIP into a private scratch directory and keep all writes there.
