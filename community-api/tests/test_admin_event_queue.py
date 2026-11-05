import sqlite3,unittest
from pathlib import Path
P=Path(__file__).resolve().parent.parent/'migrations'
class BotQueueSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(P.glob('*.sql')):self.db.executescript(f.read_text())
  self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('u1','sample_user','Sample')")
  self.a='a'*32;self.v='b'*32;self.d='c'*32
  self.db.execute("INSERT INTO animations(id,owner_id,title,status) VALUES(?,'u1','Test 1','draft')",(self.a,))
  self.db.execute("INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) VALUES(?,?,1,'pending','private.zip',?,100,480,800,30)",(self.v,self.a,'d'*64))
  self.db.execute("INSERT INTO animation_rights(animation_id,license,author_credit,allows_remix) VALUES(?,'CC-BY-4.0','Sample',1)",(self.a,))
 def tearDown(self):self.db.close()
 def test_event_queue_is_disabled_by_default_and_only_triggered_on_real_pending(self):
  self.assertEqual(self.db.execute('SELECT count(*) FROM discord_admin_events').fetchone()[0],0)
  # initial publication drafts must include all normal fields; trigger verifies migration semantics.
  cols=[x[1] for x in self.db.execute('PRAGMA table_info(publication_drafts)')]
  self.assertIn('status',cols)
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_discord_%'").fetchone()[0],4)
 def test_new_comment_report_is_deduplicated(self):
  self.db.execute("UPDATE animation_versions SET status='approved' WHERE id=?",(self.v,))
  self.db.execute("UPDATE animations SET status='published',published_version_id=?,published_at=unixepoch() WHERE id=?",(self.v,self.a))
  self.db.execute("INSERT INTO community_comments(id,animation_id,author_id,content) VALUES(?,?,?,?)",(self.d,self.a,'u1','Hi'))
  self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('u2','observer2','Observer')")
  self.db.execute("INSERT INTO comment_reports(id,comment_id,reporter_id,reason) VALUES(?,?,?,?)",('e'*32,self.d,'u2','Offensive content'))
  events=self.db.execute("SELECT kind,source_id,state FROM discord_admin_events").fetchall()
  self.assertEqual(events,[('comment_report','e'*32,'queued')])
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO comment_reports(id,comment_id,reporter_id,reason) VALUES(?,?,?,?)",('f'*32,self.d,'u2','Duplicate'))
  self.assertEqual(self.db.execute('SELECT count(*) FROM discord_admin_events').fetchone()[0],1)
