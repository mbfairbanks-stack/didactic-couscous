"""Multi-user authentication — stores users in a separate auth.db."""
import os
import secrets
import sqlite3
import bcrypt

AUTH_DB_PATH = os.getenv("AUTH_DB_PATH", "/data/auth.db")
USER_DB_DIR = os.getenv("USER_DB_DIR", "/data/users")
TOKEN_TTL_DAYS = int(os.getenv("TOKEN_TTL_DAYS", "90"))


def _pw_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def _check_pw(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def _make_token() -> str:
    return secrets.token_urlsafe(32)


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


def seed_default_users(admin_password: str = "") -> None:
    """Called at startup — always refreshes demo and admin credentials."""
    conn = _get_conn()
    demo_password = os.getenv("DEMO_PASSWORD", "demo")
    dph = _pw_hash(demo_password)
    # Use INSERT OR REPLACE to always update demo/admin hashes on restart
    conn.execute(
        "INSERT OR REPLACE INTO users (username, password_hash, token, is_demo, token_expires) VALUES (?,?,?,1,?)",
        ("demo", dph, _make_token(), _token_expiry()),
    )
    if admin_password:
        aph = _pw_hash(admin_password)
        # Only replace if password changed — keep existing token if hash matches
        existing = conn.execute(
            "SELECT password_hash, token FROM users WHERE username='admin'"
        ).fetchone()
        if existing and _check_pw(admin_password, existing[0]):
            # Password unchanged — refresh expiry but keep token
            conn.execute(
                "UPDATE users SET token_expires=? WHERE username='admin'",
                (_token_expiry(),)
            )
        else:
            conn.execute(
                "INSERT OR REPLACE INTO users (username, password_hash, token, is_demo, token_expires) VALUES (?,?,?,0,?)",
                ("admin", aph, _make_token(), _token_expiry()),
            )
    conn.commit()
    conn.close()
    _token_cache_clear()


def authenticate(username: str, password: str):
    """Returns (token, is_demo) or raises ValueError on bad credentials."""
    import datetime
    conn = _get_conn()
    row = conn.execute(
        "SELECT password_hash, token, is_demo, token_expires FROM users WHERE username=?",
        (username,),
    ).fetchone()
    conn.close()
    if not row or not _check_pw(password, row[0]):
        raise ValueError("Invalid credentials")

    existing_token, is_demo, expires = row[1], row[2], row[3]

    # Reuse the existing token if it's still valid — allows multiple simultaneous sessions
    token_still_valid = False
    if existing_token and expires:
        try:
            token_still_valid = datetime.datetime.fromisoformat(expires) > datetime.datetime.utcnow()
        except ValueError:
            pass

    conn = _get_conn()
    if token_still_valid:
        # Refresh expiry without changing the token so other active sessions stay valid
        conn.execute(
            "UPDATE users SET token_expires=? WHERE username=?",
            (_token_expiry(), username)
        )
        token = existing_token
    else:
        token = _make_token()
        conn.execute(
            "UPDATE users SET token=?, token_expires=? WHERE username=?",
            (token, _token_expiry(), username)
        )
        if existing_token:
            _token_cache.pop(existing_token, None)
    conn.commit()
    conn.close()
    return token, bool(is_demo)


def register(username: str, password: str) -> str:
    """Creates a new user. Returns the token. Raises ValueError if name taken."""
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    if username.lower() in ("demo", "admin"):
        raise ValueError(f"Username '{username}' is reserved")
    conn = _get_conn()
    ph = _pw_hash(password)
    token = _make_token()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, token, is_demo, token_expires) VALUES (?,?,?,0,?)",
            (username, ph, token, _token_expiry()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("Username already taken")
    conn.close()
    return token


def get_user_from_token(token: str):
    """Returns (username, is_demo) or None if token is invalid or expired."""
    import datetime
    cached = _token_cache_get(token)
    if cached:
        return cached
    conn = _get_conn()
    row = conn.execute(
        "SELECT username, is_demo, token_expires FROM users WHERE token=?", (token,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    username, is_demo, expires = row
    if expires:
        try:
            if datetime.datetime.fromisoformat(expires) < datetime.datetime.utcnow():
                return None  # Token expired
        except ValueError:
            pass
    _token_cache_put(token, username, bool(is_demo))
    return username, is_demo


def get_user_db_path(username: str, is_demo: bool) -> str:
    if is_demo:
        path = "/data/demo.db"
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        return path
    os.makedirs(USER_DB_DIR, exist_ok=True)
    return os.path.join(USER_DB_DIR, f"{username}.db")
