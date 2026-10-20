/* MAJOBELLA · Piezas de pantalla de las apps (blanco y negro, serif, líneas finas, como la web) */
import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type ScrollViewInstance, type TextInputInstance, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, space } from '@majobella/core';
import { Icon, type IconName } from './icon';

/* ---------- Texto ---------- */
type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'kicker' | 'label' | 'muted' | 'price' | 'script';
const TX: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40, color: colors.ink, letterSpacing: -0.3 },
  title: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 33, color: colors.ink },
  h2: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 27, color: colors.ink },
  h3: { fontFamily: fonts.serifSemi, fontSize: 16.5, lineHeight: 22, color: colors.ink },
  body: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 24, color: colors.text },
  small: { fontFamily: fonts.serif, fontSize: 14, lineHeight: 20, color: colors.text },
  kicker: { fontFamily: fonts.serifSemi, fontSize: 11, lineHeight: 14, letterSpacing: 2.6, textTransform: 'uppercase', color: colors.muted },
  label: { fontFamily: fonts.serifSemi, fontSize: 13.5, lineHeight: 18, color: colors.ink },
  muted: { fontFamily: fonts.serif, fontSize: 14, lineHeight: 20, color: colors.muted },
  price: { fontFamily: fonts.serifSemi, fontSize: 16, lineHeight: 22, color: colors.ink, fontVariant: ['tabular-nums'] },
  script: { fontFamily: fonts.serifItalic, fontSize: 22, lineHeight: 28, color: colors.ink },
};
export function T({ v = 'body', style, ...rest }: TextProps & { v?: Variant }) {
  return <Text {...rest} style={[TX[v], style]} maxFontSizeMultiplier={1.6} />;
}

/* ---------- Botones ---------- */
type BtnKind = 'solid' | 'outline' | 'ghost' | 'link' | 'danger';
export function Button({
  title, onPress, kind = 'solid', icon, iconRight, loading, disabled, style, small, full = true, testID, accessibilityLabel,
}: {
  title: string; onPress?: () => void; kind?: BtnKind; icon?: IconName; iconRight?: IconName; loading?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; small?: boolean; full?: boolean; testID?: string; accessibilityLabel?: string;
}) {
  const fg = kind === 'solid' ? colors.paper : kind === 'danger' ? colors.error : colors.ink;
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        S.btn, small && S.btnSmall, full && S.btnFull,
        kind === 'solid' && S.btnSolid, (kind === 'outline' || kind === 'danger') && S.btnOutline, kind === 'danger' && { borderColor: colors.error },
        (kind === 'ghost' || kind === 'link') && S.btnGhost, kind === 'link' && S.btnLink,
        pressed && !off && { opacity: 0.72 }, off && { opacity: 0.45 }, style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={small ? 17 : 19} color={fg} /> : null}
          <Text style={[S.btnText, small && { fontSize: 14 }, { color: fg }, kind === 'link' && S.btnLinkText]} numberOfLines={1} maxFontSizeMultiplier={1.4}>{title}</Text>
          {iconRight ? <Icon name={iconRight} size={small ? 16 : 18} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, size = 22, style, color }: { name: IconName; onPress: () => void; label: string; size?: number; style?: StyleProp<ViewStyle>; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={({ pressed }) => [S.iconBtn, pressed && { opacity: 0.6 }, style]}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

/* ---------- Contenedores ---------- */
export function Card({ children, style, onPress, testID, dark }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string; dark?: boolean }) {
  const base = [S.card, dark && S.cardDark, style];
  if (!onPress) return <View testID={testID} style={base}>{children}</View>;
  return <Pressable testID={testID} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...base, pressed && { opacity: 0.8 }]}>{children}</Pressable>;
}
export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => <View style={[S.divider, style]} />;
export const Row = ({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
export const Gap = ({ h = space.md }: { h?: number }) => <View style={{ height: h }} />;

export function Section({ kicker, title, children, style, right }: { kicker?: string; title?: string; children?: ReactNode; style?: StyleProp<ViewStyle>; right?: ReactNode }) {
  return (
    <View style={[{ marginTop: space.xl }, style]}>
      {(kicker || title) ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.md, gap: space.sm }}>
          <View style={{ flex: 1 }}>
            {kicker ? <T v="kicker" style={{ marginBottom: 6 }}>{kicker}</T> : null}
            {title ? <T v="h2" accessibilityRole="header">{title}</T> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* Pantalla con desplazamiento, margen seguro y "jalar para actualizar" */
export const Screen = forwardRef<ScrollViewInstance, {
  children: ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; bottom?: number; style?: StyleProp<ViewStyle>; top?: boolean; footer?: ReactNode; testID?: string;
}>(function Screen({ children, refreshing, onRefresh, padded = true, bottom = 0, style, top = true, footer, testID }, ref) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }} testID={testID}>
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingTop: top ? ins.top + space.md : space.md, paddingBottom: bottom + space.xl, paddingHorizontal: padded ? 20 : 0 }, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.ink} colors={[colors.ink]} /> : undefined}>
        {children}
      </ScrollView>
      {footer}
    </View>
  );
});

