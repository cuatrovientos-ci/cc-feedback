# Actualización de la rama webbrowser-llm

Esta rama reemplaza la generación de Puter/Gemini por WebLLM en el navegador. Consulta el [README](../README.md) para el flujo actualizado, requisitos, conservación y comprobaciones de despliegue. No debe mezclarse `app.js` de esta rama con el editor de una versión anterior.

## Requisitos de aceptación

- Verificar WebGPU y memoria en los equipos de uso, la descarga y la cancelación; probar datos ficticios y calidad de las recomendaciones en castellano.
- Revisar el modelo Qwen y su licencia, WebLLM fijado en 0.2.85 y los proveedores de distribución. El runtime se carga por CDN; pesos y bibliotecas se descargan desde las ubicaciones del catálogo de esa versión. Pueden existir redirecciones a servidores de distribución.
- Comprobar que no se envían notas ni prompts a servicios de inferencia remotos. Mantener el editor aislado y sin conexiones de datos. No añadir un fallback a Puter/Gemini.
- Completar identidad del responsable, contacto/DPD, base jurídica, finalidad, conservación y canal de derechos en `privacidad.html`; obtener autorización institucional antes de usar datos reales.
- Incluir dispositivos, descargas, correos, copias y originales en la política de conservación. La caché de pesos del modelo es distinta de los borradores académicos.
- Revisar siempre el texto y destinatario antes de Gmail, que recibe el texto mediante URL y conserva mensajes bajo sus propias condiciones.

## Pruebas

Las pruebas automatizadas del navegador simulan el módulo WebLLM, pero ejecutan el worker y el protocolo reales de la aplicación. No sustituyen una prueba completa del modelo real con GPU. La rama principal conserva su implementación independiente.
