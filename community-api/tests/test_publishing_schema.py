"""P15.6 — SQL invariants for private publication drafts and R2 operation cap."""
import pathlib
import sqlite3
import time
import unittest

HERE = pathlib.Path(__file__).resolve().parents[1] / "migrations"

class PublishingSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for i in range(1,5):
            name=["0001_initial.sql","0002_auth.sql","0003_upload_reservations.sql","0004_publishing.sql"][i-1]
            self.db.executescript((HERE/name).read_text())
        self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('me','demo_user','Demo')")
        self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('other','other_user','Other')")
        self.db.execute("INSERT INTO animations(id,owner_id,title,status) VALUES('animation1','me','Example','draft')")
        self.expires=int(time.time())+800
        self.db.execute(
            "INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) "
            "VALUES('reserve1','me',1234,'reserved',?,?)",("a"*64,self.expires))
    def tearDown(self):self.db.close()
    def add_draft(self,owner="me",animation="animation1",reservation="reserve1"):
        self.db.execute(
            "INSERT INTO publication_drafts(id,owner_id,animation_id,reservation_id,source,filename,"
            "expected_bytes,request_hash,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ("f"*32,owner,animation,reservation,"editor","bootanimation.zip",1234,"b"*64,self.expires))
    def test_tables_exist_with_migration_idempotence(self):
        names={x[0] for x in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"animation_rights","publication_drafts","r2_operation_budget"}<=names)
        self.db.executescript((HERE/"0004_publishing.sql").read_text())
    def test_owner_cannot_borrow_another_users_animation(self):
        with self.assertRaises(sqlite3.IntegrityError):self.add_draft(owner="other")
        with self.assertRaises(sqlite3.IntegrityError):self.add_draft(reservation="nonexistent")
    def test_owner_and_reservation_must_match(self):
        self.add_draft()
        self.assertEqual(self.db.execute("SELECT status FROM publication_drafts").fetchone()[0],"awaiting_upload")
        self.assertEqual(self.db.execute("SELECT reserved_bytes FROM storage_budget").fetchone()[0],1234)
    def test_invalid_status_jump_is_refused(self):
        self.add_draft()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE publication_drafts SET status='pending_review'")
        self.db.execute("UPDATE publication_drafts SET status='processing'")
        self.db.execute("UPDATE publication_drafts SET status='pending_review'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE publication_drafts SET status='awaiting_upload'")
    def test_owner_and_file_size_immutable(self):
        self.add_draft()
        for sql in ("UPDATE publication_drafts SET owner_id='other'",
                    "UPDATE publication_drafts SET expected_bytes=5",
                    "UPDATE publication_drafts SET filename='unexpected.zip'"):
            with self.assertRaises(sqlite3.IntegrityError):self.db.execute(sql)
    def test_rights_require_known_license_and_boolean_remix(self):
        for license in ("private","Unknown","CC-BY-5.0"):
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("INSERT INTO animation_rights(animation_id,license,allows_remix) VALUES('animation1',?,1)",(license,))
        self.db.execute("INSERT INTO animation_rights(animation_id,license,allows_remix) VALUES('animation1','CC-BY-4.0',1)")
    def test_application_r2_class_a_budget_is_capped(self):
        self.db.execute("INSERT INTO r2_operation_budget(month,class_a) VALUES('2026-11',10000)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE r2_operation_budget SET class_a=class_a+1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO r2_operation_budget(month,class_b) VALUES('2026-12',10001)")
if __name__=="__main__":
    unittest.main()
