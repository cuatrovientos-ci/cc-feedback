import os
import json
import secrets
import urllib.parse
from functools import wraps
import requests
from flask import Flask, render_template, request, redirect, url_for, session, flash, send_from_directory, Response, jsonify
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Deterministic under WSGI, regardless of its working directory; tolerate a Windows BOM.
load_dotenv(os.path.join(BASE_DIR, '.env'), encoding='utf-8-sig', override=False)
# Relative database paths belong to the application, not the WSGI working directory.
_db_path = os.environ.get('DATABASE_PATH', '').strip()
if _db_path and not os.path.isabs(_db_path):
    os.environ['DATABASE_PATH'] = os.path.join(BASE_DIR, _db_path)

import database
SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)

# Configuración de Administrador y Google OAuth2
ALLOWED_DOMAIN = os.environ.get('ALLOWED_DOMAIN', 'cuatrovientos.org').strip().lower()

# Leer los correos de administración autorizados desde ADMIN_USER o ADMIN_USERS o ADMIN_EMAIL
raw_admins = os.environ.get('ADMIN_USER') or os.environ.get('ADMIN_USERS') or os.environ.get('ADMIN_EMAIL') or ''
ADMIN_USERS = [e.strip().lower() for e in raw_admins.split(',') if e.strip()]

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()

# Inicializar base de datos SQLite y exportar rubricas.js
database.init_db()
database.export_to_rubricas_js()

app = Flask(__name__, template_folder=os.path.join(BASE_DIR, 'templates'), static_folder=None)
app.secret_key = SECRET_KEY

@app.after_request
def add_security_headers(response):
    # Puter authentication needs its cross-origin popup. The editor keeps its sandbox.
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin-allow-popups' if request.path in {'/', '/index.html'} else 'same-origin'
    response.headers['Cross-Origin-Embedder-Policy'] = 'unsafe-none'
    # The sandboxed editor has an opaque origin. Only public assets may opt in.
    if request.endpoint in {'static_files', 'dynamic_rubricas_js'} and response.status_code < 400:
        response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response

def get_redirect_uri():
    redirect_uri = url_for('admin_google_callback', _external=True)
    # Manejar proxys reversos (HTTPS en PythonAnywhere)
    if request.headers.get('X-Forwarded-Proto') == 'https' and redirect_uri.startswith('http://'):
        redirect_uri = 'https://' + redirect_uri[7:]
    return redirect_uri

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            flash('Por favor, inicia sesión con tu cuenta de Google corporativa.', 'warning')
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

# --- Rutas de la Aplicación Principal ---

@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/rubricas.js')
def dynamic_rubricas_js():
    content = database.build_rubricas_js_content()
    return Response(content, mimetype='application/javascript; charset=utf-8')

