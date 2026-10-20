import sqlite3

from .permissions import allows


def membership(db: sqlite3.Connection, workspace_id: int, user_id: int) -> sqlite3.Row | None:
    return db.execute(
        "SELECT * FROM members WHERE workspace_id=? AND user_id=?",
        (workspace_id, user_id),
    ).fetchone()


def has_permission(db: sqlite3.Connection, workspace_id: int, user_id: int, required: str) -> bool:
    member = membership(db, workspace_id, user_id)
    return bool(member and allows(member["role"], required))
