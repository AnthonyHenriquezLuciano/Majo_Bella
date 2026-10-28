/* Barra de abajo: Inicio · Servicios · Reservar (al centro) · Mis Citas · Cuenta */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { colors, fonts } from '@majobella/core';
import { Icon, type IconName } from '@majobella/ui';
import { useApp } from '@/lib/app-state';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Inicio', icon: 'home' },
  servicios: { label: 'Servicios', icon: 'sparkle' },
  reservar: { label: 'Reservar', icon: 'plus' },
  citas: { label: 'Mis Citas', icon: 'calendar' },
  cuenta: { label: 'Cuenta', icon: 'user' },
};

export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const ins = useSafeAreaInsets();
  const { cart, appointments } = useApp();
  const upcoming = appointments.filter((a) => (a.status === 'confirmada' || a.status === 'por-confirmar' || a.status === 'retenida') && new Date(a.end).getTime() > Date.now()).length;
  return (
    <View style={[S.bar, { paddingBottom: Math.max(ins.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const t = TABS[route.name];
        if (!t) return null;
        const focused = state.index === i;
        const go = () => {
          const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !ev.defaultPrevented) navigateToTab(route.key);
        };
        if (route.name === 'reservar') {
          return (
            <Pressable key={route.key} testID="tab-reservar" onPress={go} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={cart.length ? `Reservar, ${cart.length} servicios elegidos` : 'Reservar'} style={S.item}>
              <View style={[S.center, focused && { backgroundColor: colors.black }]}>
                <Icon name="plus" size={26} color={colors.paper} stroke={1.8} />
                {cart.length ? <View style={S.badge}><Text style={S.badgeText}>{cart.length}</Text></View> : null}
              </View>
              <Text style={[S.label, focused && S.labelOn]} maxFontSizeMultiplier={1.2}>{t.label}</Text>
            </Pressable>
          );
        }
        return (
          <Pressable key={route.key} testID={`tab-${route.name}`} onPress={go} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={t.label} style={S.item}>
            <View>
              <Icon name={t.icon} size={23} color={focused ? colors.ink : colors.faint} stroke={focused ? 1.7 : 1.4} />
              {route.name === 'citas' && upcoming ? <View style={S.dot} /> : null}
            </View>
            <Text style={[S.label, focused && S.labelOn]} maxFontSizeMultiplier={1.2}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const S = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, minHeight: 50 },
  label: { fontFamily: fonts.serif, fontSize: 11.5, color: colors.faint, letterSpacing: 0.2 },
  labelOn: { color: colors.ink, fontFamily: fonts.serifSemi },
  center: { width: 50, height: 50, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: -22, borderWidth: 3, borderColor: colors.paper },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontFamily: fonts.serifSemi, fontSize: 11, color: colors.ink },
  dot: { position: 'absolute', top: -1, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink, borderWidth: 1.5, borderColor: colors.paper },
});
