/* Propuestas editoriales: revisar su pertinencia antes de entregar al alumnado.
 * No realiza peticiones, no almacena notas ni deduce rasgos personales. */
(function (root) {
  'use strict';
  const bank = {
    innovation: [
      [
        'Con ayuda de un ejemplo, identifica una dificultad del proyecto y dibuja una posible mejora.',
        'Anota una pregunta sobre cómo se hace una tarea y coméntala con tu docente.',
        'Elige un objeto cotidiano y propone un uso diferente; explica a quién podría ayudar.',
        'Completa una plantilla con un problema, una persona afectada y una primera idea para resolverlo.',
        'Observa dos soluciones ya existentes y señala una diferencia que te parezca útil.',
        'Escoge una pequeña mejora entre dos opciones y acuerda con tu docente cómo probarla.',
        'Construye un boceto sencillo de una idea y pide una observación concreta para mejorarlo.',
        'Asume una tarea breve que hayas elegido y registra el primer paso que has conseguido completar.'
      ],
      [
        'Adapta una solución conocida a una necesidad del proyecto y explica qué has cambiado.',
        'Propón dos alternativas para una tarea y elige una utilizando un criterio acordado.',
        'Reserva diez minutos para aportar una idea propia antes de consultar ejemplos.',
        'Prepara una prueba pequeña de tu propuesta y anota los materiales que necesitas.',
        'Pregunta a un compañero qué dificultad encuentra en el proyecto y plantea una mejora concreta.',
        'Utiliza una lista de ventajas e inconvenientes para decidir qué idea merece una primera prueba.',
        'Ofrece realizar una pequeña mejora y acuerda una fecha para mostrar el resultado.',
        'Revisa una idea que no haya funcionado y cambia un elemento antes de volver a probarla.'
      ],
      [
        'Compara tres soluciones utilizando coste, utilidad y tiempo antes de justificar tu elección.',
        'Diseña un prototipo sencillo y recoge dos observaciones de quienes lo prueben.',
        'Detecta una necesidad del proyecto y presenta una propuesta con recursos, plazos y posibles riesgos.',
        'Prueba tu idea con una evidencia observable y decide qué conservar y qué modificar.',
        'Relaciona una solución de otro sector con el proyecto y comprueba si resulta aplicable.',
        'Toma una iniciativa dentro de tu responsabilidad y explica después qué has aprendido de la decisión.',
        'Reformula un problema desde el punto de vista de quien utilizará el resultado.',
        'Documenta una mejora que hayas probado para que otra persona pueda reproducirla.'
      ],
      [
        'Valida una propuesta con varios usuarios y prioriza las mejoras según las evidencias recogidas.',
        'Diseña una prueba que pueda cuestionar tu idea favorita y revisa la decisión con sus resultados.',
        'Coordina una sesión de propuestas donde todas las personas aporten antes de seleccionar una solución.',
        'Evalúa la viabilidad y el impacto ambiental de una innovación antes de ampliar su uso.',
        'Presenta una iniciativa con indicadores de éxito y un plan alternativo si falla la primera prueba.',
        'Transfiere una mejora a un contexto diferente y explica qué adaptaciones necesita.',
        'Compara el resultado de una innovación con la situación inicial y comunica también sus límites.',
        'Acompaña a un compañero a desarrollar su idea mediante preguntas, dejando que tome sus propias decisiones.'
      ]
    ],
    teamwork: [
      [
        'Acuerda una tarea pequeña con tu equipo y confirma qué debes entregar y cuándo.',
        'En la próxima reunión, escucha una intervención completa y resume su idea antes de responder.',
        'Pide que se aclare tu función y anota el primer paso que puedes realizar.',
        'Comparte un avance breve de tu tarea para que el equipo sepa cómo ayudarte.',
        'Ensaya una frase respetuosa para expresar un desacuerdo sobre el trabajo.',
        'Pregunta a una persona del equipo qué necesita para avanzar y ofrece una ayuda concreta.',
        'Utiliza una lista compartida para marcar la tarea que has terminado.',
        'Participa con una pregunta o propuesta en la próxima reunión y comprueba que se ha entendido.'
      ],
      [
        'Asume una tarea con plazo y avisa con antelación si necesitas renegociarlo.',
        'Propón un reparto de tareas y comprueba que cada persona entiende su responsabilidad.',
        'Antes de discrepar, resume la propuesta de otra persona y explica tu alternativa con respeto.',
        'Prepara tu aportación a la reunión con un avance y una dificultad concreta.',
        'Revisa con un compañero cómo encajan vuestras entregas antes de unirlas.',
        'Ofrece ayuda en una tarea acordada sin sustituir el trabajo de quien la realiza.',
        'Anota los acuerdos de una reunión y confirma que todas las personas los comparten.',
        'Pide una observación sobre tu participación y elige un cambio para la siguiente sesión.'
      ],
      [
        'Propón una revisión intermedia para detectar dependencias y ajustar el reparto de tareas.',
        'Invita a participar a quien todavía no haya intervenido y recoge su propuesta.',
        'Ante un desacuerdo, identifica el objetivo común y compara alternativas con criterios compartidos.',
        'Organiza una revisión cruzada de entregas y acuerda cómo incorporar las observaciones.',
        'Anticipa qué necesita otra persona de tu trabajo y acuerda una entrega parcial útil.',
        'Facilita una reunión breve que termine con responsables, plazos y acuerdos claros.',
        'Comparte una técnica que te haya servido y pregunta cómo podría adaptarse al equipo.',
        'Valora con el equipo qué acuerdo se cumplió mejor y qué conviene cambiar en el próximo proyecto.'
      ],
      [
        'Facilita la rotación de responsabilidades para que todas las personas practiquen funciones diferentes.',
        'Ayuda a mediar en un desacuerdo escuchando cada perspectiva y buscando un acuerdo verificable.',
        'Revisa si el reparto de trabajo es equilibrado y propone ajustes consensuados.',
        'Diseña con el equipo un mecanismo para detectar bloqueos antes de que afecten a la entrega.',
        'Coordina una retrospectiva donde se reconozcan aportaciones y se acuerde una mejora concreta.',
        'Acompaña a otra persona a coordinar una reunión sin asumir sus decisiones.',
        'Contrasta la valoración del trabajo colectivo con evidencias y con la opinión de todo el equipo.',
        'Documenta una práctica de colaboración útil y pruébala con un equipo diferente.'
      ]
    ],
    communication: [
      [
        'Prepara un mensaje con una idea principal y un ejemplo, utilizando un esquema de apoyo.',
        'Reescribe una instrucción con frases cortas y comprueba con otra persona si se entiende.',
        'Practica una explicación de un minuto y pide que te indiquen qué idea ha quedado clara.',
        'Antes de responder, repite con tus palabras la pregunta para comprobar que la has entendido.',
        'Completa un borrador con inicio, explicación y cierre antes de compartirlo.',
        'Revisa un texto breve con una lista de comprobación de claridad, ortografía y respeto.',
        'Elige tres palabras técnicas de la actividad y explica su significado con tus propias palabras.',
        'Ensaya una petición de ayuda que indique la tarea, la dificultad y la duda concreta.'
      ],
      [
        'Ordena tu explicación en tres ideas y elimina la información que no ayude a entenderlas.',
        'Adapta un mismo mensaje para un compañero y para una persona en un contexto profesional.',
        'Revisa un correo de práctica para que incluya asunto, propósito y una petición clara.',
        'Solicita una observación sobre tu explicación y modifica la parte que genere más dudas.',
        'Apoya una afirmación con un ejemplo concreto del proyecto.',
        'Prepara una respuesta respetuosa a una opinión diferente, distinguiendo hechos y preferencias.',
        'Comprueba que cada párrafo de tu borrador desarrolla una sola idea.',
        'Resume un acuerdo y pide confirmación antes de dar por terminada la conversación.'
      ],
      [
        'Explica una decisión técnica a una persona sin conocimientos del tema y comprueba su comprensión.',
        'Revisa la coherencia entre tu conclusión y las evidencias que presentas.',
        'Prepara una exposición breve con una estructura clara y una respuesta a una posible objeción.',
        'Transforma un texto extenso en un resumen que mantenga sus ideas y límites esenciales.',
        'Adapta el tono y el vocabulario de una propuesta a su destinatario y propósito.',
        'Practica la escucha activa formulando una pregunta que aclare la necesidad de tu interlocutor.',
        'Revisa un borrador con otra persona y justifica qué observaciones has incorporado.',
        'Comunica un desacuerdo explicando su motivo y proponiendo una alternativa viable.'
      ],
      [
        'Presenta una propuesta a públicos diferentes y compara qué adaptación resulta más clara en cada caso.',
        'Facilita un debate breve y cierra con una síntesis fiel de acuerdos y discrepancias.',
        'Revisa un documento complejo para hacerlo accesible sin perder precisión técnica.',
        'Anticipa interpretaciones ambiguas de un mensaje y corrígelas antes de compartirlo.',
        'Defiende una propuesta con evidencias, reconoce sus límites y responde a las objeciones con respeto.',
        'Ayuda a otra persona a mejorar su explicación mediante preguntas concretas sobre claridad y estructura.',
        'Evalúa la comprensión de tu audiencia y adapta la explicación a las dudas que aparezcan.',
        'Elabora una guía breve de comunicación profesional con ejemplos revisados por tus compañeros.'
      ]
    ],
    digital: [
      [
        'Sigue una guía breve para crear, guardar y localizar un archivo de práctica.',
        'Comprueba con tu docente qué herramienta necesitas antes de comenzar una actividad digital.',
        'Repite una operación básica con datos ficticios y anota los pasos que te resulten difíciles.',
        'Revisa el resultado de una herramienta comparándolo con un ejemplo resuelto.',
        'Identifica la autoría y la fecha de una fuente antes de utilizarla en el proyecto.',
        'Practica cómo compartir un archivo de prueba solo con las personas previstas.',
        'Organiza los archivos de una actividad con nombres que indiquen su contenido.',
        'Antes de pegar información en una aplicación, comprueba con tu docente si contiene datos personales.'
      ],
      [
        'Compara dos herramientas sencillas y explica cuál se ajusta mejor a la tarea.',
        'Contrasta una afirmación encontrada en internet con otra fuente identificable.',
        'Comprueba manualmente una muestra del resultado obtenido con una herramienta digital.',
        'Revisa los permisos de un archivo de práctica antes de compartirlo con el equipo.',
        'Crea una estructura de carpetas para localizar las entregas y sus versiones.',
        'Anota un error frecuente al usar una herramienta y documenta cómo corregirlo.',
        'Comprueba que las imágenes o materiales que utilizas permiten el uso previsto y cita su origen.',
        'Utiliza una lista de revisión para comprobar formato, contenido y destinatarios antes de entregar un archivo.'
      ],
      [
        'Elige una herramienta valorando su utilidad, privacidad y facilidad de colaboración.',
        'Valida el resultado de una operación digital con casos de prueba que incluyan posibles errores.',
        'Documenta un procedimiento digital para que otra persona pueda repetirlo con datos ficticios.',
        'Contrasta una respuesta generada por IA con fuentes fiables antes de incorporarla al trabajo.',
        'Revisa la accesibilidad de una entrega digital y corrige una barrera que hayas detectado.',
        'Compara dos fuentes y explica qué evidencias hacen más fiable a una de ellas.',
        'Prueba una función que reduzca una tarea repetitiva y verifica que el resultado siga siendo correcto.',
        'Revisa qué datos necesita una aplicación y evita introducir información innecesaria.'
      ],
      [
        'Diseña un procedimiento digital con controles de calidad y comprueba sus límites mediante casos de prueba.',
        'Evalúa una herramienta nueva con criterios de accesibilidad, privacidad, coste y calidad del resultado.',
        'Ayuda al equipo a detectar errores en resultados automatizados sin dar por válida la primera respuesta.',
        'Documenta una alternativa cuando una herramienta deje de estar disponible y prueba su viabilidad.',
        'Revisa con el equipo el recorrido de los datos de una actividad y propone reducir su exposición.',
        'Optimiza un flujo de trabajo y compara el tiempo ahorrado y los errores antes y después.',
        'Prepara una guía de uso crítico de una herramienta con ejemplos de aciertos y limitaciones.',
        'Comprueba si una solución digital puede mantenerse y utilizarse por otras personas sin depender de ti.'
      ]
    ],
    adaptation: [
      [
        'Ante un cambio de tarea, identifica con tu docente qué se mantiene y qué debes modificar.',
        'Ensaya una forma alternativa de realizar una actividad siguiendo un ejemplo sencillo.',
        'Anota una duda sobre una situación nueva y pide una aclaración concreta.',
        'Divide un cambio del proyecto en un primer paso pequeño que puedas probar.',
        'Compara la instrucción anterior con la nueva y señala una diferencia importante.',
        'Acuerda un punto de revisión para comprobar cómo avanzas tras un cambio.',
        'Observa cómo se realiza una tarea en otro contexto y comenta una diferencia con tu docente.',
        'Prepara con ayuda una alternativa sencilla por si falta un recurso previsto.'
      ],
      [
        'Cuando cambie un plazo, reorganiza dos tareas y confirma que la nueva planificación es viable.',
        'Prueba una forma de trabajo diferente durante una sesión y anota qué te ha resultado útil.',
        'Identifica qué información te falta ante una novedad y busca una fuente adecuada para aclararla.',
        'Ante un imprevisto, escribe dos opciones y pide una observación antes de elegir.',
        'Revisa una rutina del proyecto y cambia un paso que ya no responda a la situación.',
        'Explica al equipo qué ajuste necesitas hacer cuando cambien las condiciones de tu tarea.',
        'Utiliza una experiencia anterior para afrontar una situación nueva y señala qué debes adaptar.',
        'Después de un cambio, compara tu plan inicial con el resultado y registra un aprendizaje.'
      ],
      [
        'Reorganiza el trabajo ante un imprevisto y comunica qué prioridades has modificado y por qué.',
        'Prepara un plan alternativo para un recurso importante del proyecto.',
        'Prueba una técnica nueva y decide si conviene mantenerla utilizando evidencias del resultado.',
        'Identifica las consecuencias de un cambio para otras tareas antes de ajustar la tuya.',
        'Ante información nueva, revisa una decisión y explica qué evidencia justifica el cambio.',
        'Adapta un procedimiento conocido a otro contexto y comprueba qué pasos siguen siendo útiles.',
        'Acuerda con el equipo cómo actuar ante un imprevisto frecuente y revisadlo después de probarlo.',
        'Distingue lo urgente de lo importante al reajustar la planificación de un proyecto.'
      ],
      [
        'Anticipa varios escenarios del proyecto y define qué señal activaría cada plan alternativo.',
        'Ayuda al equipo a ajustar su organización ante un cambio sin perder de vista el objetivo común.',
        'Evalúa una adaptación con evidencias y documenta qué funcionaría también en otros contextos.',
        'Coordina una prueba limitada de una nueva forma de trabajo antes de extenderla al equipo.',
        'Revisa una decisión cuando cambien sus supuestos y comunica con claridad los motivos.',
        'Diseña una alternativa que permita continuar el proyecto si falla un recurso clave.',
        'Recoge aprendizajes de un imprevisto y conviértelos en mejoras concretas del próximo plan.',
        'Acompaña a otra persona ante una tarea nueva ofreciendo referencias y espacio para decidir.'
      ]
    ],
    autonomy: [
      [
        'Divide una entrega en tres pasos y acuerda con tu docente cuándo revisar el primero.',
        'Anota una tarea y su plazo en un lugar visible y comprueba al final de la sesión tu avance.',
        'Utiliza una lista breve para preparar los materiales que necesitas antes de empezar.',
        'Cuando aparezca una dificultad, explica qué has intentado antes de pedir ayuda.',
        'Elige un compromiso pequeño que puedas cumplir hoy y revisa si lo has completado.',
        'Comprueba una norma de la actividad y explica cómo se aplica a tu tarea.',
        'Si detectas un error, señálalo y acuerda un primer paso para corregirlo.',
        'Antes de terminar la sesión, deja anotado el siguiente paso de tu trabajo.'
      ],
      [
        'Planifica dos entregas con pasos y plazos intermedios que puedas revisar por tu cuenta.',
        'Reserva un momento al final de cada sesión para comprobar tus compromisos pendientes.',
        'Prueba una solución sencilla a un bloqueo antes de formular una consulta concreta.',
        'Si prevés un retraso, avisa antes del plazo y propone una fecha realista.',
        'Revisa tu entrega con una lista de criterios antes de solicitar ayuda al docente.',
        'Compara el tiempo previsto con el utilizado en una tarea y ajusta tu próxima planificación.',
        'Reconoce un error del trabajo y describe qué harás para corregirlo y evitar que se repita.',
        'Prepara los recursos de la siguiente sesión sin esperar un recordatorio.'
      ],
      [
        'Planifica una entrega completa con margen para revisarla y reajusta los pasos según tu avance.',
        'Distingue qué dificultades puedes resolver y cuáles requieren apoyo antes de continuar.',
        'Revisa tus compromisos semanales y comunica a tiempo cualquier cambio que afecte a otras personas.',
        'Documenta una decisión propia con sus motivos y comprueba después sus consecuencias.',
        'Analiza un error de una entrega y aplica una medida concreta para prevenirlo en la siguiente.',
        'Estima los recursos necesarios para una actividad y comprueba su disponibilidad antes de comenzar.',
        'Selecciona una prioridad diaria que contribuya a la entrega y verifica si la has completado.',
        'Realiza una autoevaluación con evidencias y acuerda un objetivo alcanzable para el próximo proyecto.'
      ],
      [
        'Gestiona un proyecto con revisiones propias y explica cómo has reajustado tiempos, recursos y prioridades.',
        'Anticipa el efecto de tus decisiones sobre otras personas y acuerda medidas para reducir problemas.',
        'Diseña un sistema de seguimiento que permita detectar retrasos sin depender de recordatorios externos.',
        'Compara tu autoevaluación con evidencias y utiliza las diferencias para mejorar tu planificación.',
        'Asume una responsabilidad nueva con límites claros y comunica qué apoyo necesitarías ante un imprevisto.',
        'Revisa un compromiso incumplido, acuerda cómo repararlo y comprueba que la medida se haya completado.',
        'Ayuda a un compañero a organizar su trabajo sin sustituir sus decisiones ni realizar sus tareas.',
        'Documenta una estrategia de organización que te funcione y comprueba si es útil en otro contexto.'
      ]
    ]
  };
  const groups = [
    [/innova|emprend/, 'innovation'], [/equipo/, 'teamwork'],
    [/comunica/, 'communication'], [/digital/, 'digital'],
    [/entorno|adaptaci/, 'adaptation'], [/autonom|responsa/, 'autonomy']
  ];
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function level(score) {
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 10) throw new RangeError('Nota fuera de 0–10');
    return score >= 8.5 ? 3 : score >= 7 ? 2 : score >= 5 ? 1 : 0;
  }
  function createSelector(random = Math.random) {
    const bags = new Map();
    return function select(name, score) {
      const tier = level(score);
      const normalized = normalize(name);
      const group = groups.find(([pattern]) => pattern.test(normalized))?.[1];
      if (!group) return 'Elige con tu docente una actividad y acuerda cómo comprobar el progreso.';
      const key = `${group}:${tier}`;
      let state = bags.get(key);
      if (!state) { state = { remaining: [], last: null }; bags.set(key, state); }
      if (!state.remaining.length) {
        const configured = root.LOCAL_ADVICE_BANK?.[group]?.[tier];
        state.remaining = [...(Array.isArray(configured) && configured.length && configured.every(t => typeof t === 'string' && t.trim()) ? configured : bank[group][tier])];
        for (let i = state.remaining.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [state.remaining[i], state.remaining[j]] = [state.remaining[j], state.remaining[i]];
        }
        const end = state.remaining.length - 1;
        if (end > 0 && state.remaining[end] === state.last) [state.remaining[0], state.remaining[end]] = [state.remaining[end], state.remaining[0]];
      }
      state.last = state.remaining.pop();
      return state.last;
    };
  }
  const api = { bank, level, createSelector, select: createSelector() };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdviceBank = api;
})(globalThis);
