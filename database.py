import sqlite3
import os
import json
import re
import unicodedata

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'feedback.db')

DEFAULT_RUBRICS = [
    {
        "name": "Innovación",
        "levels": [
            "Evita proponer ideas nuevas y tiende a repetir patrones sin cuestionarlos. Tiene dificultad para observar la realidad desde una perspectiva crítica y creativa.",
            "Acepta mejoras y cambios ya propuestos, pero sin proponer ideas nuevas. Se conforma y no cuestiona lo establecido. Su pensamiento crítico y creativo aún es deficiente.",
            "Busca, propone y aplica soluciones o ideas de mejora razonables cuando está motivado/a. Su mirada crítica y creativa está en desarrollo.",
            "No se conforma con lo establecido, sino que busca, propone y aplica soluciones o ideas de mejora razonables en cualquier situación. Es capaz de observar la realidad con mirada crítica y creativa."
        ]
    },
    {
        "name": "Emprendimiento",
        "levels": [
            "No muestra iniciativa ni participa voluntariamente. Solo actúa cuando se le indica y evita cualquier toma de decisiones, incluso en contextos conocidos.",
            "Demuestra iniciativa propia de forma ocasional, pero generalmente necesita indicaciones para participar. En situaciones nuevas, evita tomar decisiones.",
            "Demuestra iniciativa en la mayoría de las situaciones y participa sin necesidad de instrucciones. En contextos nuevos, aún requiere algo de apoyo para tomar decisiones.",
            "Demuestra una iniciativa coherente y participa activamente de forma voluntaria, sin esperar instrucciones. Incluso en situaciones nuevas, toma decisiones conociendo y asumiendo los posibles riesgos."
        ]
    },
    {
        "name": "Trabajo en equipo",
        "levels": [
            "Tiene dificultades importantes para el trabajo en equipo. Evita participar. No colabora en la organización. No cumple con sus tareas. No respeta opiniones. No acepta ni sigue la organización del equipo. Su presencia genera conflicto o mal ambiente.",
            "Participa de forma irregular; sobre todo si se le insiste. Acepta la organización del equipo, pero no contribuye a ella. Depende de lo que diga el resto. Le cuesta escuchar o aceptar opiniones distintas. Realiza sus tareas, aunque a veces incumple en alguna de ellas. En ocasiones puede generar tensiones y no gestiona del todo bien los conflictos.",
            "Contribuye en la organización cuando se le pide, pero no toma la iniciativa para organizar. Escucha y respeta. Cumple con sus tareas. Respeta el resto de opiniones. Ayuda cuando se lo piden. Gestiona bien los desacuerdos. Mantiene un clima respetuoso. No genera conflictos",
            "Se encarga de coordinar/organizar al equipo y proponer las tareas a realizar/ repartir. Colabora/ayuda al resto de personas del equipo, tiene en cuenta sus opiniones y necesidades, mostrando respeto hacia todas las opiniones. Realiza todas las tareas asignadas según lo acordado por el equipo. Muestra una actitud proactiva hacia el trabajo en equipo. Motiva al equipo y media en conflictos."
        ]
    },
    {
        "name": "Comunicación oral",
        "levels": [
            "No adapta su lenguaje verbal ni no verbal al contexto. Utiliza vocabulario inadecuado constantemente. Se expresa de forma confusa, inapropiada o no asertiva. No escucha. Puede generar mal clima comunicativo.",
            "Tiene dificultades para adaptar el lenguaje verbal y no verbal al contexto. Utiliza vocabulario, la mayoría de veces, inadecuado. Se expresa de forma poco clara, desordenada o poco asertiva. Escucha sin prestar atención. Su actitud no siempre contribuye al clima comunicativo.",
            "Adapta su lenguaje verbal y no verbal de forma aceptable en casi todos los contextos de forma aceptable. Se expresa de forma clara y asertiva. Escucha con atención y responde adecuadamente. Contribuye a un clima comunicativo correcto y respetuoso en la mayoría de contextos.",
            "Adapta su lenguaje verbal y no verbal (tono de voz, gestos) al contexto: formal, informal, profesional... Es capaz de explicarse de forma clara y asertiva, realizando una escucha activa y fomentando un clima de comunicación abierto y respetuoso en todos los contextos."
        ]
    },
    {
        "name": "Comunicación escrita",
        "levels": [
            "No adapta su lenguaje escrito al contexto. Tiende a cometer errores ortográficos o gramaticales como norma general. La estructura es confusa o inexistente. Se expresa de forma ininteligible.",
            "Tiene dificultades para adaptar su lenguaje escrito al contexto. Comete errores ortográficos o gramaticales frecuentemente. La estructura del texto es débil o desordenada. Se expresa de forma poco clara.",
            "Adapta su lenguaje escrito al contexto de forma aceptable, aunque con pequeños fallos de adecuación. Puede cometer pequeños errores ortográficos o gramaticales. Estructura los textos con suficiente coherencia. Se expresa con claridad aceptable.",
            "Adapta su lenguaje escrito al contexto (correos electrónicos, entregas...). Escribe sin faltas de ortografía y gramática. Utiliza un vocabulario adecuado y respetuoso. Estructura bien sus textos. Es capaz de explicarse de forma clara."
        ]
    },
    {
        "name": "Competencia digital",
        "levels": [
            "No es capaz de usar herramientas digitales de forma correcta. Usa herramientas sin criterio ni valoración crítica, priorizando la inmediatez sobre lo correcto del resultado.",
            "Muestra dificultades en el uso de herramientas digitales. No suele valorar críticamente las herramientas ni los resultados, y actúa más por hábito que por reflexión.",
            "Utiliza herramientas digitales de forma correcta. Muestra una cierta actitud crítica, valorando en algunos casos si la herramienta o el resultado son adecuados, aunque aún necesita mejorar en la toma de decisiones.",
            "Utiliza y aprovecha de manera óptima las herramientas digitales. Se utiliza de forma crítica valorando la idoneidad de la herramienta y del resultado."
        ]
    },
    {
        "name": "Adaptación al entorno",
        "levels": [
            "No se adapta a cambios o situaciones nuevas. Muestra resistencia, bloqueo o actitud negativa ante lo imprevisto.",
            "Se adapta al cambio con dificultades. Puede mostrar inseguridad o cierta resistencia ante lo nuevo. Le cuesta modificar rutinas o adoptar nuevas formas de trabajo.",
            "Se adapta a los cambios cuando estos se presentan, aunque puede necesitar un tiempo de ajuste. Acepta nuevas situaciones con disposición general positiva.",
            "Reacciona de forma positiva y flexible cuando surgen cambios o imprevistos en diferentes contextos y situaciones siendo capaz de adaptarse a ellos de forma inmediata."
        ]
    },
    {
        "name": "Autonomía",
        "levels": [
            "No trabaja de forma autónoma. No planifica ni gestiona tiempos y recursos de forma adecuada. Depende de la supervisión de otras personas para realizar tareas o resolver problemas. .",
            "Tiene dificultades para trabajar de forma autónoma. Le cuesta planificar y gestionar su tiempo y recursos. Espera indicaciones o recordatorios para avanzar.",
            "Necesita algunas indicaciones o recordatorios para avanzar. Planifica su trabajo y gestiona tiempos y recursos de forma bastante autónoma. Cuando se enfrenta a una actividad/problema, intenta buscar soluciones por sí mismo/a, sabiendo cuándo pedir ayuda.",
            "No necesita indicaciones o recordatorios para avanzar. Planifica su trabajo y gestiona tiempos y recursos de forma totalmente autónoma. Si surge un problema busca primero soluciones por sí mismo/a antes de preguntar."
        ]
    },
    {
        "name": "Responsabilidad",
        "levels": [
            "No respeta las normas establecidas. Incumple compromisos. En caso de no poder cumplir con su compromiso, no da las explicaciones pertinentes. No asume las consecuencias de sus decisiones y acciones. No reconoce sus errores.",
            "No suele respetar las normas establecidas. Le cuesta cumplir sus compromisos. En caso de no poder cumplir con su compromiso, da las explicaciones pertinentes. Raramente asume las consecuencias de sus decisiones y acciones. Reconoce errores solo cuando se le señala.",
            "Normalmente cumple con las normas establecidas. Cumple la mayoría de sus compromisos, dentro del tiempo acordado. En caso de no poder cumplir con su compromiso, da las explicaciones pertinentes, aunque no siempre en tiempo y forma. Asume, con alguna dificultad, las consecuencias de sus decisiones y acciones. Si se equivoca, suele reconocerlo y actúa para corregirlo, en lugar de esconderse o echar la culpa a otras personas.",
            "Cumple con las normas establecidas. Hace lo que se ha comprometido a hacer, dentro del tiempo acordado. En caso de no poder cumplir con su compromiso, da las explicaciones pertinentes en tiempo y forma. Asume las consecuencias de todas sus decisiones y acciones. Si se equivoca, lo reconoce y actúa para corregirlo, en lugar de esconderse o echar la culpa a otras personas."
        ]
    }
]