@app.route('/<path:filename>')
def static_files(filename):
    public_files = {
        'index.html', 'editor.html', 'privacidad.html', 'app.js', 'editor.js',
        'core.js', 'model-config.js', 'style.css', 'shell.css',
    }
    parts = filename.replace('\\', '/').split('/')
    is_asset = (parts[0] == 'assets' and all(part and not part.startswith('.') for part in parts)
                and os.path.splitext(filename)[1].lower() in {'.css', '.js', '.wasm', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.woff', '.woff2'})
    if filename not in public_files and not is_asset:
        return "Archivo no encontrado", 404
    return send_from_directory(BASE_DIR, filename)

# --- API JSON ---

@app.route('/api/rubrics')
def api_rubrics():
    return jsonify(database.get_all_rubrics())

@app.route('/api/recommendations')
def api_recommendations():
    return jsonify(database.get_all_recommendations())

@app.route('/api/settings')
def api_settings():
    return jsonify(database.get_settings())

# --- Autenticación Google OAuth2 (@cuatrovientos.org) ---

@app.route('/admin/login')
def admin_login():
    if session.get('logged_in'):
        return redirect(url_for('admin_dashboard'))

    redirect_uri = get_redirect_uri()
    google_configured = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

    return render_template('login.html',
                           active_page='login',
                           allowed_domain=ALLOWED_DOMAIN,
                           admin_users=ADMIN_USERS,
                           google_configured=google_configured,
                           redirect_uri=redirect_uri)

@app.route('/admin/login/google')
def admin_google_login():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        flash('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo .env. Consulta las instrucciones en esta página.', 'warning')
        return redirect(url_for('admin_login'))

    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    redirect_uri = get_redirect_uri()

    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'hd': ALLOWED_DOMAIN,
        'prompt': 'select_account'
    }
    auth_url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode(params)
    return redirect(auth_url)

@app.route('/admin/login/google/callback')
def admin_google_callback():
    if 'error' in request.args:
        flash(f"Inicio de sesión cancelado o denegado por Google: {request.args.get('error')}", 'danger')
        return redirect(url_for('admin_login'))

    expected_state = session.pop('oauth_state', None)
    received_state = request.args.get('state')
    if not expected_state or expected_state != received_state:
        flash('Sesión de autenticación inválida o caducada. Por favor, reintenta.', 'danger')
        return redirect(url_for('admin_login'))

    code = request.args.get('code')
    if not code:
        flash('Código de autorización de Google no recibido.', 'danger')
        return redirect(url_for('admin_login'))

    redirect_uri = get_redirect_uri()

    try:
        # Intercambiar código por tokens de acceso
        token_resp = requests.post('https://oauth2.googleapis.com/token', data={
            'code': code,
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        }, timeout=10)

        if not token_resp.ok:
            flash(f'Error al intercambiar token con Google ({token_resp.status_code}). Verifica GOOGLE_CLIENT_SECRET en .env.', 'danger')
            return redirect(url_for('admin_login'))

        tokens = token_resp.json()
        access_token = tokens.get('access_token')

        # Obtener información del usuario autenticado
        user_info_resp = requests.get(
            'https://openidconnect.googleapis.com/v1/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10
        )

        if not user_info_resp.ok:
            flash('No se pudo obtener el perfil de usuario desde Google.', 'danger')
            return redirect(url_for('admin_login'))

        user_info = user_info_resp.json()
        email = user_info.get('email', '').strip().lower()
        email_verified = user_info.get('email_verified', False)

        if not email_verified:
            flash('La dirección de correo electrónico no ha sido verificada por Google.', 'danger')
            return redirect(url_for('admin_login'))

        # 1. Comprobación estricta de dominio corporativo (@cuatrovientos.org)
        domain = email.split('@')[-1] if '@' in email else ''
        if domain != ALLOWED_DOMAIN:
            flash(f'Acceso denegado. Se requiere una cuenta corporativa @{ALLOWED_DOMAIN}. Has intentado acceder con "{email}".', 'danger')
            return redirect(url_for('admin_login'))

        # 2. Comprobación de usuario administrador especificado en .env (ADMIN_USER)
        if ADMIN_USERS and '*' not in ADMIN_USERS and email not in ADMIN_USERS:
            flash(f'Tu cuenta ({email}) pertenece a @{ALLOWED_DOMAIN}, pero no está registrada en ADMIN_USER en el archivo .env.', 'danger')
            return redirect(url_for('admin_login'))

        # Acceso autorizado
        session['logged_in'] = True
        session['username'] = email
        session['name'] = user_info.get('name', email)
        session['picture'] = user_info.get('picture', '')

        flash(f'¡Bienvenido/a al panel de administración, {session["name"]}!', 'success')
        return redirect(url_for('admin_dashboard'))

    except Exception as e:
        flash(f'Error durante la autenticación con Google: {e}', 'danger')
        return redirect(url_for('admin_login'))

@app.route('/admin/logout')
def admin_logout():
    session.clear()
    flash('Sesión cerrada correctamente.', 'info')
    return redirect(url_for('admin_login'))

# --- Panel de Administración ---

@app.route('/admin')
@app.route('/admin/')
@login_required
def admin_dashboard():
    rubrics = database.get_all_rubrics()
    recs = database.get_all_recommendations()
    db_path = os.environ.get('DATABASE_PATH') or database.DEFAULT_DB_PATH
    return render_template('dashboard.html',
                           active_page='dashboard',
                           rubrics_count=len(rubrics),
                           recommendations_count=len(recs),
                           db_path=db_path,
                           admin_user=session.get('username', ''),
                           admin_name=session.get('name', 'Administrador'),
                           admin_picture=session.get('picture', ''))

@app.route('/admin/sync-file', methods=['POST'])
@login_required
def admin_sync_file():
    database.export_to_rubricas_js()
    flash('Archivo estático rubricas.js sincronizado con éxito desde SQLite.', 'success')
    return redirect(url_for('admin_dashboard'))

# --- CRUD Rúbricas ---

@app.route('/admin/rubrics')
@login_required
def admin_rubrics():
    rubrics = database.get_all_rubrics()
    return render_template('rubrics.html', active_page='rubrics', rubrics=rubrics)

@app.route('/admin/rubrics/new', methods=['GET', 'POST'])
@login_required
def admin_rubric_new():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        level1 = request.form.get('level1', '').strip()
        level2 = request.form.get('level2', '').strip()
        level3 = request.form.get('level3', '').strip()
        level4 = request.form.get('level4', '').strip()
        display_order = int(request.form.get('display_order', 0) or 0)

        if not name or not level1 or not level2 or not level3 or not level4:
            flash('Todos los campos son obligatorios.', 'danger')
        else:
            try:
                database.save_rubric({
                    'name': name,
                    'level1': level1,
                    'level2': level2,
                    'level3': level3,
                    'level4': level4,
                    'display_order': display_order
                })
                flash(f'Rúbrica "{name}" creada correctamente y sincronizada.', 'success')
                return redirect(url_for('admin_rubrics'))
            except Exception as e:
                flash(f'Error al guardar la rúbrica: {e}', 'danger')

    return render_template('rubric_form.html', active_page='rubrics', rubric=None)

@app.route('/admin/rubrics/<int:rubric_id>/edit', methods=['GET', 'POST'])
@login_required
def admin_rubric_edit(rubric_id):
    rubric = database.get_rubric_by_id(rubric_id)
    if not rubric:
        flash('Rúbrica no encontrada.', 'warning')
        return redirect(url_for('admin_rubrics'))

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        level1 = request.form.get('level1', '').strip()
        level2 = request.form.get('level2', '').strip()
        level3 = request.form.get('level3', '').strip()
        level4 = request.form.get('level4', '').strip()
        display_order = int(request.form.get('display_order', 0) or 0)

        if not name or not level1 or not level2 or not level3 or not level4:
            flash('Todos los campos son obligatorios.', 'danger')
        else:
            try:
                database.save_rubric({
                    'name': name,
                    'level1': level1,
                    'level2': level2,
                    'level3': level3,
                    'level4': level4,
                    'display_order': display_order
                }, rubric_id=rubric_id)
                flash(f'Rúbrica "{name}" actualizada y sincronizada.', 'success')
                return redirect(url_for('admin_rubrics'))
            except Exception as e:
                flash(f'Error al actualizar: {e}', 'danger')

    return render_template('rubric_form.html', active_page='rubrics', rubric=rubric)

@app.route('/admin/rubrics/<int:rubric_id>/delete', methods=['POST'])
@login_required
def admin_rubric_delete(rubric_id):
    rubric = database.get_rubric_by_id(rubric_id)
    if rubric:
        database.delete_rubric(rubric_id)
        flash(f'Rúbrica "{rubric["name"]}" eliminada correctamente.', 'info')
    return redirect(url_for('admin_rubrics'))

# --- CRUD Consejos Pedagógicos ---

@app.route('/admin/recommendations')
@login_required
def admin_recommendations():
    recs = database.get_all_recommendations()
    return render_template('recommendations.html', active_page='recommendations', recommendations=recs)

@app.route('/admin/recommendations/new', methods=['GET', 'POST'])
@login_required
def admin_recommendation_new():
    if request.method == 'POST':
        label = request.form.get('label', '').strip()
        pattern = request.form.get('pattern', '').strip()
        advice = request.form.get('advice', '').strip()
        display_order = int(request.form.get('display_order', 0) or 0)

        if not label or not pattern or not advice:
            flash('Todos los campos son obligatorios.', 'danger')
        else:
            try:
                database.save_recommendation({
                    'label': label,
                    'pattern': pattern,
                    'advice': advice,
                    'display_order': display_order
                })
                flash(f'Consejo para "{label}" creado correctamente y sincronizado.', 'success')
                return redirect(url_for('admin_recommendations'))
            except Exception as e:
                flash(f'Error al guardar el consejo: {e}', 'danger')

    return render_template('recommendation_form.html', active_page='recommendations', rec=None)

@app.route('/admin/recommendations/<int:rec_id>/edit', methods=['GET', 'POST'])
@login_required
def admin_recommendation_edit(rec_id):
    rec = database.get_recommendation_by_id(rec_id)
    if not rec:
        flash('Consejo pedagógico no encontrado.', 'warning')
        return redirect(url_for('admin_recommendations'))

    if request.method == 'POST':
        label = request.form.get('label', '').strip()
        pattern = request.form.get('pattern', '').strip()
        advice = request.form.get('advice', '').strip()
        display_order = int(request.form.get('display_order', 0) or 0)

        if not label or not pattern or not advice:
            flash('Todos los campos son obligatorios.', 'danger')
        else:
            try:
                database.save_recommendation({
                    'label': label,
                    'pattern': pattern,
                    'advice': advice,
                    'display_order': display_order
                }, rec_id=rec_id)
                flash(f'Consejo para "{label}" actualizado y sincronizado.', 'success')
                return redirect(url_for('admin_recommendations'))
            except Exception as e:
                flash(f'Error al actualizar: {e}', 'danger')

    return render_template('recommendation_form.html', active_page='recommendations', rec=rec)

@app.route('/admin/recommendations/<int:rec_id>/delete', methods=['POST'])
@login_required
def admin_recommendation_delete(rec_id):
    rec = database.get_recommendation_by_id(rec_id)
    if rec:
        database.delete_recommendation(rec_id)
        flash(f'Consejo "{rec["label"]}" eliminado correctamente.', 'info')
    return redirect(url_for('admin_recommendations'))

# --- Ajustes de Textos Globales ---

@app.route('/admin/settings', methods=['GET', 'POST'])
@login_required
def admin_settings():
    if request.method == 'POST':
        intro = request.form.get('intro_text', '').strip()
        conclusion = request.form.get('conclusion_text', '').strip()
        suffix = request.form.get('advice_suffix', '').strip()

        if not intro or not conclusion or not suffix:
            flash('Todos los textos son requeridos.', 'danger')
        else:
            database.save_settings({
                'intro_text': intro,
                'conclusion_text': conclusion,
                'advice_suffix': suffix
            })
            flash('Textos globales guardados y sincronizados correctamente.', 'success')
            return redirect(url_for('admin_settings'))

    settings_dict = database.get_settings()
    return render_template('settings.html', active_page='settings', settings=settings_dict)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
