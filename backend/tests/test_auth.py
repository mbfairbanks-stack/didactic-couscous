import os
import sqlite3

import pytest


@pytest.fixture
def auth(tmp_path, monkeypatch, client):
    """user_auth pointed at a throwaway auth.db (app runs single-user in tests)."""
    import user_auth
    monkeypatch.setattr(user_auth, "AUTH_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setattr(user_auth, "USER_DB_DIR", str(tmp_path / "users"))
    monkeypatch.setattr(user_auth, "_schema_ready", False)
    user_auth._token_cache_clear()
    yield user_auth
    user_auth._token_cache_clear()


def test_register_and_token_roundtrip(auth):
    token = auth.register("alice", "secret123")
    assert auth.get_user_from_token(token) == ("alice", 0)


def test_tokens_stored_hashed_at_rest(auth):
    token = auth.register("bob", "secret123")
    conn = sqlite3.connect(auth.AUTH_DB_PATH)
    stored = [r[0] for r in conn.execute("SELECT token_hash FROM sessions").fetchall()]
    stored += [r[0] for r in conn.execute("SELECT token FROM users").fetchall()]
    conn.close()
    assert stored, "expected stored credentials"
    assert token not in stored
    assert auth._hash_token(token) in stored


def test_multiple_sessions_stay_valid(auth):
    auth.register("carol", "secret123")
    t1, _ = auth.authenticate("carol", "secret123")
    t2, _ = auth.authenticate("carol", "secret123")
    assert t1 != t2
    assert auth.get_user_from_token(t1) == ("carol", 0)
    assert auth.get_user_from_token(t2) == ("carol", 0)


def test_bad_password_rejected(auth):
    auth.register("dave", "secret123")
    with pytest.raises(ValueError):
        auth.authenticate("dave", "wrong")
    assert auth.get_user_from_token("not-a-real-token") is None


@pytest.mark.parametrize("bad", ["ab", "a" * 33, "../evil", "sp ace", "semi;colon", "slash/name"])
def test_invalid_usernames_rejected(auth, bad):
    with pytest.raises(ValueError):
        auth.register(bad, "secret123")


@pytest.mark.parametrize("reserved", ["demo", "admin", "Demo", "ADMIN"])
def test_reserved_usernames_rejected(auth, reserved):
    with pytest.raises(ValueError):
        auth.register(reserved, "secret123")


def test_legacy_plaintext_token_migrates_to_hashed_session(auth):
    # Simulate a pre-hashing user row carrying a plaintext token
    auth._get_conn().close()  # ensure schema
    plaintext = "legacy-plaintext-token-value"
    conn = sqlite3.connect(auth.AUTH_DB_PATH)
    conn.execute(
        "INSERT INTO users (username, password_hash, token, is_demo, token_expires) VALUES (?,?,?,0,?)",
        ("legacyuser", auth._pw_hash("pw123456"), plaintext, auth._token_expiry()),
    )
    conn.commit()
    conn.close()

    assert auth.get_user_from_token(plaintext) == ("legacyuser", 0)

    # Plaintext must be gone from disk; the session row carries the hash
    conn = sqlite3.connect(auth.AUTH_DB_PATH)
    stored = [r[0] for r in conn.execute("SELECT token FROM users").fetchall()]
    stored += [r[0] for r in conn.execute("SELECT token_hash FROM sessions").fetchall()]
    conn.close()
    assert plaintext not in stored
    assert auth._hash_token(plaintext) in stored

    # Still valid on subsequent (cache-cleared) lookups via the sessions table
    auth._token_cache_clear()
    assert auth.get_user_from_token(plaintext) == ("legacyuser", 0)


def test_user_db_path_confined_to_user_dir(auth):
    path = auth.get_user_db_path("weird/../../name", is_demo=False)
    assert os.path.dirname(path) == auth.USER_DB_DIR
