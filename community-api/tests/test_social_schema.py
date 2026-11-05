import sqlite3
import unittest
from pathlib import Path
BASE=Path(__file__).resolve().parent.parent/'migrations'
class SocialSchemaTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for p in sorted(BASE.glob('*.sql')):
   self.db.executescript(p.read_text())
  self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('u1','someone_1','First'),('u2','someone_2','Second')")
  self.db.execute("INSERT INTO animations(id,owner_id,title,status) VALUES(?,'u1','Nice original','draft')",('a'*32,))
  self.db.execute("INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) VALUES(?,?,1,'approved','original.zip',?,1024,900,2000,30)",('b'*32,'a'*32,'e'*64))
  self.db.execute("UPDATE animations SET status='published',published_version_id=?,published_at=unixepoch() WHERE id=?",('b'*32,'a'*32))
  self.db.execute("INSERT INTO animation_rights(animation_id,license,author_credit,allows_remix) VALUES(?,'CC-BY-4.0','Original',1)",('a'*32,))
 def tearDown(self):self.db.close()
 def test_migration_idempotent(self):
  self.db.executescript((BASE/'0011_social.sql').read_text())
  self.assertEqual(self.db.execute("SELECT count(*) FROM sqlite_master WHERE name='community_comments'").fetchone()[0],1)
 def test_likes_maintain_counter(self):
  self.db.execute('INSERT INTO animation_likes(animation_id,user_id) VALUES(?,?)',('a'*32,'u2'))
  self.assertEqual(self.db.execute('SELECT like_count FROM animations').fetchone()[0],1)
  self.db.execute('DELETE FROM animation_likes WHERE user_id=?',('u2',))
  self.assertEqual(self.db.execute('SELECT like_count FROM animations').fetchone()[0],0)
 def test_self_follow_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO creator_follows(follower_id,creator_id) VALUES('u1','u1')")
 def test_comments_require_plain_content_and_rate_limit(self):
  self.db.execute('INSERT INTO community_comments(id,animation_id,author_id,content) VALUES(?,?,?,?)',('c'*32,'a'*32,'u2','Hello ✨'))
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute('INSERT INTO community_comments(id,animation_id,author_id,content) VALUES(?,?,?,?)',('d'*32,'a'*32,'u2','too fast'))
  self.assertEqual(self.db.execute('SELECT content FROM community_comments').fetchone()[0],'Hello ✨')
 def test_comment_reports_unique_and_still_moderatable(self):
  self.db.execute('INSERT INTO community_comments(id,animation_id,author_id,content) VALUES(?,?,?,?)',('c'*32,'a'*32,'u2','Hello'))
  self.db.execute('INSERT INTO comment_reports(id,comment_id,reporter_id,reason) VALUES(?,?,?,?)',('r'*32,'c'*32,'u1','Needs review'))
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute('INSERT INTO comment_reports(id,comment_id,reporter_id,reason) VALUES(?,?,?,?)',('s'*32,'c'*32,'u1','Duplicate'))
  self.db.execute("UPDATE community_comments SET status='hidden' WHERE id=?",('c'*32,))
  self.assertEqual(self.db.execute('SELECT status FROM community_comments').fetchone()[0],'hidden')
 def test_remix_provenance_guard(self):
  self.db.execute("INSERT INTO animations(id,owner_id,title,status) VALUES(?,'u2','Remix','draft')",('f'*32,))
  self.db.execute('INSERT INTO animation_remixes(animation_id,source_animation_id,source_version_id,source_license) VALUES(?,?,?,?)',('f'*32,'a'*32,'b'*32,'CC-BY-4.0'))
  self.assertEqual(self.db.execute('SELECT source_animation_id FROM animation_remixes').fetchone()[0],'a'*32)
  self.db.execute("UPDATE animation_rights SET license='all-rights-reserved',allows_remix=0 WHERE animation_id=?",('a'*32,))
  self.db.execute("INSERT INTO animations(id,owner_id,title,status) VALUES(?,'u2','Next remix','draft')",('e'*32,))
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute('INSERT INTO animation_remixes(animation_id,source_animation_id,source_version_id,source_license) VALUES(?,?,?,?)',('e'*32,'a'*32,'b'*32,'CC-BY-4.0'))
if __name__=='__main__':unittest.main()