/* Encabezado simple con regreso */
export function Header({ title, onBack, right, kicker }: { title: string; onBack?: () => void; right?: ReactNode; kicker?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg }}>
      {onBack ? <IconButton name="chevron-left" onPress={onBack} label="Volver" style={{ marginLeft: -8 }} /> : null}
      <View style={{ flex: 1 }}>
        {kicker ? <T v="kicker" style={{ marginBottom: 4 }}>{kicker}</T> : null}
        <T v="title" accessibilityRole="header" numberOfLines={2}>{title}</T>
      </View>
      {right}
    </View>
  );
}

/* ---------- Campos ---------- */
export const Field = forwardRef<TextInputInstance, TextInputProps & { label: string; error?: string; hint?: string; optional?: boolean }>(
  function Field({ label, error, hint, optional, style, onFocus, onBlur, ...rest }, ref) {
    const [focus, setFocus] = useState(false);
    return (
      <View style={{ marginBottom: space.md }}>
        <T v="label" style={{ marginBottom: 6 }}>{label}{optional ? <T v="muted"> (opcional)</T> : null}</T>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.faint}
          {...rest}
          accessibilityLabel={label}
          onFocus={(e) => { setFocus(true); if (onFocus) onFocus(e); }}
          onBlur={(e) => { setFocus(false); if (onBlur) onBlur(e); }}
          style={[S.input, focus && { borderColor: colors.ink }, !!error && { borderColor: colors.error }, rest.multiline && { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 }, style]}
          maxFontSizeMultiplier={1.4}
        />
        {error ? <T v="small" style={{ color: colors.error, marginTop: 6 }} accessibilityLiveRegion="polite">{error}</T> : hint ? <T v="muted" style={{ marginTop: 6, fontSize: 13 }}>{hint}</T> : null}
      </View>
    );
  });

/* Casilla (aceptar condiciones, recordar datos…) */
export function Check({ checked, onChange, children, testID }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 }}>
      <View style={[S.box, checked && { backgroundColor: colors.ink, borderColor: colors.ink }]}>{checked ? <Icon name="check" size={15} color={colors.paper} stroke={2.2} /> : null}</View>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <T v="small">{children}</T> : children}</View>
    </Pressable>
  );
}

/* Opción tipo pastilla (servicios, horas, montos) */
export function Chip({ label, selected, onPress, disabled, sub, style, testID }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean; sub?: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [S.chip, selected && S.chipOn, disabled && S.chipOff, pressed && !disabled && { opacity: 0.75 }, style]}>
      <Text style={[S.chipText, selected && { color: colors.paper }, disabled && { color: colors.faint, textDecorationLine: 'line-through' }]} maxFontSizeMultiplier={1.4}>{label}</Text>
      {sub ? <Text style={[S.chipSub, selected && { color: 'rgba(255,255,255,0.75)' }]} maxFontSizeMultiplier={1.3}>{sub}</Text> : null}
    </Pressable>
  );
}

