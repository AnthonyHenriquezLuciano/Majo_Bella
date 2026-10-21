/* Generado por tools/build-core-data.mjs a partir de js/config.js, js/data/services.js y js/data/faq.js.
   No editar a mano: cambia los archivos de la web y corre «npm run web:build». */
import type { PublicConfig, ServiceInfo, FaqItem } from './types';

export const CONFIG: PublicConfig = {
  "brand": {
    "name": "MAJOBELLA",
    "slogan": "MÁS YO, MÁS BELLA."
  },
  "whatsapp": {
    "number": "18299784986",
    "display": "829-978-4986",
    "greeting": "Hola, tengo una pregunta sobre MAJOBELLA."
  },
  "social": {
    "instagram": "",
    "tiktok": ""
  },
  "contact": {
    "address": "Santo Domingo, República Dominicana",
    "email": "",
    "mapsUrl": "https://maps.app.goo.gl/d4uX28GuoKuyHuhf8",
    "lat": 18.465401,
    "lng": -69.9737548
  },
  "currency": {
    "symbol": "RD$",
    "locale": "es-DO"
  },
  "schedule": {
    "timeZone": "America/Santo_Domingo",
    "utcOffset": "-04:00",
    "hours": {
      "0": {
        "open": "10:00",
        "close": "13:00"
      },
      "1": null,
      "2": {
        "open": "10:00",
        "close": "17:00"
      },
      "3": {
        "open": "10:00",
        "close": "17:00"
      },
      "4": {
        "open": "10:00",
        "close": "17:00"
      },
      "5": {
        "open": "10:00",
        "close": "17:00"
      },
      "6": {
        "open": "10:00",
        "close": "17:00"
      }
    },
    "slotStepMinutes": 30,
    "minNoticeHours": 3,
    "maxDaysAhead": 60,
    "blockedDates": []
  },
  "policies": {
    "changeHours": 24,
    "arriveEarlyMinutes": 10
  },
  "payments": {
    "depositPercent": 50,
    "usdRate": 63,
    "holdMinutes": 15
  },
  "webUrl": "https://anthonyhenriquezluciano.github.io/Majo_Bella/",
  "apiUrl": "https://thpjpsogcmqkemlxajcm.supabase.co/functions/v1/api"
};

export const SERVICES: ServiceInfo[] = [
  {
    "id": "faciales",
    "category": "Faciales",
    "name": "Faciales",
    "description": "Tratamientos faciales enfocados en el cuidado, limpieza y apariencia saludable de la piel.",
    "durationMinutes": 60,
    "price": 2500,
    "priceFrom": false,
    "idealFor": "Piel opaca, poros visibles o si quieres empezar una rutina de cuidado con guía profesional.",
    "includes": [
      "Análisis de tu tipo de piel",
      "Limpieza profunda y exfoliación",
      "Extracción suave si hace falta",
      "Mascarilla e hidratación",
      "Recomendaciones para casa"
    ],
    "results": "Piel más limpia y luminosa desde la primera sesión. Se recomienda repetir cada 4 a 6 semanas.",
    "prep": [
      "Si puedes, ven sin maquillaje.",
      "Avísanos si usas retinol, ácidos o algún tratamiento de piel."
    ],
    "aftercare": [
      "Usa protector solar los días siguientes.",
      "Evita maquillaje pesado durante 12 horas."
    ]
  },
  {
    "id": "cejas",
    "category": "Cejas",
    "name": "Cejas",
    "description": "Diseño y definición de cejas respetando la forma natural del rostro.",
    "durationMinutes": 45,
    "price": 900,
    "priceFrom": false,
    "idealFor": "Si quieres cejas más ordenadas y definidas sin perder tu forma natural.",
    "includes": [
      "Medición según la estructura de tu rostro",
      "Diseño acordado contigo antes de empezar",
      "Depilación y perfilado",
      "Acabado con producto si lo deseas"
    ],
    "results": "El diseño se mantiene de 3 a 4 semanas, según el crecimiento de tu vello.",
    "prep": [
      "No depiles tus cejas durante 2 a 3 semanas antes, así hay vello con el que diseñar."
    ],
    "aftercare": [
      "Evita exfoliar la zona durante 24 horas.",
      "Si se enrojece un poco, es normal y pasa en unas horas."
    ]
  },
  {
    "id": "pestanas",
    "category": "Pestañas",
    "name": "Pestañas",
    "description": "Servicios especializados para realzar la mirada.",
    "durationMinutes": 60,
    "price": 1800,
    "priceFrom": false,
    "idealFor": "Si quieres una mirada más abierta y definida sin máscara todos los días.",
    "includes": [
      "Evaluación de tus pestañas naturales",
      "Elección del estilo según la forma de tus ojos",
      "Aplicación con productos para la zona ocular",
      "Indicaciones de cuidado"
    ],
    "results": "Según la técnica, el resultado dura entre 2 y 6 semanas.",
    "prep": [
      "Ven sin máscara de pestañas ni delineador.",
      "Si usas lentes de contacto, tráete el estuche para quitártelos."
    ],
    "aftercare": [
      "No mojes las pestañas durante las primeras 24 horas.",
      "Evita productos con aceite en el contorno de ojos."
    ]
  },
  {
    "id": "micropigmentacion",
    "category": "Micropigmentación",
    "name": "Micropigmentación",
    "description": "Diseño y pigmentación de cejas con resultados naturales y personalizados.",
    "durationMinutes": 150,
    "price": 12000,
    "priceFrom": false,
    "idealFor": "Si tienes cejas escasas o asimétricas y quieres despertarte con ellas definidas.",
    "includes": [
      "Consulta y preguntas de salud previas",
      "Diseño y prueba de forma antes de pigmentar",
      "Elección del tono según tu piel y vello",
      "Pigmentación",
      "Plan de retoque"
    ],
    "results": "Suele durar entre 1 y 2 años. Normalmente se hace un retoque entre 4 y 6 semanas después.",
    "prep": [
      "Evita alcohol y cafeína en exceso las 24 horas previas.",
      "Si estás embarazada, lactando o tomas medicamentos, coméntalo al reservar.",
      "No tomes sol intenso en la zona la semana anterior."
    ],
    "aftercare": [
      "No mojes ni maquilles la zona durante 7 días.",
      "Evita sol directo, piscina y sauna hasta que cicatrice.",
      "No retires las costritas: caen solas."
    ]
  },
  {
    "id": "depilacion",
    "category": "Depilación",
    "name": "Depilación facial y corporal",
    "description": "Servicios de depilación para diferentes zonas del rostro y cuerpo.",
    "durationMinutes": 30,
    "price": 500,
    "priceFrom": true,
    "idealFor": "Rostro, axilas, brazos, piernas y otras zonas. El precio final depende de la zona.",
    "includes": [
      "Preparación y limpieza de la piel",
      "Depilación de la zona elegida",
      "Calmante al terminar"
    ],
    "results": "De 3 a 5 semanas sin vello, según la zona y tu crecimiento.",
    "prep": [
      "El vello debe medir al menos medio centímetro.",
      "No exfolies la zona el mismo día."
    ],
    "aftercare": [
      "Evita sol directo y piscina durante 24 a 48 horas.",
      "Exfolia suavemente desde el tercer día para evitar vellos encarnados."
    ]
  }
];

