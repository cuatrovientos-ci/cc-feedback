'use strict';
// Textos de prompt.toon, sin convertir notas ni inferir niveles.
const RUBRICS = [
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
      "No suele respetar las normas establecidas. Le cuesta cumplir sus compromisos. En caso de no poder cumplir con su compromiso, no da las explicaciones pertinentes. Raramente asume las consecuencias de sus decisiones y acciones. Reconoce errores solo cuando se le señala.",
      "Normalmente cumple con las normas establecidas. Cumple la mayoría de sus compromisos, dentro del tiempo acordado. En caso de no poder cumplir con su compromiso, da las explicaciones pertinentes, aunque no siempre en tiempo y forma. Asume, con alguna dificultad, las consecuencias de sus decisiones y acciones. Si se equivoca, suele reconocerlo y actúa para corregirlo, en lugar de esconderse o echar la culpa a otras personas.",
      "Cumple con las normas establecidas. Hace lo que se ha comprometido a hacer, dentro del tiempo acordado. En caso de no poder cumplir con su compromiso, da las explicaciones pertinentes en tiempo y forma. Asume las consecuencias de todas sus decisiones y acciones. Si se equivoca, lo reconoce y actúa para corregirlo, en lugar de esconderse o echar la culpa a otras personas."
    ]
  }
];
if (typeof module !== 'undefined' && module.exports) module.exports = RUBRICS;

globalThis.LOCAL_RUBRICS = RUBRICS;