DEFAULT_RECOMMENDATIONS = [
    {
        "pattern": "innova|emprend",
        "label": "Innovación y Emprendimiento",
        "advice": "Propón dos soluciones a un problema del proyecto y compara sus ventajas antes de elegir una."
    },
    {
        "pattern": "equipo",
        "label": "Trabajo en equipo",
        "advice": "Acuerda con el equipo una tarea, un plazo y una forma de revisar juntos su cumplimiento."
    },
    {
        "pattern": "comunica",
        "label": "Capacidad comunicativa (oral/escrita)",
        "advice": "Prepara una exposición con introducción, dos ideas principales y cierre; solicita una sugerencia de mejora."
    },
    {
        "pattern": "digital",
        "label": "Competencia digital",
        "advice": "Contrasta una fuente digital y comprueba el resultado de una herramienta antes de incorporarlo al trabajo."
    },
    {
        "pattern": "entorno|adaptaci",
        "label": "Adaptación al entorno",
        "advice": "Ante un cambio del proyecto, anota dos alternativas y explica cómo adaptarías tu planificación."
    },
    {
        "pattern": "autonom|responsa",
        "label": "Autonomía y responsabilidad",
        "advice": "Planifica las entregas con una lista semanal y reserva un momento para revisar tus avances."
    }
]

