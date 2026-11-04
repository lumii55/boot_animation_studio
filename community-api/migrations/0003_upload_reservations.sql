-- BAS P15.5: D1-resident, atomic upload reservation guardrails.
-- Only schema/triggers: THERE IS NO UPLOAD ENDPOINT.
-- No bytes may be sent to R2 during this milestone.
PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS trg_reservation_only_new
BEFORE INSERT ON upload_reservations
WHEN NEW.status!='reserved'
 OR NEW.expires_at<=unixepoch()
 OR NEW.expires_at>unixepoch()+3600
BEGIN SELECT RAISE(ABORT,'invalid reservation'); END;

-- Rejections run inside the same INSERT transaction and cannot race separate
-- read-then-write checks in a multi-instance server.
CREATE TRIGGER IF NOT EXISTS trg_reservation_limit_user
BEFORE INSERT ON upload_reservations
WHEN
  (SELECT COUNT(*) FROM upload_reservations
   WHERE user_id=NEW.user_id AND status='reserved' AND expires_at>unixepoch())>=3
 OR
  (SELECT COALESCE(SUM(reserved_bytes),0) FROM upload_reservations
   WHERE user_id=NEW.user_id AND status='reserved' AND expires_at>unixepoch())+NEW.reserved_bytes>62914560
 OR
  (SELECT COUNT(*) FROM upload_reservations
   WHERE user_id=NEW.user_id AND created_at>=unixepoch()-86400)>=8
 OR
  (SELECT COALESCE(SUM(reserved_bytes),0) FROM upload_reservations
   WHERE user_id=NEW.user_id AND created_at>=unixepoch()-86400)+NEW.reserved_bytes>104857600
BEGIN SELECT RAISE(ABORT,'per-user quota exceeded'); END;

-- Ensures that acquiring a reservation also reserves budget atomically.
CREATE TRIGGER IF NOT EXISTS trg_reservation_charge
BEFORE INSERT ON upload_reservations
WHEN NEW.status='reserved'
BEGIN
  UPDATE storage_budget
  SET reserved_bytes=reserved_bytes+NEW.reserved_bytes,updated_at=unixepoch()
  WHERE id=1
    AND used_bytes+reserved_bytes+NEW.reserved_bytes<=cap_bytes;
  SELECT CASE WHEN changes()!=1
    THEN RAISE(ABORT,'global storage budget exceeded') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_reservation_transition
BEFORE UPDATE ON upload_reservations
WHEN OLD.status!='reserved'
 OR NEW.status NOT IN ('committed','cancelled','expired')
 OR NEW.id!=OLD.id
 OR NEW.user_id!=OLD.user_id
 OR NEW.idempotency_hash!=OLD.idempotency_hash
 OR NEW.reserved_bytes!=OLD.reserved_bytes
 OR NEW.created_at!=OLD.created_at
 OR NEW.expires_at!=OLD.expires_at
BEGIN SELECT RAISE(ABORT,'invalid reservation transition'); END;

CREATE TRIGGER IF NOT EXISTS trg_reservation_release
AFTER UPDATE OF status ON upload_reservations
WHEN OLD.status='reserved'
BEGIN
  UPDATE storage_budget
  SET reserved_bytes=reserved_bytes-OLD.reserved_bytes,
    used_bytes=used_bytes+(CASE WHEN NEW.status='committed' THEN OLD.reserved_bytes ELSE 0 END),
    updated_at=unixepoch()
  WHERE id=1;
END;

-- Keep an audit/accounting record. Purging storage requires a separate,
-- audited media-delete workflow that decrements used_bytes only after R2 deletion.
CREATE TRIGGER IF NOT EXISTS trg_reservation_keep_history
BEFORE DELETE ON upload_reservations
BEGIN SELECT RAISE(ABORT,'reservation history cannot be deleted'); END;
