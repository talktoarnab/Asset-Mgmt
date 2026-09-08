from datetime import datetime, timezone

from domain.analytics import build_report, build_summary
from domain.assets import (
    add_units_to_asset,
    create_asset,
    delete_asset,
    get_asset_detail,
    list_assets,
    patch_unit_on_asset,
    remove_unit_from_asset,
    resolve_scan,
    update_asset,
)
from domain.checkouts import (
    checkout_asset,
    close_checkout,
    get_checkout,
    list_member_history,
    list_open_loans,
    list_open_loans_for_asset,
    list_recent_checkouts,
    renew_checkout,
)
from domain.members import create_member, delete_member, get_member, list_members, set_open_loan_count, update_member
from domain.orgs import ensure_org, update_org
from domain.rules import evaluate_eligibility
from domain import schemas
from lib.auth import actor_label, auth_context_from, desk_staff, issue_session, pin_matches, require_role
from lib import env
from lib.errors import HttpError, ValidationError, conflict, unauthorized
from lib.http import created, error_response, json_response, no_content, ok, parse_body
from lib.router import Router
from domain.types import stock_levels
from domain.units import find_unit_by_serial, get_unit, list_units

router = Router()


def _query(ctx):
    return ctx.get("query") or {}


def _login(ctx):
    parsed = parse_body(schemas.login, ctx.get("body"), ctx.get("isBase64Encoded"))
    if not pin_matches(parsed["pin"]):
        raise unauthorized("That PIN is not recognised.")
    auth = desk_staff()
    org = ensure_org(auth["orgId"], env.org_name())
    return ok({"token": issue_session(auth), "user": auth, "org": org})


