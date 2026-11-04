"""BAS Community P15.3 D1/SQLite schema tests: python -m unittest discover -s tests"""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SQL = (ROOT / "migrations" / "0001_initial.sql").read_text(encoding="utf-8")
HASH = "a" * 64

class CommunitySchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SQL)

    def tearDown(self):
        self.db.close()

    def user(self, user_id="u1", handle="lumii_test"):
        self.db.execute(
            "INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)",
            (user_id, handle, "Test Creator")
        )

    def animation(self, anim_id="anim1", category="cosmos"):
        self.db.execute(
            "INSERT INTO animations(id,owner_id,title,category) VALUES(?,?,?,?)",
            (anim_id, "u1", "Demo Animation", category)
        )

    def version(self, version_id="v1", anim_id="anim1", status="pending", key="pending/test.zip"):
        self.db.execute(
            """INSERT INTO animation_versions(
                id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps
            ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (version_id, anim_id, 1, status, key, HASH, 10000, 1080, 2400, 30)
        )

    def test_schema_creates_all_tables_and_budget(self):
        names = {row[0] for row in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        self.assertTrue({
            "community_users","account_identities","animations","animation_versions",
            "moderation_events","storage_budget","upload_reservations"
        } <= names)
        row = self.db.execute(
            "SELECT used_bytes,reserved_bytes,cap_bytes FROM storage_budget WHERE id=1"
        ).fetchone()
        self.assertEqual(row, (0,0,8 * 1024 ** 3))

    def test_handle_restrictions_and_case_insensitive_uniqueness(self):
        self.user()
        with self.assertRaises(sqlite3.IntegrityError):
            self.user("u2", "Lumii_Test")
        for bad in ("h", "bad%name", "bad name", "abc!x", "ábc"):
            with self.subTest(bad=bad), self.assertRaises(sqlite3.IntegrityError):
                self.user("new-" + str(len(bad)), bad)

    def test_publication_requires_an_approved_owned_revision(self):
        self.user()
        self.animation()
        self.version()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """UPDATE animations SET published_version_id='v1', status='published',
                   published_at=1234 WHERE id='anim1'"""
            )
        self.db.execute("UPDATE animation_versions SET status='approved' WHERE id='v1'")
        self.db.execute(
            """UPDATE animations SET published_version_id='v1', status='published',
               published_at=1234 WHERE id='anim1'"""
        )
        self.assertEqual(self.db.execute(
            "SELECT status FROM animations WHERE id='anim1'"
        ).fetchone()[0], "published")

    def test_approved_revision_cannot_be_deleted_or_hidden_while_live(self):
        self.user(); self.animation()
        self.version(status="approved")
        self.db.execute(
            "UPDATE animations SET status='published',published_version_id='v1',published_at=1234"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM animation_versions WHERE id='v1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE animation_versions SET status='hidden' WHERE id='v1'")
        self.db.execute("UPDATE animations SET status='hidden' WHERE id='anim1'")
        self.db.execute("UPDATE animation_versions SET status='hidden' WHERE id='v1'")

    def test_wrong_version_cannot_be_published_for_other_animation(self):
        self.user(); self.animation()
        self.animation("anim2")
        self.version(status="approved")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """UPDATE animations SET status='published',published_at=1234,
                   published_version_id='v1' WHERE id='anim2'"""
            )

    def test_global_storage_budget_cannot_exceed_eight_gib(self):
        self.assertEqual(self.db.execute("SELECT count(*) FROM storage_budget").fetchone()[0], 1)
        cap = 8 * 1024 ** 3
        self.db.execute("UPDATE storage_budget SET reserved_bytes=? WHERE id=1", (cap-5,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE storage_budget SET used_bytes=10 WHERE id=1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE storage_budget SET cap_bytes=? WHERE id=1", (cap+1,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO storage_budget(id) VALUES(2)")

    def test_version_size_and_account_fk_are_enforced(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO animations(id,owner_id,title) VALUES('bad','missing','Anything')"
            )
        self.user(); self.animation()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO animation_versions(
                id,animation_id,revision,object_key,sha256,size_bytes,width,height,fps
                ) VALUES(?,?,?,?,?,?,?,?,?)""",
                ("huge","anim1",1,"private/huge.zip",HASH,25*1024*1024,1080,2400,30)
            )

    def test_migration_is_safe_to_reapply(self):
        self.db.executescript(SQL)
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM storage_budget").fetchone()[0],1
        )

if __name__ == "__main__":
    unittest.main()
