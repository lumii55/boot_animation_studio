"""P15.6 creator media D1/SQLite ledger, privacy and quota invariants."""
import unittest,sqlite3,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'migrations'
MIGRATIONS=['0001_initial.sql','0002_auth.sql','0003_upload_reservations.sql','0004_publishing.sql','0005_creator_media.sql']
class CreatorMediaSQLTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for m in MIGRATIONS:self.db.executescript((ROOT/m).read_text())
        self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('creator','creator_test','Creator')")
        self.idx=0
    def tearDown(self):self.db.close()
    def create(self,kind='avatar',status='processing'):
        self.idx+=1
        i=f'{self.idx:032x}'
        self.db.execute(
            "INSERT INTO creator_media(id,owner_id,kind,object_key,status) VALUES(?,?,?,?,?)",
            (i,'creator',kind,f'creator-private/creator/{kind}/{i}.webp',status)
        )
        return i
    def budget(self):
        return self.db.execute('SELECT used_bytes,reserved_bytes FROM storage_budget').fetchone()
    def activate(self,id,size=3200):
        self.db.execute("UPDATE creator_media SET size_bytes=?,status='active' WHERE id=?",(size,id))
        return id
    def test_media_reserves_at_insert_and_commits_actual_size(self):
        a=self.create()
        self.assertEqual(self.budget(),(0,524288))
        self.activate(a)
        self.assertEqual(self.budget(),(3200,0))
    def test_failed_processing_releases_bytes(self):
        a=self.create()
        self.db.execute("UPDATE creator_media SET status='failed' WHERE id=?",(a,))
        self.assertEqual(self.budget(),(0,0))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE creator_media SET status='active' WHERE id=?",(a,))
    def test_two_simultaneous_avatar_reservations_are_blocked(self):
        self.create()
        with self.assertRaises(sqlite3.IntegrityError):self.create()
        self.create('banner')
        self.assertEqual(self.budget()[1],1048576)
    def test_profile_image_pointer_rejects_cross_user_or_inactive_media(self):
        a=self.create()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO creator_media_current(user_id,kind,media_id) VALUES(?,?,?)",('creator','avatar',a))
        self.activate(a)
        self.db.execute("INSERT INTO creator_media_current(user_id,kind,media_id) VALUES(?,?,?)",('creator','avatar',a))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE creator_media_current SET kind='banner' WHERE user_id='creator'")
    def test_replacing_media_only_releases_used_bytes_after_confirmed_deletion(self):
        a=self.activate(self.create())
        self.db.execute("INSERT INTO creator_media_current(user_id,kind,media_id) VALUES(?,?,?)",('creator','avatar',a))
        b=self.activate(self.create())
        self.db.execute("UPDATE creator_media_current SET media_id=? WHERE user_id='creator' AND kind='avatar'",(b,))
        self.db.execute("UPDATE creator_media SET status='delete_pending' WHERE id=?",(a,))
        self.assertEqual(self.budget(),(6400,0))
        self.db.execute("UPDATE creator_media SET status='deleted' WHERE id=?",(a,))
        self.assertEqual(self.budget(),(3200,0))
    def test_malformed_transitions_and_oversized_media_blocked(self):
        a=self.create()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE creator_media SET size_bytes=524289,status='active' WHERE id=?",(a,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE creator_media SET status='deleted' WHERE id=?",(a,))
        self.activate(a)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE creator_media SET object_key='forged' WHERE id=?",(a,))
    def test_global_budget_prevents_reservation_beyond_cap(self):
        cap=self.db.execute('SELECT cap_bytes FROM storage_budget').fetchone()[0]
        self.db.execute('UPDATE storage_budget SET used_bytes=? WHERE id=1',(cap-524288+1,))
        with self.assertRaises(sqlite3.IntegrityError):self.create()
        self.assertEqual(self.budget(),(cap-524288+1,0))
    def test_daily_rate_and_transform_budget_checks(self):
        for i in range(8):
            a=self.create()
            self.db.execute("UPDATE creator_media SET status='failed' WHERE id=?",(a,))
        with self.assertRaises(sqlite3.IntegrityError):self.create()
        self.db.execute("INSERT INTO media_transform_budget(month,count) VALUES('2026-11',200)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE media_transform_budget SET count=count+1")
    def test_schema_idempotent_no_double_reservation(self):
        self.db.executescript((ROOT/'0005_creator_media.sql').read_text())
        self.create()
        self.assertEqual(self.budget(),(0,524288))
if __name__=="__main__":unittest.main()
