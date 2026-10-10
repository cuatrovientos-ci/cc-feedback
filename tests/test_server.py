import importlib.util
import os
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        source = Path(__file__).resolve().parents[1]
        for name in ['server.py','index.html','editor.html','editor.js','app.js','core.js','model-config.js','rubricas.js','style.css','shell.css','privacidad.html']:
            shutil.copy2(source/name, cls.root/name)
        shutil.copytree(source/'templates', cls.root/'templates')
        shutil.copytree(source/'assets', cls.root/'assets')
        (cls.root/'.env').write_text('GOOGLE_CLIENT_ID=fixture-id\nGOOGLE_CLIENT_SECRET=fixture-secret\nADMIN_USER=fixture@cuatrovientos.org\nSECRET_KEY=fixture-session\nDATABASE_PATH=fixture.db\n', encoding='utf-8-sig')
        cls.env = os.environ.copy()
        for key in ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','ADMIN_USER','ADMIN_USERS','ADMIN_EMAIL','DATABASE_PATH','SECRET_KEY']:
            os.environ.pop(key,None)
        # Never initialize or export the user's database during regression tests.
        stub = types.ModuleType('database')
        stub.init_db = lambda: None
        stub.export_to_rubricas_js = lambda: None
        stub.build_rubricas_js_content = lambda: (source/'rubricas.js').read_text(encoding='utf-8')
        sys.modules['database'] = stub
        spec = importlib.util.spec_from_file_location('cc_test_server',cls.root/'server.py')
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)
        cls.client = cls.module.app.test_client()
    @classmethod
    def tearDownClass(cls):
        os.environ.clear();os.environ.update(cls.env)
        cls.temp.cleanup()
    def test_env_loaded_from_application_with_bom(self):
        self.assertEqual(self.module.GOOGLE_CLIENT_ID,'fixture-id')
        self.assertEqual(self.module.ADMIN_USERS,['fixture@cuatrovientos.org'])
        self.assertEqual(os.environ['DATABASE_PATH'],str(self.root/'fixture.db'))
        html=self.client.get('/admin/login').get_data(as_text=True)
        self.assertNotIn('Configuración requerida de Google Cloud Console',html)
        self.assertNotIn('fixture-secret',html)
        self.assertNotIn('fixture@cuatrovientos.org',html)
    def test_puter_popup_headers(self):
        for path in ['/', '/index.html']:
            self.assertEqual(self.client.get(path).headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups')
        self.assertEqual(self.client.get('/admin/login').headers['Cross-Origin-Opener-Policy'], 'same-origin')

    def test_private_files_never_served(self):
        (self.root/'feedback.db').write_bytes(b'private')
        for path in ['/.env','/.env.example','/feedback.db','/server.py','/database.py','/wsgi.py','/templates/login.html','/assets/../.env','/assets/.secret']:
            with self.subTest(path=path): self.assertEqual(self.client.get(path).status_code,404)
    def test_public_resources_work_for_opaque_editor(self):
        for path in ['/style.css','/assets/bootstrap.min.css','/assets/cuatrovientos.png','/editor.js','/rubricas.js']:
            response=self.client.get(path)
            with self.subTest(path=path):
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.headers['Cross-Origin-Resource-Policy'],'cross-origin')
                self.assertEqual(response.headers['Cross-Origin-Embedder-Policy'],'unsafe-none')
        self.assertNotIn('Cross-Origin-Resource-Policy',self.client.get('/admin/login').headers)

if __name__=='__main__':
    if '--serve' in sys.argv:
        from werkzeug.serving import make_server
        ServerTests.setUpClass()
        server=make_server('127.0.0.1',0,ServerTests.module.app)
        print(server.server_port,flush=True)
        try: server.serve_forever()
        finally: ServerTests.tearDownClass()
    else: unittest.main()
