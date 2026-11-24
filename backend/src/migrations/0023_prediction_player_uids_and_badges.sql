-- Permanent system person UID and badge-based account credentials.
ALTER TABLE prediction_catalog_players
  ADD COLUMN IF NOT EXISTS person_uid TEXT GENERATED ALWAYS AS (
    'WXQP-' || upper(substr(id, 1, 10))
  ) STORED;

CREATE INDEX IF NOT EXISTS prediction_catalog_players_person_uid
  ON prediction_catalog_players (person_uid);

ALTER TABLE prediction_catalog_account_uids
  ADD COLUMN IF NOT EXISTS credential_type TEXT NOT NULL DEFAULT 'GAME_UID',
  ALTER COLUMN evidence_id DROP NOT NULL;
