/* Barra de abajo del estudio: Agenda · Revisar · Clientas · Dinero · Más */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { colors, fonts } from '@majobella/core';
import { Icon, type IconName } from '@majobella/ui';
import { isPendingTransfer, isRefundPending, useStudio } from '@/lib/studio-state';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Agenda', icon: 'calendar' },
  revisar: { label: 'Revisar', icon: 'bell' },
  clientas: { label: 'Clientas', icon: 'user' },
  dinero: { label: 'Dinero', icon: 'card' },
  mas: { label: 'Más', icon: 'sparkle' },
};

export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const ins = useSafeAreaInsets();
  const { data } = useStudio();
  const pending = data ? data.items.filter((a) => isPendingTransfer(a) || isRefundPending(a)).length + data.errors.filter((e) => !e.resuelto).length : 0;
  return (
    <View style={[S.bar, { paddingBottom: Math.max(ins.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const t = TABS[route.name];
        if (!t) return null;
        const focused = state.index === i;
        return (
          <Pressable key={route.key} testID={`tab-${route.name}`} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={t.label}
            onPress={() => { const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!focused && !ev.defaultPrevented) navigateToTab(route.key); }}
            style={S.item}>
            <View>
              <Icon name={t.icon} size={23} color={focused ? colors.ink : colors.faint} stroke={focused ? 1.7 : 1.4} />
              {route.name === 'revisar' && pending ? <View style={S.badge}><Text style={S.badgeText}>{pending > 9 ? '9+' : pending}</Text></View> : null}
            </View>
            <Text style={[S.label, focused && S.on]} maxFontSizeMultiplier={1.2}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const S = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', gap: 4, minHeight: 50, justifyContent: 'flex-end' },
  label: { fontFamily: fonts.serif, fontSize: 11.5, color: colors.faint },
  on: { color: colors.ink, fontFamily: fonts.serifSemi },
  badge: { position: 'absolute', top: -6, right: -12, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontFamily: fonts.serifSemi, fontSize: 10.5, color: colors.paper },
});
