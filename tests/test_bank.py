import importlib.util
from pathlib import Path
import unittest
from test_server import ServerTests

class BankTests(ServerTests):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        source = Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location('bank_test_database', source / 'database.py')
        cls.db = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.db)
        # Isolated SQLite path supplied by the existing fixture; never export into the repository.
        cls.db.export_to_rubricas_js = lambda *args, **kwargs: None
        cls.db.init_db()
        cls.module.database = cls.db

    def test_bank_admin_edit_and_restart(self):
        with self.client.session_transaction() as sess:
            sess.clear()
        path = '/admin/bank/teamwork/2/1/edit'
        self.assertEqual(self.client.get(path).status_code, 302)
        with self.client.session_transaction() as sess:
            sess['logged_in'] = True
        listing = self.client.get('/admin/recommendations').get_data(as_text=True)
        self.assertEqual(listing.count('/admin/bank/'), 192)
        self.assertIn('Nivel 2', listing)
        self.assertEqual(self.client.get(path).status_code, 200)
        with self.client.session_transaction() as sess:
            token = sess['bank_csrf']
        text = 'Acuerda una revisión semanal con tu equipo y comprueba los compromisos.'
        self.assertEqual(self.client.post(path, data={'advice': text}).status_code, 400)
        self.assertEqual(self.client.post(path, data={'advice': text, 'csrf_token': token}).status_code, 302)
        self.db.init_db()
        self.assertEqual(self.db.get_advice_bank()['teamwork'][1][0], text)
        js = self.client.get('/rubricas.js')
        self.assertIn(text, js.get_data(as_text=True))
        self.assertEqual(js.headers['Cache-Control'], 'no-store')
        self.client.post(path, data={'advice':'', 'csrf_token': token})
        self.assertEqual(self.db.get_advice_bank()['teamwork'][1][0], text)
        self.assertEqual(self.client.get('/admin/bank/teamwork/9/1/edit').status_code, 404)
        with self.client.session_transaction() as sess:
            sess.clear()

    def test_custom_migration_and_new_suggestion(self):
        advice = 'Revisa con el equipo los acuerdos y documenta una mejora concreta.'
        with self.db.get_db() as conn:
            conn.execute("INSERT INTO recommendations (pattern,label,advice) VALUES ('equipo','Equipo',?)", (advice,))
            conn.execute("INSERT INTO recommendations (pattern,label,advice) VALUES ('[','Sin clasificar',?)", (advice,))
        self.db.init_db()
        self.db.init_db()
        for variants in self.db.get_advice_bank()['teamwork']:
            self.assertEqual(variants.count(advice), 1)
        pending = self.db.pending_advice_migration()
        self.assertEqual(len(pending), 1)
        with self.client.session_transaction() as sess:
            sess['logged_in'] = True
        page = self.client.get('/admin/recommendations')
        self.assertEqual(page.status_code, 200)
        self.assertNotIn('sustituciones', page.get_data(as_text=True))
        self.assertEqual(self.client.get('/admin/recommendations/new').status_code, 200)
        with self.client.session_transaction() as sess:
            token = sess['bank_csrf']
        data = {'family':'digital', 'level':'3', 'advice':advice, 'legacy_id':str(pending[0]['id'])}
        self.assertEqual(self.client.post('/admin/recommendations/new', data=data).status_code, 400)
        data['csrf_token'] = token
        self.assertEqual(self.client.post('/admin/recommendations/new', data=data).status_code, 302)
        self.assertIn(advice, self.db.get_advice_bank()['digital'][2])
        self.assertEqual(self.db.pending_advice_migration(), [])
        data.pop('legacy_id')
        data['level']='9'
        self.assertEqual(self.client.post('/admin/recommendations/new', data=data).status_code, 200)
        with self.client.session_transaction() as sess:
            sess.clear()

if __name__ == '__main__':
    unittest.main()
