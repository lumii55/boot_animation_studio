import sqlite3
import time
import unittest
from pathlib import Path

MIGRATIONS=Path(__file__).resolve().parents[1]/'migrations'
LIMIT=40*1024*1024
NINE_GB=9_000_000_000

class StorageUpgradeTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted(MIGRATIONS.glob('*.sql')):
            if migration.name.startswith('0014_'):
                break
            self.db.executescript(migration.read_text())
        self.db.execute('UPDATE storage_budget SET cap_bytes=134217728,used_bytes=1234')
        self.user='u'*32
        self.animation='a'*32
        self.version='v'*32
        self.reservation='r'*32
        self.db.execute('INSERT INTO community_users(id,handle,display_name) VALUES(?,?,?)',
                        (self.user,'test_owner','Test'))
        self.db.execute('INSERT INTO animations(id,owner_id,title) VALUES(?,?,?)',
                        (self.animation,self.user,'Test zip'))
        self.db.execute(
            "INSERT INTO animation_versions(id,animation_id,revision,status,object_key,sha256,size_bytes,width,height,fps) "
            "VALUES(?,?,1,'pending',?, ?, 12345,1080,2400,30)",
            (self.version,self.animation,'quarantine/test.zip','e'*64))
        self.db.execute(
            "INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) "
            "VALUES(?,?,320,'reserved',?,?)",
            (self.reservation,self.user,'f'*64,int(time.time())+1800))
        self.db.commit()
        self.before_names={
            k:{x[0] for x in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type=? AND name NOT LIKE 'sqlite_%'",(k,))}
            for k in ['table','trigger','index']
        }
        self.before_records={
            'animation_versions':self.db.execute('SELECT COUNT(*) FROM animation_versions').fetchone()[0],
            'upload_reservations':self.db.execute('SELECT COUNT(*) FROM upload_reservations').fetchone()[0]
        }
        self.db.executescript(
            'BEGIN IMMEDIATE;\n'+(MIGRATIONS/'0014_storage_9gb_zip40mib.sql').read_text()+'\nCOMMIT;')

    def tearDown(self): self.db.close()

    def test_existing_data_and_indexes_and_triggers_survive(self):
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        for kind,names in self.before_names.items():
            after={r[0] for r in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type=? AND name NOT LIKE 'sqlite_%'",(kind,))}
            self.assertEqual(names,after)
        self.assertEqual(self.db.execute('SELECT size_bytes FROM animation_versions WHERE id=?',(self.version,)).fetchone()[0],12345)
        self.assertEqual(self.db.execute('SELECT reserved_bytes FROM upload_reservations WHERE id=?',(self.reservation,)).fetchone()[0],320)
        self.assertEqual(self.db.execute('SELECT used_bytes,reserved_bytes,cap_bytes FROM storage_budget').fetchone(),
                         (1234,320,NINE_GB))

    def test_new_40_mib_limit_accepts_30_mib_and_denies_over_40_mib(self):
        t=int(time.time())+1000
        self.db.execute('INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) '
                        "VALUES(?,?,?,'reserved',?,?)",('2'*32,self.user,30*1024*1024,'3'*64,t))
        self.assertEqual(self.db.execute('SELECT reserved_bytes FROM storage_budget').fetchone()[0],
                         320+30*1024*1024)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO upload_reservations(id,user_id,reserved_bytes,status,idempotency_hash,expires_at) '
                            "VALUES(?,?,?,'reserved',?,?)",('4'*32,self.user,LIMIT+1,'5'*64,t))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('UPDATE storage_budget SET cap_bytes=?',(NINE_GB+1,))

if __name__=='__main__':
 unittest.main()