def _me(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    return ok({"user": ctx["auth"], "org": org})


def _get_settings(ctx):
    return ok(ensure_org(ctx["auth"]["orgId"], env.org_name()))


def _patch_settings(ctx):
    require_role(ctx["auth"], "admin")
    ensure_org(ctx["auth"]["orgId"], env.org_name())
    patch = parse_body(schemas.settings, ctx.get("body"), ctx.get("isBase64Encoded"))
    return ok(update_org(ctx["auth"]["orgId"], patch))


def _list_members(ctx):
    members = list_members(ctx["auth"]["orgId"])
    term = (_query(ctx).get("q") or "").strip().lower()
    if not term:
        return ok({"items": members, "total": len(members)})
    digits = "".join(ch for ch in term if ch.isdigit())
    filtered = [
        m
        for m in members
        if term in m["name"].lower()
        or (len(digits) >= 3 and digits in m.get("phone", ""))
        or term in (m.get("email") or "").lower()
    ]
    return ok({"items": filtered, "total": len(filtered)})


def _create_member(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    data = parse_body(schemas.member_create, ctx.get("body"), ctx.get("isBase64Encoded"))
    if not data.get("email"):
        data.pop("email", None)
    member = create_member(ctx["auth"]["orgId"], data, org["defaultCountryCode"])
    return created(member)


def _get_member(ctx):
    return ok(get_member(ctx["auth"]["orgId"], ctx["params"]["memberId"]))


def _patch_member(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    patch = parse_body(schemas.member_update, ctx.get("body"), ctx.get("isBase64Encoded"))
    if patch.get("email") == "":
        patch["email"] = ""
    return ok(update_member(ctx["auth"]["orgId"], ctx["params"]["memberId"], patch, org["defaultCountryCode"]))


def _delete_member(ctx):
    require_role(ctx["auth"], "admin")
    delete_member(ctx["auth"]["orgId"], ctx["params"]["memberId"])
    return no_content()


def _member_history(ctx):
    org_id = ctx["auth"]["orgId"]
    member_id = ctx["params"]["memberId"]
    return ok({"member": get_member(org_id, member_id), "items": list_member_history(org_id, member_id)})


def _list_assets(ctx):
    assets = list_assets(ctx["auth"]["orgId"])
    term = (_query(ctx).get("q") or "").strip().lower()
    status = (_query(ctx).get("status") or "").strip()
    category = (_query(ctx).get("category") or "").strip()
    serial_hit = find_unit_by_serial(ctx["auth"]["orgId"], term) if term else None
    serial_asset_id = serial_hit["assetId"] if serial_hit else None
    filtered = []
    for asset in assets:
        if status:
            _stock, on_hand = stock_levels(asset)
            if status == "available":
                if asset.get("status") != "available" or on_hand < 1:
                    continue
            elif status == "checked_out":
                if asset.get("status") in ("lost", "maintenance", "retired") or (_stock - on_hand) < 1:
                    continue
            elif asset.get("status") != status:
                continue
        if category and asset.get("category") != category:
            continue
        if term:
            blob = " ".join(
                [
                    asset.get("title", ""),
                    asset.get("code", ""),
                    asset.get("sku") or "",
                    asset.get("creator") or "",
                    asset.get("identifier") or "",
                    asset.get("location") or "",
                ]
            ).lower()
            if term not in blob and asset.get("assetId") != serial_asset_id:
                continue
        filtered.append(asset)
    if "units" in (_query(ctx).get("include") or "").split(","):
        for asset in filtered:
            asset["units"] = list_units(ctx["auth"]["orgId"], asset["assetId"])
    return ok({"items": filtered, "total": len(filtered)})


def _create_asset(ctx):
    ensure_org(ctx["auth"]["orgId"], env.org_name())
    data = parse_body(schemas.asset_create, ctx.get("body"), ctx.get("isBase64Encoded"))
    return created(create_asset(ctx["auth"]["orgId"], data))


def _bulk_assets(ctx):
    ensure_org(ctx["auth"]["orgId"], env.org_name())
    parsed = parse_body(schemas.asset_bulk, ctx.get("body"), ctx.get("isBase64Encoded"))
    results = []
    for row in parsed["assets"]:
        try:
            results.append({"ok": True, "asset": create_asset(ctx["auth"]["orgId"], row)})
        except Exception as error:
            results.append({"ok": False, "title": row.get("title"), "error": str(error) or "Could not be added"})
    return json_response(207, {"created": sum(1 for r in results if r["ok"]), "failed": sum(1 for r in results if not r["ok"]), "results": results})


def _open_for_asset(org_id, asset):
    loans = sorted(list_open_loans_for_asset(org_id, asset["assetId"]), key=lambda loan: loan.get("dueAt") or "")
    return loans, loans[0] if loans else None


def _get_asset(ctx):
    org_id = ctx["auth"]["orgId"]
    asset = get_asset_detail(org_id, ctx["params"]["assetId"])
    loans, active = _open_for_asset(org_id, asset)
    return ok({"asset": asset, "activeCheckout": active, "openCheckouts": loans})


def _patch_asset(ctx):
    patch = parse_body(schemas.asset_update, ctx.get("body"), ctx.get("isBase64Encoded"))
    return ok(update_asset(ctx["auth"]["orgId"], ctx["params"]["assetId"], patch))


def _delete_asset(ctx):
    require_role(ctx["auth"], "admin")
    delete_asset(ctx["auth"]["orgId"], ctx["params"]["assetId"])
    return no_content()


def _add_units(ctx):
    data = parse_body(schemas.units_add, ctx.get("body"), ctx.get("isBase64Encoded"))
    asset = add_units_to_asset(
        ctx["auth"]["orgId"], ctx["params"]["assetId"], data["count"], data.get("serials")
    )
    return created(asset)


def _patch_unit(ctx):
    patch = parse_body(schemas.unit_update, ctx.get("body"), ctx.get("isBase64Encoded"))
    return ok(patch_unit_on_asset(ctx["auth"]["orgId"], ctx["params"]["assetId"], ctx["params"]["unitId"], patch))


def _delete_unit(ctx):
    return ok(remove_unit_from_asset(ctx["auth"]["orgId"], ctx["params"]["assetId"], ctx["params"]["unitId"]))


def _scan(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    data = parse_body(schemas.scan, ctx.get("body"), ctx.get("isBase64Encoded"))
    org_id = ctx["auth"]["orgId"]
    asset, unit = resolve_scan(org_id, data["ref"])
    asset = get_asset_detail(org_id, asset["assetId"])
    loans, active = _open_for_asset(org_id, asset)
    if unit:
        unit = next((item for item in asset.get("units") or [] if item["unitId"] == unit["unitId"]), unit)
        unit_loans = [loan for loan in loans if loan.get("unitId") == unit["unitId"]]
        active = unit_loans[0] if unit_loans else None
    member = get_member(org_id, data["memberId"]) if data.get("memberId") else None
    blockers = evaluate_eligibility(org, member, asset, datetime.now(timezone.utc), unit=unit) if member else []
    _, on_hand = stock_levels(asset)
    if unit:
        if unit.get("status") == "checked_out":
            suggested = "checkin"
        elif unit.get("status") == "available":
            suggested = "checkout"
        else:
            suggested = "none"
    else:
        suggested = "checkout" if on_hand > 0 else "checkin" if loans else "none"
    return ok(
        {
            "asset": asset,
            "unit": unit,
            "activeCheckout": active,
            "openCheckouts": loans,
            "member": member,
            "blockers": blockers,
            "suggestedAction": suggested,
        }
    )


def _list_checkouts(ctx):
    status = _query(ctx).get("status") or "open"
    org_id = ctx["auth"]["orgId"]
    if status in ("open", "overdue"):
        now = datetime.now(timezone.utc)
        loans = list_open_loans(org_id)
        if status == "overdue":
            loans = [
                loan
                for loan in loans
                if datetime.fromisoformat(loan["dueAt"].replace("Z", "+00:00")).astimezone(timezone.utc) < now
            ]
        return ok({"items": loans, "total": len(loans)})
    items = list_recent_checkouts(org_id, int(_query(ctx).get("limit") or 100))
    return ok({"items": items, "total": len(items)})


def _create_checkout(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    data = parse_body(schemas.checkout_create, ctx.get("body"), ctx.get("isBase64Encoded"))
    org_id = ctx["auth"]["orgId"]
    asset, unit = resolve_scan(org_id, data.get("unitRef") or data["assetRef"])
    if data.get("unitId"):
        unit = get_unit(org_id, asset["assetId"], data["unitId"])
    member = get_member(org_id, data["memberId"])
    checkout = checkout_asset(
        {
            "org": org,
            "member": member,
            "asset": asset,
            "unit": unit,
            "loanDays": data.get("loanDays"),
            "notes": data.get("notes"),
            "actor": actor_label(ctx["auth"]),
        }
    )
    return created({"checkout": checkout, "asset": get_asset_detail(org_id, asset["assetId"]), "member": member})


def _checkin_id(ctx):
    data = parse_body(schemas.checkin, ctx.get("body"), ctx.get("isBase64Encoded")) if ctx.get("body") else {}
    checkout = get_checkout(ctx["auth"]["orgId"], ctx["params"]["checkoutId"])
    closed = close_checkout(checkout, {"actor": actor_label(ctx["auth"]), "outcome": "returned", **data})
    return ok(closed)


def _checkin_ref(ctx):
    ensure_org(ctx["auth"]["orgId"], env.org_name())
    data = parse_body(schemas.checkin_by_ref, ctx.get("body"), ctx.get("isBase64Encoded"))
    org_id = ctx["auth"]["orgId"]
    asset, unit = resolve_scan(org_id, data["assetRef"])
    loans, active = _open_for_asset(org_id, asset)
    if unit:
        match = next((loan for loan in loans if loan.get("unitId") == unit["unitId"]), None)
        if not match:
            raise conflict(
                "NOT_ON_LOAN",
                f'{unit["serial"]} is not currently checked out, so there is nothing to return.',
            )
        target = match
    else:
        if not active:
            raise conflict(
                "NOT_ON_LOAN",
                f'"{asset["title"]}" is not currently checked out, so there is nothing to return.',
            )
        target = loans[0]
    closed = close_checkout(
        target,
        {
            "actor": actor_label(ctx["auth"]),
            "outcome": "returned",
            "condition": data.get("condition"),
            "notes": data.get("notes"),
        },
    )
    return ok({"checkout": closed, "asset": get_asset_detail(org_id, asset["assetId"])})


def _renew(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    checkout = get_checkout(ctx["auth"]["orgId"], ctx["params"]["checkoutId"])
    return ok(renew_checkout(checkout, org, actor_label(ctx["auth"])))


def _lost(ctx):
    require_role(ctx["auth"], "admin")
    data = parse_body(schemas.checkin, ctx.get("body"), ctx.get("isBase64Encoded")) if ctx.get("body") else {}
    checkout = get_checkout(ctx["auth"]["orgId"], ctx["params"]["checkoutId"])
    return ok(close_checkout(checkout, {"actor": actor_label(ctx["auth"]), "outcome": "lost", "notes": data.get("notes")}))


def _summary(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    org_id = ctx["auth"]["orgId"]
    return ok(
        build_summary(org, list_assets(org_id), list_members(org_id), list_open_loans(org_id), list_recent_checkouts(org_id, 500))
    )


def _report(ctx):
    org = ensure_org(ctx["auth"]["orgId"], env.org_name())
    org_id = ctx["auth"]["orgId"]
    return ok(
        build_report(org, list_assets(org_id), list_members(org_id), list_open_loans(org_id), list_recent_checkouts(org_id, 1000))
    )


def _reconcile(ctx):
    require_role(ctx["auth"], "admin")
    org_id = ctx["auth"]["orgId"]
    members = list_members(org_id)
    open_loans = list_open_loans(org_id)
    counts = {}
    for loan in open_loans:
        counts[loan["memberId"]] = counts.get(loan["memberId"], 0) + 1
    repaired = []
    for member in members:
        actual = counts.get(member["memberId"], 0)
        if actual != member.get("openLoans"):
            set_open_loan_count(org_id, member["memberId"], actual)
            repaired.append(member["memberId"])
    return ok({"checked": len(members), "repaired": len(repaired), "memberIds": repaired})


router.post("/v1/auth/login", _login)
router.get("/v1/me", _me)
router.get("/v1/settings", _get_settings)
router.patch("/v1/settings", _patch_settings)
router.get("/v1/members", _list_members)
router.post("/v1/members", _create_member)
router.get("/v1/members/{memberId}", _get_member)
router.patch("/v1/members/{memberId}", _patch_member)
router.delete("/v1/members/{memberId}", _delete_member)
router.get("/v1/members/{memberId}/history", _member_history)
router.get("/v1/assets", _list_assets)
router.post("/v1/assets", _create_asset)
router.post("/v1/assets/bulk", _bulk_assets)
router.get("/v1/assets/{assetId}", _get_asset)
router.patch("/v1/assets/{assetId}", _patch_asset)
router.delete("/v1/assets/{assetId}", _delete_asset)
router.post("/v1/assets/{assetId}/units", _add_units)
router.patch("/v1/assets/{assetId}/units/{unitId}", _patch_unit)
router.delete("/v1/assets/{assetId}/units/{unitId}", _delete_unit)
router.post("/v1/scan", _scan)
router.get("/v1/checkouts", _list_checkouts)
router.post("/v1/checkouts", _create_checkout)
router.post("/v1/checkouts/{checkoutId}/checkin", _checkin_id)
router.post("/v1/checkins", _checkin_ref)
router.post("/v1/checkouts/{checkoutId}/renew", _renew)
router.post("/v1/checkouts/{checkoutId}/lost", _lost)
router.get("/v1/analytics/summary", _summary)
router.get("/v1/analytics/report", _report)
router.post("/v1/maintenance/reconcile", _reconcile)

PUBLIC_ROUTES = {"POST /v1/auth/login"}


def handler(event, context=None):
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET"
    path = event.get("rawPath") or "/"
    try:
        auth = desk_staff() if f"{method} {path}" in PUBLIC_ROUTES else auth_context_from(event)
        return router.handle(
            {
                "method": method,
                "path": path,
                "query": event.get("queryStringParameters") or {},
                "body": event.get("body"),
                "isBase64Encoded": bool(event.get("isBase64Encoded")),
                "auth": auth,
            }
        )
    except Exception as error:
        if not isinstance(error, (HttpError, ValidationError)):
            print({"event": "request.error", "method": method, "path": path}, error)
        return error_response(error)
