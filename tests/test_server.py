import unittest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server
import database

class TestServer(unittest.TestCase):
    def setUp(self):
        server.app.config['TESTING'] = True
        server.app.config['WTF_CSRF_ENABLED'] = False
        self.client = server.app.test_client()

    def test_security_headers(self):
        res = self.client.get('/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get('Cross-Origin-Opener-Policy'), 'same-origin')
        self.assertEqual(res.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp')

    def test_rubricas_js_dynamic(self):
        res = self.client.get('/rubricas.js')
        self.assertEqual(res.status_code, 200)
        self.assertIn('LOCAL_RUBRICS', res.text)
        self.assertIn('LOCAL_ADVICE', res.text)
        self.assertIn('LOCAL_SETTINGS', res.text)

    def test_json_apis(self):
        res_r = self.client.get('/api/rubrics')
        self.assertEqual(res_r.status_code, 200)
        rubrics = res_r.get_json()
        self.assertGreaterEqual(len(rubrics), 9)

        res_rec = self.client.get('/api/recommendations')
        self.assertEqual(res_rec.status_code, 200)
        recs = res_rec.get_json()
        self.assertGreaterEqual(len(recs), 6)

        res_s = self.client.get('/api/settings')
        self.assertEqual(res_s.status_code, 200)
        settings = res_s.get_json()
        self.assertIn('intro_text', settings)

    def test_admin_protection(self):
        res = self.client.get('/admin', follow_redirects=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn('/admin/login', res.headers['Location'])

    def test_login_page_renders_google(self):
        res = self.client.get('/admin/login')
        self.assertEqual(res.status_code, 200)
        self.assertIn('cuatrovientos.org', res.text)
        self.assertIn('/admin/login/google', res.text)

    def test_admin_authenticated_session(self):
        with self.client.session_transaction() as sess:
            sess['logged_in'] = True
            sess['username'] = 'ander.frago@cuatrovientos.org'
            sess['name'] = 'Ander Frago'

        res = self.client.get('/admin')
        self.assertEqual(res.status_code, 200)
        self.assertIn('Ander Frago', res.text)
        self.assertIn('Rúbricas Oficiales', res.text)

    def test_crud_rubrics(self):
        with self.client.session_transaction() as sess:
            sess['logged_in'] = True
            sess['username'] = 'ander.frago@cuatrovientos.org'

        # Create
        res = self.client.post('/admin/rubrics/new', data={
            'name': 'Test Competencia Especial',
            'level1': 'Nivel 1 de prueba',
            'level2': 'Nivel 2 de prueba',
            'level3': 'Nivel 3 de prueba',
            'level4': 'Nivel 4 de prueba',
            'display_order': 99
        }, follow_redirects=True)
        self.assertEqual(res.status_code, 200)

        # Check in DB
        rubrics = database.get_all_rubrics()
        found = next((r for r in rubrics if r['name'] == 'Test Competencia Especial'), None)
        self.assertIsNotNone(found)

        # Edit
        res = self.client.post(f'/admin/rubrics/{found["id"]}/edit', data={
            'name': 'Test Competencia Especial Editada',
            'level1': 'N1 Edit',
            'level2': 'N2 Edit',
            'level3': 'N3 Edit',
            'level4': 'N4 Edit',
            'display_order': 99
        }, follow_redirects=True)
        self.assertEqual(res.status_code, 200)

        # Delete
        res = self.client.post(f'/admin/rubrics/{found["id"]}/delete', follow_redirects=True)
        self.assertEqual(res.status_code, 200)
        rubrics_after = database.get_all_rubrics()
        self.assertIsNone(next((r for r in rubrics_after if r['id'] == found['id']), None))

if __name__ == '__main__':
    unittest.main()
