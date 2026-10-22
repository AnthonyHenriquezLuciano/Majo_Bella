/* MAJOBELLA · Catálogo navegable: categoría → servicio → subservicio.
   Los contenedores nunca se añaden al carrito; solo las opciones con precio. */
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors, space } from '@majobella/core';
import { T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { ServiceCard } from './service-card';

export function CatalogBrowser() {
  const { studio } = useApp();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cats = studio.catalogCategories.length
    ? studio.catalogCategories
    : studio.categories().map((name, i) => ({ id: 'local-' + i, name }));
  const current = cats.find((c) => c.id === categoryId);
  const items = current
    ? studio.services.filter((s) => s.categoryId === current.id || s.category === current.name)
    : [];
  const groups = current ? studio.serviceGroups.filter((g) => g.categoryId === current.id) : [];
  const direct = items.filter((s) => !s.parentId || !groups.some((g) => g.id === s.parentId));

  if (!current) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: space.md }}>
        {cats.map((c) => {
          const total = studio.services.filter((s) => s.categoryId === c.id || s.category === c.name).length;
          return (
            <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Ver servicios de ${c.name}`}
              onPress={() => { setCategoryId(c.id); setExpanded(null); }}
              style={({ pressed }) => ({
                width: '48%', flexGrow: 1, minHeight: 152, padding: 18,
                borderRadius: 26, backgroundColor: pressed ? '#111111' : '#f7f7f7',
                borderWidth: 1, borderColor: '#dddddd',
                justifyContent: 'space-between', overflow: 'hidden',
              })}>
              <Image source={require('../../assets/images/monograma.png')}
                resizeMode="contain" style={{ position: 'absolute', width: 120, height: 120, opacity: 0.08, alignSelf: 'center', top: 12 }} />
              <T v="small" style={{ color: colors.muted }}>MAJOBELLA</T>
              <View>
                <T v="h2" style={{ fontSize: 23 }}>{c.name}</T>
                <T v="small" style={{ color: colors.muted }}>{total} {total === 1 ? 'opción' : 'opciones'}</T>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => { setCategoryId(null); setExpanded(null); }} style={{ paddingVertical: 10, alignSelf: 'flex-start' }}>
        <T v="small" style={{ textDecorationLine: 'underline' }}>Todas las categorías</T>
      </Pressable>
      <T v="h2" style={{ marginTop: 8, marginBottom: 16 }}>{current.name}</T>
      {groups.map((g) => {
        const choices = items.filter((s) => s.parentId === g.id);
        const open = expanded === g.id;
        return (
          <View key={g.id} style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.line, marginBottom: 12, overflow: 'hidden' }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
              onPress={() => setExpanded(open ? null : g.id)}
              style={{ padding: 18, backgroundColor: colors.paper }}>
              <T v="h3">{g.name}</T>
              {g.description ? <T v="muted" style={{ marginTop: 4 }}>{g.description}</T> : null}
              <T v="small" style={{ marginTop: 8, textDecorationLine: 'underline' }}>{open ? 'Ocultar opciones' : `Ver ${choices.length} opciones`}</T>
            </Pressable>
            {open ? <View style={{ padding: 12, backgroundColor: '#f7f7f7' }}>
              {choices.map((s) => <ServiceCard key={s.id} s={s} />)}
              {!choices.length ? <T v="muted">Aún no hay opciones disponibles.</T> : null}
            </View> : null}
          </View>
        );
      })}
      {direct.map((s) => <ServiceCard key={s.id} s={s} />)}
      {!groups.length && !direct.length ? <T v="muted">Aún no hay servicios disponibles.</T> : null}
    </View>
  );
}
