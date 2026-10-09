class CreditError(RuntimeError):
    pass


class CreditHooks:
    """Explicit bridge to Simo's existing Profit Shield; no duplicate ledger."""
    def __init__(self, reserve_fn=None, release_fn=None, status_fn=None):
        self.reserve_fn = reserve_fn
        self.release_fn = release_fn
        self.status_fn = status_fn

    @property
    def connected(self):
        return callable(self.reserve_fn) and callable(self.release_fn)

    def reserve(self, cost: int, action: str = "video_generate"):
        if not self.connected:
            return {"mock": True, "cost": int(cost), "action": str(action)}
        ok, reservation, denied = self.reserve_fn(str(action or "video_generate"), int(cost))
        if not ok:
            raise CreditDenied(denied)
        return reservation

    def release(self, reservation, reason="video_failed"):
        if reservation and not reservation.get("mock") and callable(self.release_fn):
            self.release_fn(reservation, reason)

    def status(self):
        return self.status_fn() if callable(self.status_fn) else None


class CreditDenied(Exception):
    def __init__(self, response):
        super().__init__("Simo Credits are not available for this video request.")
        self.response = response
