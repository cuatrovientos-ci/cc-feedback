# 🎓 Generador de Retroalimentación de Competencias Clave

Herramienta web diseñada para automatizar la creación de correos electrónicos de retroalimentación constructiva para el alumnado, basada en la evaluación de sus competencias clave.

## ✨ Características Principales

- **🤖 Inteligencia Artificial:** Utiliza el modelo **Gemini 2.5 Flash** (a través de Puter.js) para interpretar las calificaciones y redactar mensajes personalizados, motivadores y constructivos.
- **📊 Basado en Rúbricas:** El sistema entiende y aplica rúbricas específicas para competencias como Innovación, Trabajo en Equipo, Comunicación, Competencia Digital, etc.
- **📧 Integración con Gmail:** Genera enlaces directos que abren una ventana de redacción en Gmail con el asunto, destinatario y cuerpo del mensaje ya prellenados.
- **🔒 Privacidad:** Los datos se procesan en la sesión del navegador y se envían al modelo de IA para su procesamiento.

## 🚀 Cómo Usar

1. **Preparar los Datos:**
   - Abre tu hoja de cálculo de calificaciones (Excel/Google Sheets).
   - Asegúrate de tener las columnas requeridas (Nombre del estudiante, niveles de competencia, etc.).
   - **Copiar:** Selecciona y copia las celdas incluyendo la **cabecera**.

2. **Generar Retroalimentación:**
   - Abre `index.html` en tu navegador.
   - Pega los datos copiados en el área de texto grande.
   - Haz clic en el botón **"Generar"**.

3. **Enviar Correos:**
   - Espera a que la IA procese los datos (verás indicadores de carga).
   - Una vez finalizado, aparecerá una lista de estudiantes con casillas de verificación.
   - Haz clic en el **nombre del estudiante** para abrir automáticamente un borrador en Gmail con el feedback listo para revisar y enviar.

## 🛠 Tecnologías

- **Frontend:** HTML5, Bootstrap 5 (Estilos).
- **IA/Backend:** [Puter.js](https://docs.puter.com/) (SDK para ejecución de modelos de IA en web).
- **Configuración:** `promt.toon` (Archivo de configuración que define el prompt, las rúbricas y la estructura de salida JSON).

## 📂 Archivos del Proyecto

- `index.html`: La aplicación web principal.
- `promt.toon`: Contiene las instrucciones del sistema (System Prompt) y las definiciones de los niveles de competencia que la IA utiliza para evaluar.
- `README.md`: Este archivo.

---
*Desarrollado para la mejora continua de la evaluación en Cuatrovientos.*
