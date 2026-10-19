/* ==========================================================================
   MAJOBELLA · Servicios
   Edita nombre, descripción, duración (minutos) y precio de cada servicio.
   IMPORTANTE: los precios, duraciones y textos de detalle son de ejemplo. Revísalos y ajústalos
   a cómo trabaja MAJOBELLA antes de publicar.

   Campos:
     category     agrupa los servicios en las pestañas del menú
     priceFrom    true muestra "Desde" delante del precio
     idealFor     para quién es (se muestra en "Ver detalles")
     includes     qué incluye la cita, paso a paso
     results      cuánto suele durar el resultado o cada cuánto repetir
     prep         cómo prepararse (aparece también en la confirmación de la cita)
     aftercare    cuidados después
   Para añadir un servicio, copia un bloque completo y cambia el id.
   ========================================================================== */
window.MAJOBELLA_SERVICES = [
  {
    id: 'faciales',
    category: 'Faciales',
    name: 'Faciales',
    description: 'Tratamientos faciales enfocados en el cuidado, limpieza y apariencia saludable de la piel.',
    durationMinutes: 60,
    price: 2500,
    priceFrom: false,
    idealFor: 'Piel opaca, poros visibles o si quieres empezar una rutina de cuidado con guía profesional.',
    includes: ['Análisis de tu tipo de piel', 'Limpieza profunda y exfoliación', 'Extracción suave si hace falta', 'Mascarilla e hidratación', 'Recomendaciones para casa'],
    results: 'Piel más limpia y luminosa desde la primera sesión. Se recomienda repetir cada 4 a 6 semanas.',
    prep: ['Si puedes, ven sin maquillaje.', 'Avísanos si usas retinol, ácidos o algún tratamiento de piel.'],
    aftercare: ['Usa protector solar los días siguientes.', 'Evita maquillaje pesado durante 12 horas.'],
  },
  {
    id: 'cejas',
    category: 'Cejas',
    name: 'Cejas',
    description: 'Diseño y definición de cejas respetando la forma natural del rostro.',
    durationMinutes: 45,
    price: 900,
    priceFrom: false,
    idealFor: 'Si quieres cejas más ordenadas y definidas sin perder tu forma natural.',
    includes: ['Medición según la estructura de tu rostro', 'Diseño acordado contigo antes de empezar', 'Depilación y perfilado', 'Acabado con producto si lo deseas'],
    results: 'El diseño se mantiene de 3 a 4 semanas, según el crecimiento de tu vello.',
    prep: ['No depiles tus cejas durante 2 a 3 semanas antes, así hay vello con el que diseñar.'],
    aftercare: ['Evita exfoliar la zona durante 24 horas.', 'Si se enrojece un poco, es normal y pasa en unas horas.'],
  },
  {
    id: 'pestanas',
    category: 'Pestañas',
    name: 'Pestañas',
    description: 'Servicios especializados para realzar la mirada.',
    durationMinutes: 60,
    price: 1800,
    priceFrom: false,
    idealFor: 'Si quieres una mirada más abierta y definida sin máscara todos los días.',
    includes: ['Evaluación de tus pestañas naturales', 'Elección del estilo según la forma de tus ojos', 'Aplicación con productos para la zona ocular', 'Indicaciones de cuidado'],
    results: 'Según la técnica, el resultado dura entre 2 y 6 semanas.',
    prep: ['Ven sin máscara de pestañas ni delineador.', 'Si usas lentes de contacto, tráete el estuche para quitártelos.'],
    aftercare: ['No mojes las pestañas durante las primeras 24 horas.', 'Evita productos con aceite en el contorno de ojos.'],
  },
  {
    id: 'micropigmentacion',
    category: 'Micropigmentación',
    name: 'Micropigmentación',
    description: 'Diseño y pigmentación de cejas con resultados naturales y personalizados.',
    durationMinutes: 150,
    price: 12000,
    priceFrom: false,
    idealFor: 'Si tienes cejas escasas o asimétricas y quieres despertarte con ellas definidas.',
    includes: ['Consulta y preguntas de salud previas', 'Diseño y prueba de forma antes de pigmentar', 'Elección del tono según tu piel y vello', 'Pigmentación', 'Plan de retoque'],
    results: 'Suele durar entre 1 y 2 años. Normalmente se hace un retoque entre 4 y 6 semanas después.',
    prep: ['Evita alcohol y cafeína en exceso las 24 horas previas.', 'Si estás embarazada, lactando o tomas medicamentos, coméntalo al reservar.', 'No tomes sol intenso en la zona la semana anterior.'],
    aftercare: ['No mojes ni maquilles la zona durante 7 días.', 'Evita sol directo, piscina y sauna hasta que cicatrice.', 'No retires las costritas: caen solas.'],
  },
  {
    id: 'depilacion',
    category: 'Depilación',
    name: 'Depilación facial y corporal',
    description: 'Servicios de depilación para diferentes zonas del rostro y cuerpo.',
    durationMinutes: 30,
    price: 500,
    priceFrom: true,
    idealFor: 'Rostro, axilas, brazos, piernas y otras zonas. El precio final depende de la zona.',
    includes: ['Preparación y limpieza de la piel', 'Depilación de la zona elegida', 'Calmante al terminar'],
    results: 'De 3 a 5 semanas sin vello, según la zona y tu crecimiento.',
    prep: ['El vello debe medir al menos medio centímetro.', 'No exfolies la zona el mismo día.'],
    aftercare: ['Evita sol directo y piscina durante 24 a 48 horas.', 'Exfolia suavemente desde el tercer día para evitar vellos encarnados.'],
  },
];
