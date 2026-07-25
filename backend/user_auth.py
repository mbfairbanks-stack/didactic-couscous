"""Multi-user authentication — stores users in a separate auth.db.

Tokens are stored hashed (SHA-256) in a sessions table; each login creates
its own session row, so multiple devices stay logged in independently.
Legacy plaintext tokens in users.token are migrated to hashed sessions on
first use.
"""
import hashlib
import os
import re
import secrets
import sqlite3
import bcrypt

AUTH_DB_PATH = os.getenv("AUTH_DB_PATH", "/data/auth.db")
USER_DB_DIR = os.getenv("USER_DB_DIR", "/data/users")
TOKEN_TTL_DAYS = int(os.getenv("TOKEN_TTL_DAYS", "90"))

# Usernames become database filenames — keep them to a safe charset.
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


def _pw_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def _check_pw(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def _make_token() -> str:
    return secrets.token_urlsafe(32)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


_schema_ready = False


def _get_conn() -> sqlite3.Connection:
    global _schema_ready
    os.makedirs(os.path.dirname(os.path.abspath(AUTH_DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(AUTH_DB_PATH)
    if not _schema_ready:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username      TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                token         TEXT UNIQUE NOT NULL,
                is_demo       INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT DEFAULT (datetime('now')),
                token_expires TEXT DEFAULT NULL
            )
        """)
        # Migration: add token_expires column if missing
        cols = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "token_expires" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN token_expires TEXT DEFAULT NULL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                username   TEXT NOT NULL,
                expires    TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.commit()
        _schema_ready = True
    return conn


# Short-lived token cache: avoids an auth.db hit on every request.
# TTL is kept small so revoked/expired tokens stop working promptly.
_TOKEN_CACHE_TTL_SECONDS = 60
_token_cache: dict = {}  # token -> (username, is_demo, cached_at_monotonic)


def _token_cache_get(token: str):
    import time
    entry = _token_cache.get(token)
    if not entry:
        return None
    username, is_demo, cached_at = entry
    if time.monotonic() - cached_at > _TOKEN_CACHE_TTL_SECONDS:
        _token_cache.pop(token, None)
        return None
    return username, is_demo


def _token_cache_put(token: str, username: str, is_demo: bool):
    import time
    if len(_token_cache) > 1000:  # bound memory; entries self-expire anyway
        _token_cache.clear()
    _token_cache[token] = (username, is_demo, time.monotonic())


def _token_cache_clear():
    _token_cache.clear()


def _token_expiry() -> str:
    import datetime
    return (datetime.datetime.utcnow() + datetime.timedelta(days=TOKEN_TTL_DAYS)).isoformat()


def _is_expired(expires: str) -> bool:
    import datetime
    try:
        return datetime.datetime.fromisoformat(expires) < datetime.datetime.utcnow()
    except (ValueError, TypeError):
        return False


def _new_session(conn: sqlite3.Connection, username: str) -> str:
    """Create a session row and return its plaintext token (never stored)."""
    import datetime
    token = _make_token()
    conn.execute(
        "INSERT INTO sessions (token_hash, username, expires) VALUES (?,?,?)",
        (_hash_token(token), username, _token_expiry()),
    )
    # Opportunistic cleanup of expired sessions
    conn.execute(
        "DELETE FROM sessions WHERE expires < ?",
        (datetime.datetime.utcnow().isoformat(),),
    )
    return token


def seed_default_users(admin_password: str = "") -> None:
    """Called at startup — always refreshes demo and admin credentials."""
    conn = _get_conn()
    demo_password = os.getenv("DEMO_PASSWORD", "demo")
    # users.token is vestigial (sessions carry auth) but NOT NULL UNIQUE — store a hash.
    conn.execute(
        "INSERT OR REPLACE INTO users (username, password_hash, token, is_demo, token_expires) VALUES (?,?,?,1,?)",
        ("demo", _pw_hash(demo_password), _hash_token(_make_token()), _token_expiry()),
    )
    if admin_password:
        existing = conn.execute(
            "SELECT password_hash FROM users WHERE username='admin'"
        ).fetchone()
        if not existing or not _check_pw(admin_password, existing[0]):
            conn.execute(
                "INSERT OR REPLACE INTO users (username, password_hash, token, is_demo, token_expires) VALUES (?,?,?,0,?)",
                ("admin", _pw_hash(admin_password), _hash_token(_make_token()), _token_expiry()),
            )
    conn.commit()
    conn.close()
    _token_cache_clear()


def authenticate(username: str, password: str):
    """Returns (token, is_demo) or raises ValueError on bad credentials."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT password_hash, is_demo FROM users WHERE username=?",
        (username,),
    ).fetchone()
    if not row or not _check_pw(password, row[0]):
        conn.close()
        raise ValueError("Invalid credentials")

    token = _new_session(conn, username)
    conn.commit()
    conn.close()
    return token, bool(row[1])


def register(username: str, password: str) -> str:
    """Creates a new user. Returns the token. Raises ValueError if name taken."""
    if not USERNAME_RE.match(username):
        raise ValueError(
            "Username must be 3-32 characters: letters, numbers, dots, dashes or underscores"
        )
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    if username.lower() in ("demo", "admin"):
        raise ValueError(f"Username '{username}' is reserved")
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, token, is_demo, token_expires) VALUES (?,?,?,0,?)",
            (username, _pw_hash(password), _hash_token(_make_token()), _token_expiry()),
        )
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("Username already taken")
    token = _new_session(conn, username)
    conn.commit()
    conn.close()
    return token


def get_user_from_token(token: str):
    """Returns (username, is_demo) or None if token is invalid or expired."""
    cached = _token_cache_get(token)
    if cached:
        return cached

    conn = _get_conn()
    row = conn.execute(
        """SELECT s.username, u.is_demo, s.expires
           FROM sessions s JOIN users u ON u.username = s.username
           WHERE s.token_hash = ?""",
        (_hash_token(token),),
    ).fetchone()

    if not row:
        # Legacy fallback: plaintext token in users.token from before hashing.
        # Migrate it to a hashed session row and remove the plaintext at rest.
        legacy = conn.execute(
            "SELECT username, is_demo, token_expires FROM users WHERE token=?",
            (token,),
        ).fetchone()
        if legacy and not _is_expired(legacy[2]):
            token_hash = _hash_token(token)
            conn.execute(
                "INSERT OR IGNORE INTO sessions (token_hash, username, expires) VALUES (?,?,?)",
                (token_hash, legacy[0], legacy[2] or _token_expiry()),
            )
            conn.execute(
                "UPDATE users SET token=? WHERE username=?", (token_hash, legacy[0])
            )
            conn.commit()
            conn.close()
            _token_cache_put(token, legacy[0], bool(legacy[1]))
            return legacy[0], legacy[1]
        conn.close()
        return None

    conn.close()
    username, is_demo, expires = row
    if _is_expired(expires):
        return None
    _token_cache_put(token, username, bool(is_demo))
    return username, is_demo


def get_user_db_path(username: str, is_demo: bool) -> str:
    if is_demo:
        path = "/data/demo.db"
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        return path
    os.makedirs(USER_DB_DIR, exist_ok=True)
    # basename() guards against path separators in legacy usernames;
    # new registrations are restricted to USERNAME_RE anyway.
    return os.path.join(USER_DB_DIR, f"{os.path.basename(username)}.db")