/* Aviso dentro de la pantalla */
export function Notice({ kind = 'info', children, style, title }: { kind?: 'info' | 'error' | 'ok' | 'warn'; children: ReactNode; style?: StyleProp<ViewStyle>; title?: string }) {
  const c = kind === 'error' ? colors.error : kind === 'ok' ? colors.ok : kind === 'warn' ? colors.warn : colors.ink;
  return (
    <View style={[S.notice, { borderLeftColor: c }, style]} accessibilityLiveRegion="polite">
      {title ? <T v="h3" style={{ color: c, marginBottom: 4 }}>{title}</T> : null}
      {typeof children === 'string' ? <T v="small" style={kind === 'error' ? { color: colors.error } : undefined}>{children}</T> : children}
    </View>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <View style={{ paddingVertical: space.xl, alignItems: 'center', gap: space.sm }}><ActivityIndicator color={colors.ink} /><T v="muted">{label}</T></View>;
}

export function Empty({ icon = 'sparkle', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.md, gap: space.sm }}>
      <View style={S.emptyIcon}><Icon name={icon} size={26} /></View>
      <T v="h2" style={{ textAlign: 'center' }}>{title}</T>
      {text ? <T v="muted" style={{ textAlign: 'center', maxWidth: 320 }}>{text}</T> : null}
      {action ? <View style={{ marginTop: space.md, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

/* Fila de lista (ajustes, enlaces) */
export function ListRow({ icon, title, sub, onPress, right, danger, testID }: { icon?: IconName; title: string; sub?: string; onPress?: () => void; right?: ReactNode; danger?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [S.listRow, pressed && onPress && { backgroundColor: colors.sand }]}>
      {icon ? <Icon name={icon} size={21} color={danger ? colors.error : colors.ink} /> : null}
      <View style={{ flex: 1 }}>
        <T v="body" style={danger ? { color: colors.error } : undefined}>{title}</T>
        {sub ? <T v="muted" style={{ fontSize: 13.5 }}>{sub}</T> : null}
      </View>
      {right !== undefined ? right : onPress ? <Icon name="chevron-right" size={18} color={colors.faint} /> : null}
    </Pressable>
  );
}

/* Pareja etiqueta / valor (resumen de la cita y de pagos) */
export function KV({ k, v, strong, style }: { k: string; v: ReactNode; strong?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 5 }, style]}>
      <T v={strong ? 'h3' : 'muted'} style={{ flexShrink: 1 }}>{k}</T>
      {typeof v === 'string' ? <T v={strong ? 'price' : 'small'} style={{ textAlign: 'right', flexShrink: 1 }}>{v}</T> : v}
    </View>
  );
}

export function Badge({ label, tone = 'ink' }: { label: string; tone?: 'ink' | 'soft' | 'ok' | 'warn' | 'error' }) {
  const bg = tone === 'ink' ? colors.ink : tone === 'soft' ? colors.sand : 'transparent';
  const fg = tone === 'ink' ? colors.paper : tone === 'ok' ? colors.ok : tone === 'warn' ? colors.warn : tone === 'error' ? colors.error : colors.ink;
  return (
    <View style={[S.badge, { backgroundColor: bg }, (tone === 'ok' || tone === 'warn' || tone === 'error') && { borderWidth: 1, borderColor: fg }]}>
      <Text style={[S.badgeText, { color: fg }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

export const Stars = ({ n, size = 14 }: { n: number; size?: number }) => (
  <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${n} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" size={size} color={i <= Math.round(n) ? colors.ink : colors.beige} stroke={1} />)}
  </View>
);

export const Pressy = (p: PressableProps & { children: ReactNode }) => <Pressable {...p} style={(s) => [typeof p.style === 'function' ? p.style(s) : p.style, s.pressed && { opacity: 0.75 }]} />;

const S = StyleSheet.create({
  btn: { minHeight: 52, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 0 },
  btnSmall: { minHeight: 40, paddingHorizontal: 14, gap: 7 },
  btnFull: { alignSelf: 'stretch' },
  btnSolid: { backgroundColor: colors.ink },
  btnOutline: { borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper },
  btnGhost: { backgroundColor: 'transparent' },
  btnLink: { minHeight: 36, paddingHorizontal: 4 },
  btnText: { fontFamily: fonts.serifSemi, fontSize: 15.5, letterSpacing: 0.4 },
  btnLinkText: { textDecorationLine: 'underline', fontFamily: fonts.serif },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.line, padding: space.md, backgroundColor: colors.paper },
  cardDark: { backgroundColor: colors.ink, borderColor: colors.ink },
  divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.line, marginVertical: space.md },
  input: { borderWidth: 1, borderColor: colors.lineStrong, minHeight: 50, paddingHorizontal: 14, fontFamily: fonts.serif, fontSize: 16.5, color: colors.ink, backgroundColor: colors.paper },
  box: { width: 22, height: 22, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  chip: { borderWidth: 1, borderColor: colors.lineStrong, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, minHeight: 44 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipOff: { borderColor: colors.line, backgroundColor: colors.sand },
  chipText: { fontFamily: fonts.serifSemi, fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] },
  chipSub: { fontFamily: fonts.serif, fontSize: 12, color: colors.muted, marginTop: 2 },
  notice: { borderLeftWidth: 3, backgroundColor: colors.sand, padding: 14 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line },
  badge: { paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontFamily: fonts.serifSemi, fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase' },
});
