/* MAJOBELLA Clientas · Proyecto Expo independiente.
   El ID se obtiene al conectar ESTA app a EAS (eas init); no lo inventamos.
   En GitHub Actions se inyecta EXPO_PUBLIC_EAS_PROJECT_ID por cada APK.
   Sin ID Expo, reservas/autenticación Supabase siguen disponibles; push remotas no. */
module.exports = ({ config }) => {
  const projectId = String(process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '').trim();
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID debe ser un UUID de Expo EAS.');
  }
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      eas: {
        ...((config.extra && config.extra.eas) || {}),
        ...(projectId ? { projectId } : {}),
      },
    },
  };
};
