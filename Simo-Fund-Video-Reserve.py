"""Record an operator-allocated failure budget. Does not move or charge money."""
import argparse
from pathlib import Path
import sqlite3
from simo_video.profit_reserve import fund

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--database',required=True,help='Existing main simo.db path; NOT a video database.')
parser.add_argument('--amount',required=True,help='Dollars you have actually allocated for video failure coverage.')
parser.add_argument('--reference',required=True,help='Unique reference for this allocation; repeats are idempotent.')
parser.add_argument('--confirm-funded',action='store_true',required=True,help='Confirm these are real allocated funds, not expected future sales.')
a=parser.parse_args()
p=Path(a.database).resolve()
if not p.is_file():raise SystemExit('Main database not found; no new database was created.')
conn=sqlite3.connect(p)
try:
    tables={row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if 'simo_credit_events' not in tables:raise RuntimeError('This is not the main Simo credit database.')
    conn.execute('BEGIN IMMEDIATE')
    fund(conn,a.amount,a.reference)
    balance=conn.execute('SELECT cents FROM simo_video_reserve_wallet WHERE id=1').fetchone()[0]
    conn.commit()
    print('Operating reserve recorded: $%.2f. No payment was made or charged.' % (balance/100))
except Exception:
    conn.rollback();raise
finally:
    conn.close()
