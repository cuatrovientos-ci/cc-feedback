import os
from server import app

# Entrada WSGI estándar para PythonAnywhere
application = app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
