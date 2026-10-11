# Aceptación de CC-feedback sin IA

La arquitectura y el diagrama vigentes se describen en el [README](../README.md). La rama `no-ia` selecciona valoraciones de rúbrica y sugerencias por programación, sin modelos ni servicios de inteligencia artificial.

Pendiente de comprobar en el despliegue real de PythonAnywhere:

- Publicar la rama completa, retirar recursos de versiones anteriores y comprobar HTTPS, estilos y scripts.
- Confirmar que generar borradores no envía notas ni identidades al servidor u otros servicios.
- Comprobar el editor aislado, el acceso administrativo corporativo y la apertura explícita de Gmail después de revisar.
- Verificar el borrado y la retirada por inactividad. No se eliminan automáticamente cachés, sesiones o datos de variantes anteriores, Gmail ni copias externas.
- Completar información institucional, base jurídica, conservación, proveedores y autorización del centro.
- Validar los umbrales y correspondencias de rúbricas, las 192 sugerencias y su adecuación a cada actividad.
- Revisar protección CSRF y duración de sesiones administrativas.

Las pruebas locales verifican generación sin solicitudes externas, aislamiento, edición, revisión y borrado. No sustituyen la aceptación institucional ni verifican la configuración de producción. No se ha desplegado esta rama desde esta revisión.
