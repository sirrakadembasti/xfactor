"""Disposable API flow probe for the library delivery audit.

Run only against the isolated audit container and database.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from uuid import uuid4


BASE = "http://127.0.0.1:43127"
if sys.argv[1:] or os.environ.get("XFACTOR_LIBRARY_AUDIT_DISPOSABLE") != "xfactor-library-audit-20260927":
    raise SystemExit("Refusing writes: set the exact disposable-container marker; target is fixed to loopback:43127")


def call(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": "application/json"} if body else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def expect(label, method, path, status, data=None):
    actual, result = call(method, path, data)
    print(f"{label}: {method} {path} -> {actual} (expected {status})")
    if actual != status:
        raise AssertionError(f"{label}: {result}")
    return result


suffix = uuid4().hex[:10]
expect("dashboard", "GET", "/api/dashboard/stats", 200)
expect("anonymous member list", "GET", "/api/members", 200)
expect("invalid category", "POST", "/api/categories", 400, {})
category = expect("category create", "POST", "/api/categories", 201, {"name": "Audit " + suffix})
expect("category read", "GET", "/api/categories", 200)
expect("duplicate category", "POST", "/api/categories", 409, {"name": "Audit " + suffix})
book = expect("book create", "POST", "/api/books", 201, {
    "isbn": "AUDIT-" + suffix, "title": "Audit Book", "author": "Audit Author",
    "categoryId": category["id"], "totalCopies": 1,
})
member = expect("member create", "POST", "/api/members", 201, {
    "fullName": "Audit Member", "email": suffix + "@example.test", "status": "ACTIVE",
})
due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
loan_payload = {"bookId": book["id"], "memberId": member["id"], "dueDate": due}
loan = expect("borrow", "POST", "/api/loans", 201, loan_payload)
expect("stock exhausted", "POST", "/api/loans", 400, loan_payload)
after_borrow = expect("book after borrow", "GET", "/api/books/" + book["id"], 200)
assert after_borrow["availableCopies"] == 0
expect("return", "PUT", "/api/loans/" + loan["id"], 200, {"action": "RETURN"})
expect("double return", "PUT", "/api/loans/" + loan["id"], 400, {"action": "RETURN"})
after_return = expect("book after return", "GET", "/api/books/" + book["id"], 200)
assert after_return["availableCopies"] == 1
expect("loan history before deletion", "GET", "/api/loans/" + loan["id"], 200)
expect("anonymous member delete", "DELETE", "/api/members/" + member["id"], 200)
expect("loan history after deletion", "GET", "/api/loans/" + loan["id"], 404)
print("FLOW COMPLETE: anonymous writes and loan-history deletion reproduced")
