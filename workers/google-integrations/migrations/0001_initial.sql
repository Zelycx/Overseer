PRAGMA foreign_keys = ON;
CREATE TABLE oauth_attempts (
  state_hash TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('calendar','classroom')),
  platform TEXT NOT NULL CHECK (platform IN ('web','android')),
  redirect_uri TEXT NOT NULL,
  return_url TEXT,
  code_verifier TEXT,
  code_challenge TEXT,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX oauth_attempts_expiry ON oauth_attempts(expires_at);
CREATE TABLE google_credentials (
  firebase_uid TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('calendar','classroom')),
  oauth_platform TEXT NOT NULL CHECK (oauth_platform IN ('web','android')),
  google_subject TEXT NOT NULL,
  account_email TEXT,
  granted_scopes TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_version TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 1,
  connected_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (firebase_uid, provider)
);
