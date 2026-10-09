# Actualización de la rama webbrowser-llm

Esta rama utiliza **Wllama (WebAssembly / llama.cpp)** con modelos cuantizados en formato GGUF (Qwen 2.5 1.5B) ejecutados de forma local por CPU/Wasm. Consulta el [README](../README.md) para el flujo actualizado, requisitos y comprobaciones de despliegue.

## Requisitos de aceptación

- Probar la carga y ejecución de Wllama en los equipos de uso (funciona en ordenadores con 8 GB de RAM sin activar flags en el navegador).
- Verificar que la primera descarga del modelo GGUF y runtime Wasm se realiza correctamente y queda en caché local (IndexedDB).
- Comprobar que no se envían nombres, correos ni datos identificativos al motor Wllama, manteniendo el editor en un iframe aislado con sandbox.
- Confirmar que la inferencia no realiza llamadas de red ni telemetría a servicios en la nube.
- Completar identidad del responsable, contacto/DPD, base jurídica, plazos de conservación y canal de derechos en `privacidad.html`; obtener autorización institucional antes del uso con datos reales.
- Revisar siempre el borrador y destinatario antes de abrir Gmail.

## Pruebas

Las pruebas automatizadas de `tests/browser.cjs` simulan el módulo Wllama para validar el aislamiento, manejo de errores, streaming, lotes y cancelación sin comprometer datos confidenciales.
