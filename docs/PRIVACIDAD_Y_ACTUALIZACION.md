# Aceptación de CC-feedback local

La arquitectura, modelo y diagrama vigentes se describen en el [README](../README.md). Esta rama usa Wllama 3.8.1 con Qwen 2.5 **0.5B**, además de propuestas por reglas. No asigna niveles de rúbrica automáticamente.

Pendiente de comprobar en el despliegue real de PythonAnywhere:

- Publicar todos los archivos actuales y comprobar MIME de JS/Wasm, HTTPS y caché de versiones.
- Probar carga, memoria y calidad con datos ficticios en equipos representativos; no se garantiza que cualquier equipo de 8 GB sea suficiente.
- Evaluar COOP/COEP para varios hilos y comprobar que no rompen el iframe ni Gmail.
- Confirmar mediante inspección de red que no salen notas durante inferencia. El alojamiento y la descarga de pesos sí generan metadatos de conexión.
- Probar cancelación de descarga e inferencia, datos retirados por inactividad y limpieza de la caché propia. Las cachés antiguas no se borran automáticamente.
- Completar información institucional y validar proveedores, licencia del modelo, conservación y autorización del centro.
- Validar las propuestas pedagógicas y mantener revisión humana. Una respuesta bien formada puede contener consejos inadecuados.

Las pruebas automatizadas simulan Wllama y no sustituyen estas comprobaciones de aceptación. No se ha modificado ni verificado la configuración de la cuenta PythonAnywhere desde esta revisión.
