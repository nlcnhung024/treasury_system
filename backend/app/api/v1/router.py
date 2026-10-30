from fastapi import APIRouter
from app.api.v1 import (
    auth,
    statements,
    accounts,
    transactions,
    cash_ledger,
    categories,
    rules,
    reports,
    templates,
    audit_logs,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(statements.router)
api_router.include_router(accounts.router)
api_router.include_router(transactions.router)
api_router.include_router(cash_ledger.router)
api_router.include_router(categories.router)
api_router.include_router(rules.router)
api_router.include_router(reports.router)
api_router.include_router(templates.router)
api_router.include_router(audit_logs.router)

