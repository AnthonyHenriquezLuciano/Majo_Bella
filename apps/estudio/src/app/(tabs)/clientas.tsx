/* Clientas: búsqueda por nombre, teléfono o correo, con su número de visitas */
import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, space } from '@majobella/core';
import { Empty, Header, Icon, ListRow, Row, Screen, T } from '@majobella/ui';
import { useStudio } from '@/lib/studio-state';

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Clientas() {
  const { data, loading, refresh } = useStudio();
  const router = useRouter();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    if (!data) return [];
    const byKey: Record<string, { key: string; name: string; phone: string; email: string; visits: number; last: string }> = {};
    data.items.forEach((a) => {
      if (!a.clientKey) return;
      const c = byKey[a.clientKey] || (byKey[a.clientKey] = { key: a.clientKey, name: a.client.name, phone: a.client.phone, email: a.client.email, visits: 0, last: '' });
      if (a.status === 'completada') c.visits++;
      if (a.date > c.last && a.status !== 'cancelada' && a.status !== 'expirada') c.last = a.date;
    });
    data.clients.forEach((c) => { const x = byKey[c.clave]; if (x) { x.name = c.nombre || x.name; x.phone = c.telefono || x.phone; } else byKey[c.clave] = { key: c.clave, name: c.nombre, phone: c.telefono, email: c.correo, visits: 0, last: '' }; });
    const n = norm(q).trim();
    return Object.values(byKey)
      .filter((c) => !n || norm(`${c.name} ${c.phone} ${c.email}`).includes(n) || c.phone.replace(/\D/g, '').includes(n.replace(/\D/g, '') || '§'))
      .sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
  }, [data, q]);
  return (
    <Screen refreshing={loading} onRefresh={refresh} testID="clientas">
      <Header kicker={data ? `${list.length} clientas` : ''} title="Clientas" />
      <Row gap={10} style={{ borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12, marginBottom: space.md }}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Nombre, teléfono o correo" placeholderTextColor={colors.faint} style={{ flex: 1, minHeight: 48, fontFamily: fonts.serif, fontSize: 16, color: colors.ink }} autoCorrect={false} accessibilityLabel="Buscar clienta" />
      </Row>
      {data && !list.length ? <Empty icon="user" title="Sin resultados" /> : null}
      {list.slice(0, 200).map((c) => (
        <ListRow key={c.key} title={c.name || c.email || c.phone} sub={[c.phone, c.visits ? `${c.visits} ${c.visits === 1 ? 'visita' : 'visitas'}` : 'Nueva'].filter(Boolean).join(' · ')} onPress={() => router.push({ pathname: '/clienta/[clave]', params: { clave: c.key } })} />
      ))}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
