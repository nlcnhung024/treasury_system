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
    credit_statements,
    invoices,
    corporate_entities,
    banks,
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
api_router.include_router(credit_statements.router)
api_router.include_router(invoices.router)
api_router.include_router(corporate_entities.router)
api_router.include_router(banks.router)
