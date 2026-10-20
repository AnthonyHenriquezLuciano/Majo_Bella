/* Servicios: por categoría, con precio, duración y promociones; se añaden para reservar varios a la vez */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { space } from '@majobella/core';
import { Chip, Header, Notice, Screen, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { ServiceCard } from '@/components/service-card';
import { CartBar } from '@/components/cart-bar';

export default function Servicios() {
  const { studio, cart, refreshCatalog, catalogError } = useApp();
  const [cat, setCat] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const cats = studio.categories();
  const list = studio.services.filter((s) => !cat || s.category === cat);
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refreshCatalog(); setRefreshing(false); }} bottom={cart.length ? 80 : 0} testID="servicios">
        <Header kicker="Menú" title="Servicios" />
        <T v="muted" style={{ marginTop: -12, marginBottom: space.md }}>Añade uno o varios servicios y reserva todo en la misma cita.</T>
        {cats.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: space.md }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
            <Chip label="Todos" selected={!cat} onPress={() => setCat('')} />
            {cats.map((c) => <Chip key={c} label={c} selected={cat === c} onPress={() => setCat(c)} />)}
          </ScrollView>
        ) : null}
        {catalogError && !studio.catalog ? <Notice kind="warn" style={{ marginBottom: space.md }}>Mostrando precios de referencia. Revisa tu conexión para ver los precios del día.</Notice> : null}
        {list.map((s) => <ServiceCard key={s.id} s={s} />)}
      </Screen>
      <CartBar />
    </View>
  );
}
