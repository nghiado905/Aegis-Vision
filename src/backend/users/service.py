import sqlite3

from ..core.security import hash_password
from .schemas import UserCreate


def create_user(db: sqlite3.Connection, data: UserCreate) -> sqlite3.Row:
    cursor = db.execute(
        "INSERT INTO users(username,display_name,password_hash,is_admin,created_at) "
        "VALUES(?,?,?,0,strftime('%s','now'))",
        (data.username, data.display_name, hash_password(data.password)),
    )
    db.commit()
    return db.execute("SELECT * FROM users WHERE id=?", (cursor.lastrowid,)).fetchone()
