"""Multi-user authentication — stores users in a separate auth.db."""
import os
import hashlib
import sqlite3

AUTH_DB_PATH = os.getenv("AUTH_DB_PATH", "/data/auth.db")
USER_DB_DIR = os.getenv("USER_DB_DIR", "/data/users")


def _pw_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _make_token(username: str, pw_hash: str) -> str:
    return hashlib.sha256(f"{username}:{pw_hash}".encode()).hexdigest()


def _get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(AUTH_DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(AUTH_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            username   TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            token      TEXT UNIQUE NOT NULL,
            is_demo    INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    return conn


def seed_default_users(admin_password: str = "") -> None:
    """Called at startup — seeds demo and admin accounts if missing."""
    conn = _get_conn()
    # Demo user — always present, password is "demo"
    dph = _pw_hash("demo")
    conn.execute(
        "INSERT OR IGNORE INTO users (username, password_hash, token, is_demo) VALUES (?,?,?,1)",
        ("demo", dph, _make_token("demo", dph)),
    )
    # Admin — created from BUDGET_PASSWORD env var
    if admin_password:
        aph = _pw_hash(admin_password)
        conn.execute(
            "INSERT OR IGNORE INTO users (username, password_hash, token, is_demo) VALUES (?,?,?,0)",
            ("admin", aph, _make_token("admin", aph)),
        )
    conn.commit()
    conn.close()


def authenticate(username: str, password: str):
    """Returns (token, is_demo) or raises ValueError on bad credentials."""
    conn = _get_conn()
    ph = _pw_hash(password)
    row = conn.execute(
        "SELECT token, is_demo FROM users WHERE username=? AND password_hash=?",
        (username, ph),
    ).fetchone()
    conn.close()
    if not row:
        raise ValueError("Invalid credentials")
    return row[0], bool(row[1])


def register(username: str, password: str) -> str:
    """Creates a new user. Returns the token. Raises ValueError if name taken."""
    if username.lower() in ("demo", "admin"):
        raise ValueError(f"Username '{username}' is reserved")
    conn = _get_conn()
    ph = _pw_hash(password)
    token = _make_token(username, ph)
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, token, is_demo) VALUES (?,?,?,0)",
            (username, ph, token),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("Username already taken")
    conn.close()
    return token


def get_user_from_token(token: str):
    """Returns (username, is_demo) or None if token is invalid."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT username, is_demo FROM users WHERE token=?", (token,)
    ).fetchone()
    conn.close()
    return row


def get_user_db_path(username: str, is_demo: bool) -> str:
    if is_demo:
        path = "/data/demo.db"
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        return path
    os.makedirs(USER_DB_DIR, exist_ok=True)
    return os.path.join(USER_DB_DIR, f"{username}.db")
