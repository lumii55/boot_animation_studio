"""P15.5 upload quota triggers: local SQLite integration tests, no network/storage writes."""
import sqlite3
import unittest
from pathlib import Path
from time import time

ROOT=Path(__file__).resolve().parents[1]
SCHEMA=(ROOT/"migrations"/"0001_initial.sql").read_text()
AUTH=(ROOT/"migrations"/"0002_auth.sql").read_text()
UPLOAD=(ROOT/"migrations"/"0003_upload_reservations.sql").read_text()

class UploadReservationTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA+"\n"+AUTH+"\n"+UPLOAD)
        self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('owner','owner_demo','Creator')")
        self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('other','other_demo','Other')")
        self.counter=0

    def tearDown(self):self.db.close()

    def reserve(self, user="owner",size=1024,expires=None,idem=None):
        self.counter+=1
        self.db.execute(
            "INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) VALUES(?,?,?,?,?,?)",
            (f"res_{self.counter}",user,size,"reserved",idem or (f"{self.counter:064x}"),expires or int(time())+900)
        )
        return f"res_{self.counter}"

    def budget(self):
        return self.db.execute("SELECT used_bytes,reserved_bytes,cap_bytes FROM storage_budget WHERE id=1").fetchone()

    def test_new_reservation_charges_global_budget_once(self):
        key=self.reserve(size=2048)
        self.assertEqual(self.budget()[:2],(0,2048))
        self.db.execute("UPDATE upload_reservations SET status='committed' WHERE id=?",(key,))
        self.assertEqual(self.budget()[:2],(2048,0))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE upload_reservations SET status='cancelled' WHERE id=?",(key,))
        self.assertEqual(self.budget()[:2],(2048,0))

    def test_cancel_or_expire_releases_without_charging_used(self):
        a=self.reserve(size=4096)
        b=self.reserve(size=3072)
        self.db.execute("UPDATE upload_reservations SET status='cancelled' WHERE id=?",(a,))
        self.assertEqual(self.budget()[:2],(0,3072))
        self.db.execute("UPDATE upload_reservations SET status='expired' WHERE id=?",(b,))
        self.assertEqual(self.budget()[:2],(0,0))

    def test_global_budget_refuses_overcommit_atomically(self):
        cap=self.budget()[2]
        self.db.execute("UPDATE storage_budget SET used_bytes=? WHERE id=1",(cap-800,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.reserve(size=1024)
        self.assertEqual(self.budget()[:2],(cap-800,0))
        self.assertEqual(self.db.execute("SELECT count(*) FROM upload_reservations").fetchone()[0],0)

    def test_per_user_concurrency_has_three_reservation_limit(self):
        for _ in range(3):self.reserve(size=512)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reserve(size=512)
        self.reserve(user="other",size=512)
        self.assertEqual(self.budget()[1],4*512)

    def test_daily_limit_cannot_be_reset_by_cancel(self):
        for _ in range(8):
            key=self.reserve(size=500)
            self.db.execute("UPDATE upload_reservations SET status='cancelled' WHERE id=?",(key,))
        with self.assertRaises(sqlite3.IntegrityError):self.reserve(size=500)
        self.assertEqual(self.budget()[:2],(0,0))

    def test_reservation_expiry_and_status_are_checked(self):
        for expiry in [int(time())-1,int(time())+7200]:
            with self.assertRaises(sqlite3.IntegrityError):self.reserve(expires=expiry)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) VALUES(?,?,?,?,?,?)",
                ("bad","owner",500,"committed","a"*64,int(time())+100)
            )

    def test_idempotency_is_unique_without_extra_charge(self):
        self.reserve(idem="b"*64)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reserve(idem="b"*64)
        self.assertEqual(self.budget()[1],1024)

    def test_reservation_cannot_mutate_amount_or_delete_history(self):
        key=self.reserve()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE upload_reservations SET reserved_bytes=1025 WHERE id=?",(key,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE upload_reservations SET id='forged' WHERE id=?",(key,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM upload_reservations WHERE id=?",(key,))
        self.assertEqual(self.budget()[1],1024)

    def test_migration_reapply_does_not_duplicate_triggers(self):
        self.db.executescript(UPLOAD)
        key=self.reserve()
        self.assertEqual(self.budget()[1],1024)
        self.db.execute("UPDATE upload_reservations SET status='committed' WHERE id=?",(key,))
        self.assertEqual(self.budget()[:2],(1024,0))

if __name__=="__main__":
    unittest.main()
