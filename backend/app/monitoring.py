"""Operational metrics and strictly minimal error reporting, without message data."""
import hmac
from time import perf_counter

import sentry_sdk
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from prometheus_client import CollectorRegistry, Counter, Histogram, CONTENT_TYPE_LATEST, generate_latest

from .config import settings

router = APIRouter(tags=["Operasional"])
registry = CollectorRegistry()
requests = Counter("untukmu_http_requests_total", "API responses by route template", ["method", "route", "status"], registry=registry)
duration = Histogram("untukmu_http_duration_seconds", "API response duration", ["method", "route"], registry=registry)


def scrub_event(event, hint):
    # Rebuild an allowlist, including no request, user, breadcrumb, SQL, local
    # variable, URL, exception message, log message or arbitrary tag.
    values = event.get("exception", {}).get("values", [])
    return {"event_id": event.get("event_id"), "timestamp": event.get("timestamp"),
            "platform": "python", "level": "error", "environment": settings().environment,
            "exception": {"values": [{"type": value.get("type", "Error"), "value": "Application error"} for value in values]}}


def configure_sentry():
    if settings().sentry_dsn:
        sentry_sdk.init(dsn=settings().sentry_dsn, environment=settings().environment,
                        send_default_pii=False, max_request_body_size="never", include_local_variables=False,
                        include_source_context=False, max_breadcrumbs=0, traces_sample_rate=0,
                        before_send=scrub_event)


async def observe(request, call_next):
    start, status = perf_counter(), 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        route = getattr(request.scope.get("route"), "path", "unmatched")
        if route != "/metrics":
            requests.labels(request.method, route, str(status)).inc()
            duration.labels(request.method, route).observe(perf_counter() - start)


@router.get("/metrics", include_in_schema=False)
async def metrics(request: Request):
    token = settings().metrics_token
    if not token:
        raise HTTPException(404, "Tidak ditemukan.")
    if not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + token):
        raise HTTPException(401, "Token pemantauan diperlukan.")
    return Response(generate_latest(registry), headers={"Content-Type": CONTENT_TYPE_LATEST, "Cache-Control": "no-store"})
