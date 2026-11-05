"""Safety constraints for P15.7 moderated author edits; additive migration."""
import pathlib,sqlite3,time,unittest
M=pathlib.Path(__file__).resolve().parents[1]/'migrations'
class OwnerRevisionSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for path in sorted(M.glob('*.sql')):self.db.executescript(path.read_text())
  self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('owner','owner_55','Owner')")
  self.db.execute("INSERT INTO community_users(id,handle,display_name) VALUES('outsider','outside','Outsider')")
  self.db.execute("INSERT INTO animations(id,owner_id,title,summary,status) VALUES('art','owner','My art','','draft')")
  self.db.execute("INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) VALUES('v1','art',1,'approved','quarantine/old.zip',?,1234,720,1600,30)",('a'*64,))
  self.db.execute("UPDATE animations SET status='published',published_version_id='v1',published_at=unixepoch() WHERE id='art'")
  self.db.execute("INSERT INTO animation_rights(animation_id,license,allows_remix) VALUES('art','CC-BY-4.0',1)")
  self.meta=dict(animation_id='art',owner_id='owner',base_version_id='v1',title='New title',summary='Updated',category='abstract',license='CC-BY-4.0',author_credit='Me',allows_remix=1,tags_json='["art"]',idempotency_hash='a'*64,request_hash='b'*64)
 def tearDown(self):self.db.close()
 def add(self,id='e'*32,who='owner',status='pending_review',revision=None,kwargs=None):
  kw={**self.meta,'owner_id':who,**(kwargs or {})}
  self.db.execute('INSERT INTO owner_revisions(id,animation_id,owner_id,base_version_id,status,title,summary,category,license,author_credit,allows_remix,tags_json,idempotency_hash,request_hash,version_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   (id,kw['animation_id'],kw['owner_id'],kw['base_version_id'],status,kw['title'],kw['summary'],kw['category'],kw['license'],kw['author_credit'],kw['allows_remix'],kw['tags_json'],kw['idempotency_hash'],kw['request_hash'],revision))
 def test_owner_only_and_approved_base(self):
  with self.assertRaises(sqlite3.IntegrityError):self.add(who='outsider')
  with self.assertRaises(sqlite3.IntegrityError):self.add(kwargs={'base_version_id':'other'})
  self.add()
 def test_one_active_revision_and_auditable_history(self):
  self.add()
  with self.assertRaises(sqlite3.IntegrityError):self.add(id='f'*32,kwargs={'idempotency_hash':'c'*64})
  self.db.execute("UPDATE owner_revisions SET status='rejected' WHERE id=?",('e'*32,))
  self.add(id='f'*32,kwargs={'idempotency_hash':'c'*64})
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM owner_revisions').fetchone()[0],2)
 def test_cannot_edit_immutable_fields_or_fake_approval(self):
  self.add()
  for sql in ("UPDATE owner_revisions SET owner_id='outsider'", "UPDATE owner_revisions SET title='Forged'", "UPDATE owner_revisions SET status='processing'"):
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(sql)
 def test_removed_animation_cannot_approve_old_revision(self):
  self.add()
  self.db.execute("UPDATE animations SET status='removed' WHERE id='art'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE owner_revisions SET status='approved'")
 def test_zip_edit_requires_real_reservation(self):
  with self.assertRaises(sqlite3.IntegrityError):self.add(status='awaiting_upload')
  reserve='r1';expires=int(time.time())+800
  self.db.execute("INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) VALUES(?,?,?,'reserved',?,?)",(reserve,'owner',2500,'c'*64,expires))
  self.db.execute('INSERT INTO owner_revisions(id,animation_id,owner_id,base_version_id,status,title,summary,category,license,author_credit,allows_remix,tags_json,expected_bytes,reservation_id,expires_at,idempotency_hash,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   ('e'*32,'art','owner','v1','awaiting_upload','New title','Updated','abstract','CC-BY-4.0','Me',1,'["art"]',2500,reserve,expires,'d'*64,'b'*64))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE owner_revisions SET status='approved'")
  self.db.execute("UPDATE owner_revisions SET status='processing'")
  self.db.execute("UPDATE owner_revisions SET status='pending_review'")
  self.db.execute("UPDATE owner_revisions SET status='rejected'")
 def test_migration_idempotent(self):
  self.db.executescript((M/'0010_owner_revisions.sql').read_text())
  self.add()
if __name__=='__main__': unittest.main()
