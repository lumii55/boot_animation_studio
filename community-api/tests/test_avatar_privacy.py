import sqlite3, unittest
from pathlib import Path
P=Path(__file__).resolve().parent.parent/'migrations'
class AvatarPrivacy(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(P.glob('*.sql')):self.db.executescript(f.read_text())
 def tearDown(self):self.db.close()
 def test_existing_and_new_profiles_are_private_by_default(self):
  self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('u1','sample_1','Sample')")
  self.assertEqual(self.db.execute("SELECT avatar_public FROM community_users WHERE id='u1'").fetchone()[0],0)
  self.db.execute("UPDATE community_users SET avatar_public=1 WHERE id='u1'")
  self.assertEqual(self.db.execute("SELECT avatar_public FROM community_users WHERE id='u1'").fetchone()[0],1)
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE community_users SET avatar_public=7 WHERE id='u1'")
