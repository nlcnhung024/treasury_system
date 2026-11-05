import sys
sys.stdout.reconfigure(encoding='utf-8')
import asyncio
from collections import defaultdict
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:123456789@localhost:5432/bank_statement_db')
    async with engine.connect() as conn:
        res = await conn.execute(text('''
            SELECT 
                loan_id, contract_number, bank_code, bank_name, borrower_name,
                current_principal_balance, next_principal_amount, next_interest_amount,
                interest_rate,
                COALESCE(
                    NULLIF(total_repayment_amount, 0),
                    NULLIF(next_principal_amount + next_interest_amount, 0),
                    current_principal_balance
                ) AS obligation,
                COALESCE(next_repayment_date, maturity_date) AS due_date
            FROM credit_facilities
            WHERE is_active = true AND status = 'ACTIVE'
            ORDER BY COALESCE(next_repayment_date, maturity_date) ASC NULLS LAST
        '''))
        loans = res.fetchall()

    # Structure data:
    # 1. Months list sorted
    # 2. For each month: days list sorted (only days with loans)
    # 3. Banks list sorted
    # 4. Matrix: bank_code -> month_key -> day_key -> list of loans
    months_set = sorted(list(set(l.due_date.strftime('%Y-%m') for l in loans if l.due_date)))
    banks_map = {}
    for l in loans:
        b_code = (l.bank_code or 'OTHER').upper()
        if b_code not in banks_map:
            banks_map[b_code] = l.bank_name or b_code

    print('Months:', months_set)
    print('Banks:', banks_map)

    await engine.dispose()

asyncio.run(main())