export const FAQ: FaqItem[] = [
  {
    "q": "¿Necesito crear una cuenta para reservar?",
    "a": "No. Puedes reservar como invitada en menos de un minuto. Si inicias sesión con Google, tus datos se completan solos y ves tus citas desde cualquier dispositivo."
  },
  {
    "q": "Es mi primera vez, ¿qué servicio elijo?",
    "a": "Abre \"Ver detalles\" en cada servicio para ver para quién es y qué incluye. Si dudas, reserva el que más se acerque y lo ajustamos contigo al llegar, o escríbenos por WhatsApp."
  },
  {
    "q": "¿Puedo combinar varios servicios en la misma cita?",
    "a": "Sí. Añade todos los que quieras y verás el precio y el tiempo total antes de elegir la hora. Solo te mostramos horarios donde caben todos."
  },
  {
    "q": "¿Cómo se aparta la cita?",
    "a": "Pagas un depósito con PayPal (con tarjeta o con tu cuenta; el porcentaje depende del servicio y lo ves antes de pagar) y la cita queda confirmada al instante; te llega un correo. El resto lo pagas al terminar, en efectivo, por transferencia o con PayPal desde la sección Citas. Si tienes un código de descuento o una tarjeta de regalo, escríbelo en el resumen de tu cita antes de pagar."
  },
  {
    "q": "¿Por qué el depósito aparece en dólares?",
    "a": "PayPal no cobra en pesos dominicanos, así que el depósito se convierte a dólares con la tasa del día que fija el estudio. Siempre ves el monto en RD$ y en US$ antes de pagar."
  },
  {
    "q": "¿Cómo cambio o cancelo mi cita?",
    "a": "Desde la sección Citas puedes cancelar. Si lo haces con al menos 24 horas de aviso te devolvemos el depósito completo en PayPal; con menos tiempo el depósito no se devuelve. Para cambiar la fecha, cancela y reserva de nuevo, o escríbenos por WhatsApp."
  },
  {
    "q": "¿Duele la micropigmentación?",
    "a": "Cada piel es distinta. La mayoría de las clientas lo describe como una molestia leve. Antes de empezar te explicamos cada paso y revisamos tus preguntas de salud."
  },
  {
    "q": "¿Cómo me preparo para mi cita?",
    "a": "Cada servicio tiene su guía en \"Ver detalles\", y al confirmar te la mostramos de nuevo junto con tu cita. Te recomendamos llegar 10 minutos antes."
  }
];
