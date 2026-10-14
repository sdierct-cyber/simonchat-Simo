"""Transactional, explicitly funded video failure reserve. No payment API calls."""
import math
import os
from decimal import Decimal

class ReserveUnavailable(RuntimeError):
    pass


FAILURE_ALLOWANCE = 0.25
# Conservative per-credit allocation for the current included annual allowances.
NET_CREDIT_CEILING = 0.05
MINIMUM_MARGIN = 0.65


def is_video_action(action):
    return str(action).startswith(('video_', 'long_video_'))


def ensure(conn):
    conn.execute('CREATE TABLE IF NOT EXISTS simo_video_reserve_wallet (id INTEGER PRIMARY KEY CHECK(id=1), cents INTEGER NOT NULL CHECK(cents>=0))')
    conn.execute('INSERT OR IGNORE INTO simo_video_reserve_wallet VALUES (1,0)')
    conn.execute('CREATE TABLE IF NOT EXISTS simo_video_reserve_funding (reference TEXT PRIMARY KEY, cents INTEGER NOT NULL CHECK(cents>0))')
    conn.execute('CREATE TABLE IF NOT EXISTS simo_video_reserve_holds (reference TEXT PRIMARY KEY, budget INTEGER NOT NULL, contribution INTEGER NOT NULL, started INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT "held")')


def reserve(conn, reference, credits, *, unlimited=False, action="video_generate"):
    ensure(conn)
    unit = min(NET_CREDIT_CEILING, float(os.getenv('SIMO_VIDEO_NET_USD_PER_CREDIT', str(NET_CREDIT_CEILING))))
    if not math.isfinite(unit) or unit <= 0:
        raise RuntimeError('Invalid video revenue allocation; generation blocked.')
    revenue_cents = int(math.floor(int(credits)*unit*100 + 1e-8))
    margin=min(.95,max(MINIMUM_MARGIN,float(os.getenv('SIMO_VIDEO_MIN_MARGIN_RATIO',str(MINIMUM_MARGIN)))))
    if str(action).endswith('_4k'):
        margin=max(margin,min(.9,max(0.,float(os.getenv('SIMO_VIDEO_4K_MIN_MARGIN_RATIO','.72')))))
    if not math.isfinite(margin):raise RuntimeError('Invalid video margin allocation.')
    usable = int(math.floor(revenue_cents*(1-margin) + 1e-8))
    budget = max(1, math.ceil(revenue_cents*(1-margin)/(1+FAILURE_ALLOWANCE) - 1e-9))
    contribution = max(0, usable-budget)
    balance = conn.execute('SELECT cents FROM simo_video_reserve_wallet WHERE id=1').fetchone()[0]
    holds = conn.execute('SELECT COALESCE(SUM(budget),0) FROM simo_video_reserve_holds WHERE state="held"').fetchone()[0]
    if balance-holds < budget:
        raise ReserveUnavailable('Video creation is temporarily unavailable because its protected operating reserve is insufficient. No generation started and no credits were taken.')
    conn.execute('INSERT INTO simo_video_reserve_holds(reference,budget,contribution) VALUES (?,?,?)', (reference,budget,contribution if not unlimited else 0))
    return {'reference':reference,'operator_test':bool(unlimited)}


def start(conn, receipt):
    if not receipt:return
    ensure(conn)
    row=conn.execute('SELECT state FROM simo_video_reserve_holds WHERE reference=?',(receipt['reference'],)).fetchone()
    if not row or row[0] != 'held':
        raise RuntimeError('Video expense reservation is not available; paid submission blocked.')
    conn.execute('UPDATE simo_video_reserve_holds SET started=1 WHERE reference=?',(receipt['reference'],))


def settle(conn, receipt, *, delivered):
    if not receipt:return
    ensure(conn)
    row=conn.execute('SELECT budget,contribution,started,state FROM simo_video_reserve_holds WHERE reference=?',(receipt['reference'],)).fetchone()
    if not row or row[3] != 'held':return
    budget,contribution,started,_=row
    # Hold unknown submissions until reconciliation. Confirmed failed delivery
    # books the whole upper expense allocation conservatively, never assumes a refund.
    change = (contribution if not receipt.get('operator_test') else -budget) if delivered else (-budget if started else 0)
    conn.execute('UPDATE simo_video_reserve_wallet SET cents=cents+? WHERE id=1',(change,))
    conn.execute('UPDATE simo_video_reserve_holds SET state=? WHERE reference=?',('delivered' if delivered else 'released',receipt['reference']))


def fund(conn, dollars, reference):
    ensure(conn)
    cents=int(Decimal(str(dollars))*100)
    if cents<=0 or not str(reference).strip():raise ValueError('Positive funding and a unique reference are required.')
    old=conn.execute('SELECT cents FROM simo_video_reserve_funding WHERE reference=?',(reference,)).fetchone()
    if old:
        if old[0]!=cents:raise ValueError('Funding reference already has a different amount.')
        return
    conn.execute('INSERT INTO simo_video_reserve_funding VALUES (?,?)',(reference,cents))
    conn.execute('UPDATE simo_video_reserve_wallet SET cents=cents+? WHERE id=1',(cents,))