DEFAULT_SETTINGS = {
    "intro_text": "A continuación se detalla la retroalimentación formativa de las competencias evaluadas en este periodo:",
    "conclusion_text": "Revisa estas propuestas con tu docente y elige un objetivo concreto para el próximo proyecto.",
    "advice_suffix": "Ajusta la dificultad y los apoyos con tu docente según las evidencias de aprendizaje."
}

class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


def get_db(db_path=None):
    path = db_path or os.environ.get('DATABASE_PATH') or DEFAULT_DB_PATH
    if not os.path.isabs(path):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    conn = sqlite3.connect(path, factory=ClosingConnection)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS rubrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                level1 TEXT NOT NULL,
                level2 TEXT NOT NULL,
                level3 TEXT NOT NULL,
                level4 TEXT NOT NULL,
                display_order INTEGER DEFAULT 0
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL,
                label TEXT NOT NULL,
                advice TEXT NOT NULL,
                display_order INTEGER DEFAULT 0
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        ''')
        
        cursor.execute('CREATE TABLE IF NOT EXISTS advice_bank (family TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 4), position INTEGER NOT NULL, advice TEXT NOT NULL, PRIMARY KEY(family, level, position))')
        with open(os.path.join(os.path.dirname(__file__), 'advice-bank.seed.json'), encoding='utf-8') as seed_file:
            seeds = json.load(seed_file)
        for family, levels in seeds.items():
            for level, variants in enumerate(levels, 1):
                for position, advice in enumerate(variants, 1):
                    cursor.execute('INSERT OR IGNORE INTO advice_bank VALUES (?, ?, ?, ?)', (family, level, position, advice))

        # Seed rubrics if empty
        cursor.execute('SELECT COUNT(*) FROM rubrics')
        if cursor.fetchone()[0] == 0:
            for idx, r in enumerate(DEFAULT_RUBRICS):
                cursor.execute('''
                    INSERT INTO rubrics (name, level1, level2, level3, level4, display_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (r['name'], r['levels'][0], r['levels'][1], r['levels'][2], r['levels'][3], idx))
        
        # Seed recommendations if empty
        cursor.execute('SELECT COUNT(*) FROM recommendations')
        if cursor.fetchone()[0] == 0:
            for idx, rec in enumerate(DEFAULT_RECOMMENDATIONS):
                cursor.execute('''
                    INSERT INTO recommendations (pattern, label, advice, display_order)
                    VALUES (?, ?, ?, ?)
                ''', (rec['pattern'], rec['label'], rec['advice'], idx))
                
        migrate_general_advice(conn)

        # Seed settings if empty
        for k, v in DEFAULT_SETTINGS.items():
            cursor.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', (k, v))
            
        conn.commit()

