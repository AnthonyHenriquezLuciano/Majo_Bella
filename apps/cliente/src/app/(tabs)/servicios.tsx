/* Servicios: por categoría, con precio, duración y promociones; se añaden para reservar varios a la vez */
import { useState } from 'react';
import { View } from 'react-native';
import { space } from '@majobella/core';
import { Header, Notice, Screen, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { CatalogBrowser } from '@/components/catalog-browser';
import { CartBar } from '@/components/cart-bar';

export default function Servicios() {
  const { studio, cart, refreshCatalog, catalogError } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refreshCatalog(); setRefreshing(false); }} bottom={cart.length ? 80 : 0} testID="servicios">
        <Header kicker="Menú" title="Servicios" />
        <T v="muted" style={{ marginTop: -12, marginBottom: space.md }}>Añade uno o varios servicios y reserva todo en la misma cita.</T>
        {catalogError && !studio.catalog ? <Notice kind="warn" style={{ marginBottom: space.md }}>Mostrando precios de referencia. Revisa tu conexión para ver los precios del día.</Notice> : null}
        <CatalogBrowser />
      </Screen>
      <CartBar />
    </View>
  );
}
