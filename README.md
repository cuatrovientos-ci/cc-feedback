# Retroalimentación de competencias clave

Revisión local: 8 de octubre de 2026. Mantiene **Gemini mediante Puter, recomendaciones personalizadas y preparación del borrador en Gmail**. No se ha publicado esta revisión ni se ha acreditado autorización de uso real.

## Datos separados antes de llamar a la IA

1. `index.html` conecta con Puter. No contiene nombres, correos ni filas originales.
2. `editor.html` recibe las filas dentro de un iframe aislado, con origen opaco (`sandbox` sin `allow-same-origin`). No carga Puter ni recursos remotos; su política impide conexiones de datos. El SDK del contenedor no puede leer su documento.
3. Se validan las cabeceras y los valores. Se conservan nombre, correo y total dentro del editor; a cada fila se asigna un UUID nuevo para esa operación.
4. Solo se comunican al contenedor `{id, competencias: [{competencia, valor}]}`. Este vuelve a construir una lista de campos permitidos antes de llamar a la IA. No hay envío de filas originales como alternativa ante errores.
5. Gemini devuelve recomendaciones. Se exige una correspondencia completa de códigos y competencias, sin duplicados. La asociación local utiliza el código, nunca el orden de respuesta. Nombres, correos, notas y total mostrados proceden de la entrada docente, no del modelo.
6. El docente revisa y adapta el borrador. Al editarlo se desmarca la revisión. Gmail se abre por una acción expresa y con el destinatario local; no se envía ningún correo automáticamente.

**Esto es seudonimización y minimización, no anonimización garantizada.** Los códigos se pueden vincular localmente a las identidades y el perfil de notas puede permitir inferencias. Puter recibe además información de conexión y de la cuenta que se autentica. Mantener esos perfiles para recomendaciones individualizadas no permite afirmar que el conjunto sea anónimo.

## Uso

Servir los archivos por HTTPS (o localhost para pruebas), no abrirlos como `file://`.

1. Pulsar «Conectar con Puter / Gemini». La primera pulsación carga el SDK; la segunda inicia sesión desde una acción directa para permitir la ventana de acceso.
2. Pegar celdas tabuladas con cabecera: cabecera opcional, nombre opcional, Email opcional, seis competencias y Total opcional. Sin cabecera se admite texto separado por espacios o celdas tabuladas. Si falta el nombre se usa Alumno1, Alumno2, etc.; si falta el correo se usa alumno1@example.invalid, alumno2@example.invalid, etc., marcado como ejemplo.
3. Se admiten las nueve subcompetencias originales: Innovación, Emprendimiento, Trabajo en equipo, Comunicación oral, Comunicación escrita, Competencia digital, Adaptación al entorno, Autonomía y Responsabilidad. También las seis cabeceras `Competency 1 Level` a `Competency 6 Level`, mapeadas a las seis categorías generales del prompt original.
4. Introducir notas 0–10 (hasta dos decimales, coma o punto), sin texto libre. Las competencias vacías no se envían. No se admiten texto libre, diagnósticos ni columnas desconocidas. Las notas no se convierten automáticamente a niveles, porque la escala original dejaba huecos.
5. Generar, revisar cada recomendación y destinatario y abrir Gmail con una cuenta institucional autorizada. Las recomendaciones siguen siendo redactadas por la IA, no son plantillas locales.

El iframe permite el evento local del formulario con `allow-forms`, mientras `form-action none` bloquea envíos nativos a servidores. Usa `allow-popups` y `allow-popups-to-escape-sandbox` para Gmail, con `noopener,noreferrer`; **no añadir `allow-same-origin`**, porque anularía el aislamiento frente al SDK del contenedor. El uso directo de `editor.html` no permite generar.

## Límites y conservación

- Máximo 100 personas / 100.000 caracteres de entrada. Valores y cabeceras permitidos exclusivamente.
- No se guardan identidades en cookies o almacenamiento web de la aplicación. La cuenta/sesión del SDK Puter tiene sus propias condiciones.
- Las identidades se mantienen en memoria y en los borradores; se retiran al borrar, salir o tras 15 minutos de inactividad. La suspensión del navegador puede retrasar el temporizador; se comprueba también al volver a interactuar.
- Cancelar descarta respuestas posteriores, pero no retira una petición ya recibida por Puter. El borrado local no asegura sobrescritura física ni borra copias externas.
- Abrir Gmail incluye el texto y el destinatario en una URL de Google, como en la funcionalidad original. Es una transferencia identificada deliberada al canal de correo, distinta de la petición seudonimizada a IA. Puede quedar en historial/registros. La pantalla advierte antes de abrirlo.
- El código externo del proveedor continúa siendo una dependencia de confianza para las peticiones seudonimizadas. El aislamiento no certifica anonimato ni cumplimiento legal.

## Publicación, autorización y pruebas

Ver [guía de actualización](docs/PRIVACIDAD_Y_ACTUALIZACION.md) y [privacidad](privacidad.html). La web sigue en GitHub Pages, no en PythonAnywhere. La propuesta personal de Ander de migrar las otras aplicaciones a EU no la traslada automáticamente.

`node --test tests/core.test.cjs`: trece pruebas de separación, validación y correspondencia.

`node tests/browser.cjs`: Playwright con Chromium instalado; opcional `CC_BROWSER` para la ruta de otro navegador Chromium. Prueba el SDK con una respuesta simulada, sin datos reales ni consumo de IA. Comprueba aislamiento, peticiones sin identificadores, recomendaciones, reordenación, revisión, Gmail, borrado y contenido malicioso. No sustituye una prueba real de autenticación y generación con una cuenta autorizada y datos ficticios.

Archivos para publicar: `index.html`, `editor.html`, `core.js`, `app.js`, `editor.js`, `rubricas.js`, `style.css`, `shell.css`, `privacidad.html` y `assets/` (Bootstrap local y licencia). `prompt.toon` queda como referencia original; las rúbricas se sirven localmente desde `rubricas.js`. No subir hojas ni capturas con datos reales.

### Entrada sin cabecera

Orden fijo: Nombre (opcional), Innovación y Emprendimiento, Trabajo en Equipo, Capacidad Comunicativa, Competencia Digital, Adaptación al Entorno, Autonomía y Responsabilidad y Total (opcional). El correo, si se incluye sin cabecera, va después del nombre. El total ausente no se calcula.

```text
Alumno1 5 5 6 4 6 7
Alumno2 6 5 4 3 4 5
```

También se admite pegar solo las seis notas: el nombre y correo de ejemplo se generan localmente. Con cabecera tabulada se reconocen los nombres numerados del 1 al 6, con o sin acentos, y pueden omitirse las columnas Nombre y Email. Sustituir el correo de ejemplo en Gmail antes de enviar. Las direcciones example.invalid no son destinatarios reales.
