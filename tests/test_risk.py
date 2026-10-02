from types import SimpleNamespace

from backend.analytics.risk import WEIGHTS, analyze_account


class FakeCursor:
    def __init__(self, summary, velocity_row, terminal_counts):
        self._summary = summary
        self._velocity_row = velocity_row
        self._terminal_counts = terminal_counts
        self.description = [
            ("account",), ("total_inflow",), ("total_outflow",), ("inbound_txns",), ("outbound_txns",), ("unique_senders",), ("unique_receivers",),
        ]

    def execute(self, query, params=None):
        return self

    def fetchone(self):
        if self._summary is not None:
            value = self._summary
            self._summary = None
            return value
        if self._velocity_row is not None:
            value = self._velocity_row
            self._velocity_row = None
            return (value,)
        value = self._terminal_counts
        self._terminal_counts = None
        return value

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100


def test_analyze_account_reuses_cached_result(monkeypatch):
    fake_con = FakeCursor(
        (
            "ACC000000001",
            10000.0,
            12000.0,
            8,
            9,
            5,
            4,
        ),
        0.92,
        (2, 1, 0),
    )
    monkeypatch.setattr("backend.analytics.risk.get_connection", lambda read_only=True: fake_con)

    analyze_account.cache_clear()
    first = analyze_account("ACC000000001")
    second = analyze_account("ACC000000001")

    assert first == second
    assert analyze_account.cache_info().hits >= 1
