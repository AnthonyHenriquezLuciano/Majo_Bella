/* Resumen de lo elegido (aparece al añadir servicios): total de tiempo y precio, con acceso a reservar */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fmtDuration, fmtPrice, fonts, space } from '@majobella/core';
import { Icon, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';

export function CartBar() {
  const { cart, studio, setCart } = useApp();
  const router = useRouter();
  if (!cart.length) return null;
  const t = studio.totals(cart);
  const p = studio.pricing(cart);
  return (
    <View style={S.wrap}>
      <Pressable testID="cart-go" onPress={() => router.navigate('/reservar')} accessibilityRole="button" accessibilityLabel="Ir a reservar" style={({ pressed }) => [S.bar, pressed && { opacity: 0.9 }]}>
        <View style={{ flex: 1 }}>
          <T v="small" style={{ color: colors.paper, fontFamily: fonts.serifSemi }} numberOfLines={1}>{t.items.map((s) => s.name).join(' + ')}</T>
          <T v="small" style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>{`${t.items.length} ${t.items.length === 1 ? 'servicio' : 'servicios'} · ${fmtDuration(t.minutes)} · ${t.hasFrom ? 'Desde ' : ''}${fmtPrice(p.totalRD)}`}</T>
        </View>
        <T v="label" style={{ color: colors.paper }}>Reservar</T>
        <Icon name="arrow-right" size={18} color={colors.paper} />
      </Pressable>
      <Pressable onPress={() => setCart([])} accessibilityRole="button" accessibilityLabel="Vaciar selección" hitSlop={8} style={S.clear}><Icon name="close" size={16} color={colors.ink} /></Pressable>
    </View>
  );
}

const S = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, bottom: space.sm },
  bar: { backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingLeft: 18, paddingRight: 16 },
  clear: { position: 'absolute', top: -12, left: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