def get_all_rubrics(db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM rubrics ORDER BY display_order ASC, id ASC')
        return [dict(row) for row in cursor.fetchall()]

def get_rubric_by_id(rubric_id, db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM rubrics WHERE id = ?', (rubric_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def save_rubric(data, rubric_id=None, db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        if rubric_id:
            cursor.execute('''
                UPDATE rubrics
                SET name = ?, level1 = ?, level2 = ?, level3 = ?, level4 = ?, display_order = ?
                WHERE id = ?
            ''', (data['name'], data['level1'], data['level2'], data['level3'], data['level4'], data.get('display_order', 0), rubric_id))
        else:
            cursor.execute('''
                INSERT INTO rubrics (name, level1, level2, level3, level4, display_order)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data['name'], data['level1'], data['level2'], data['level3'], data['level4'], data.get('display_order', 0)))
        conn.commit()
    export_to_rubricas_js(db_path)

def delete_rubric(rubric_id, db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM rubrics WHERE id = ?', (rubric_id,))
        conn.commit()
    export_to_rubricas_js(db_path)

def get_all_recommendations(db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM recommendations ORDER BY display_order ASC, id ASC')
        return [dict(row) for row in cursor.fetchall()]

def get_recommendation_by_id(rec_id, db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM recommendations WHERE id = ?', (rec_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def save_recommendation(data, rec_id=None, db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        if rec_id:
            cursor.execute('''
                UPDATE recommendations
                SET pattern = ?, label = ?, advice = ?, display_order = ?
                WHERE id = ?
            ''', (data['pattern'], data['label'], data['advice'], data.get('display_order', 0), rec_id))
        else:
            cursor.execute('''
                INSERT INTO recommendations (pattern, label, advice, display_order)
                VALUES (?, ?, ?, ?)
            ''', (data['pattern'], data['label'], data['advice'], data.get('display_order', 0)))
        conn.commit()
    export_to_rubricas_js(db_path)

def delete_recommendation(rec_id, db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM recommendations WHERE id = ?', (rec_id,))
        conn.commit()
    export_to_rubricas_js(db_path)

def get_settings(db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT key, value FROM settings')
        return {row['key']: row['value'] for row in cursor.fetchall()}

def save_settings(data, db_path=None):
    with get_db(db_path) as conn:
        cursor = conn.cursor()
        for k, v in data.items():
            cursor.execute('''
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            ''', (k, v))
        conn.commit()
    export_to_rubricas_js(db_path)

def build_rubricas_js_content(db_path=None):
    rubrics_rows = get_all_rubrics(db_path)
    rubrics = []
    for r in rubrics_rows:
        rubrics.append({
            "name": r["name"],
            "levels": [r["level1"], r["level2"], r["level3"], r["level4"]]
        })
        
    settings = get_settings(db_path)
    
    rubrics_json = json.dumps(rubrics, ensure_ascii=False, indent=2)
    settings_json = json.dumps(settings, ensure_ascii=False, indent=2)
    
    return f"""'use strict';
// Generado automáticamente desde SQLite (feedback.db)
const RUBRICS = {rubrics_json};
const SETTINGS = {settings_json};

if (typeof module !== 'undefined' && module.exports) module.exports = RUBRICS;

globalThis.LOCAL_RUBRICS = RUBRICS;
globalThis.LOCAL_SETTINGS = SETTINGS;
globalThis.LOCAL_ADVICE_BANK = {json.dumps(get_advice_bank(db_path), ensure_ascii=False)};
"""

def export_to_rubricas_js(db_path=None, target_file=None):
    dest = target_file or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rubricas.js')
    content = build_rubricas_js_content(db_path)
    try:
        with open(dest, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        print(f"Error escribiendo {dest}: {e}")


def get_advice_bank(db_path=None):
    result = {}
    with get_db(db_path) as conn:
        for row in conn.execute('SELECT * FROM advice_bank ORDER BY family, level, position'):
            result.setdefault(row['family'], [[], [], [], []])[row['level'] - 1].append(row['advice'])
    return result


def update_bank_advice(family, level, position, advice, db_path=None):
    advice = advice.strip()
    if not 20 <= len(advice) <= 1000:
        raise ValueError('Escribe entre 20 y 1000 caracteres.')
    with get_db(db_path) as conn:
        updated = conn.execute('UPDATE advice_bank SET advice = ? WHERE family = ? AND level = ? AND position = ?', (advice, family, level, position))
        if updated.rowcount != 1:
            raise ValueError('Sugerencia no encontrada.')
    export_to_rubricas_js(db_path)


BANK_NAMES = {
    'innovation': ['Innovación y emprendimiento', 'Innovación', 'Emprendimiento'],
    'teamwork': ['Trabajo en equipo'],
    'communication': ['Capacidad comunicativa', 'Comunicación oral', 'Comunicación escrita'],
    'digital': ['Competencia digital'],
    'adaptation': ['Adaptación al entorno'],
    'autonomy': ['Autonomía y responsabilidad', 'Autonomía', 'Responsabilidad']
}


def migrate_general_advice(conn):
    conn.execute('CREATE TABLE IF NOT EXISTS advice_migrations (rec_id INTEGER PRIMARY KEY)')
    seeds = {(r['pattern'], r['advice']) for r in DEFAULT_RECOMMENDATIONS}
    for row in conn.execute('SELECT * FROM recommendations WHERE id NOT IN (SELECT rec_id FROM advice_migrations)').fetchall():
        if (row['pattern'], row['advice']) in seeds:
            conn.execute('INSERT INTO advice_migrations VALUES (?)', (row['id'],))
            continue
        try:
            pattern = re.compile(row['pattern'], re.I)
            families = [key for key, names in BANK_NAMES.items() if any(pattern.search(''.join(c for c in unicodedata.normalize('NFD', name.lower()) if not unicodedata.combining(c))) for name in names)]
        except re.error:
            families = []
        if not families:
            continue  # Keep the original visible for manual classification; never discard it.
        for family in families:
            for level in range(1, 5):
                if not conn.execute('SELECT 1 FROM advice_bank WHERE family=? AND level=? AND advice=?', (family, level, row['advice'])).fetchone():
                    position = conn.execute('SELECT COALESCE(MAX(position),0)+1 FROM advice_bank WHERE family=? AND level=?', (family, level)).fetchone()[0]
                    conn.execute('INSERT INTO advice_bank VALUES (?,?,?,?)', (family, level, position, row['advice']))
        conn.execute('INSERT INTO advice_migrations VALUES (?)', (row['id'],))


def pending_advice_migration(db_path=None):
    with get_db(db_path) as conn:
        return [dict(r) for r in conn.execute('SELECT * FROM recommendations WHERE id NOT IN (SELECT rec_id FROM advice_migrations)')]


def add_bank_advice(family, level, advice, legacy_id=None, db_path=None):
    advice = advice.strip()
    if family not in BANK_NAMES or level not in range(1, 5):
        raise ValueError('Selecciona una competencia y un nivel válidos.')
    if not 20 <= len(advice) <= 1000:
        raise ValueError('Escribe entre 20 y 1000 caracteres.')
    with get_db(db_path) as conn:
        conn.execute('BEGIN IMMEDIATE')
        position = conn.execute('SELECT COALESCE(MAX(position),0)+1 FROM advice_bank WHERE family=? AND level=?', (family, level)).fetchone()[0]
        conn.execute('INSERT INTO advice_bank VALUES (?,?,?,?)', (family, level, position, advice))
        if legacy_id:
            conn.execute('INSERT OR IGNORE INTO advice_migrations VALUES (?)', (legacy_id,))
    export_to_rubricas_js(db_path)
