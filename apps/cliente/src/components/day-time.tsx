/* Elegir día y hora: próximos días abiertos, calendario del mes y horas libres (mañana / tarde) */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDaysKey, colors, fmtTime12, fonts, monthName, parseKey, space, todayKey, weekdayShort, type Studio } from '@majobella/core';
import { Button, Chip, Icon, IconButton, Notice, Row, T } from '@majobella/ui';

export function DayStrip({ studio, minutes, value, onChange }: { studio: Studio; minutes: number; value: string | null; onChange: (k: string) => void }) {
  const days = studio.nextOpenDays(14);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
      {days.map((d) => {
        const st = studio.dayStatus(d.key, minutes);
        const full = st === 'full';
        const sel = value === d.key;
        return (
          <Pressable
            key={d.key}
            testID={`day-${d.key}`}
            disabled={full}
            onPress={() => onChange(d.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: sel, disabled: full }}
            accessibilityLabel={`${weekdayShort(d.key)} ${parseKey(d.key).d}${full ? ', completo' : ''}`}
            style={({ pressed }) => [S.day, sel && S.daySel, full && S.dayFull, pressed && { opacity: 0.75 }]}>
            <Text style={[S.dayW, sel && { color: 'rgba(255,255,255,0.75)' }]}>{d.i === 0 ? 'Hoy' : d.i === 1 ? 'Mañana' : weekdayShort(d.key)}</Text>
            <Text style={[S.dayD, sel && { color: colors.paper }, full && { color: colors.faint }]}>{parseKey(d.key).d}</Text>
            <Text style={[S.dayM, sel && { color: 'rgba(255,255,255,0.75)' }]}>{full ? 'Lleno' : monthName(parseKey(d.key).m).slice(0, 3).toLowerCase()}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MonthCalendar({ studio, minutes, value, onChange }: { studio: Studio; minutes: number; value: string | null; onChange: (k: string) => void }) {
  const t = parseKey(todayKey());
  const last = parseKey(addDaysKey(todayKey(), studio.schedule.maxDaysAhead));
  const [ym, setYm] = useState(() => (value ? { y: parseKey(value).y, m: parseKey(value).m } : { y: t.y, m: t.m }));
  const cells = useMemo(() => studio.monthGrid(ym.y, ym.m), [studio, ym]);
  const canPrev = ym.y > t.y || (ym.y === t.y && ym.m > t.m);
  const canNext = ym.y < last.y || (ym.y === last.y && ym.m < last.m);
  const move = (n: number) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  return (
    <View style={S.cal}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <IconButton name="chevron-left" label="Mes anterior" onPress={() => canPrev && move(-1)} color={canPrev ? colors.ink : colors.beige} />
        <T v="h3">{`${monthName(ym.m)} ${ym.y}`}</T>
        <IconButton name="chevron-right" label="Mes siguiente" onPress={() => canNext && move(1)} color={canNext ? colors.ink : colors.beige} />
      </Row>
      <View style={S.grid}>
        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => <Text key={i} style={S.wd}>{d}</Text>)}
        {cells.map((k, i) => {
          if (!k) return <View key={i} style={S.cell} />;
          const st = studio.dayStatus(k, minutes);
          const ok = st === 'open' || st === 'unknown';
          const sel = value === k;
          return (
            <Pressable key={i} disabled={!ok} onPress={() => onChange(k)} accessibilityRole="button" accessibilityState={{ selected: sel, disabled: !ok }} accessibilityLabel={`${parseKey(k).d} de ${monthName(ym.m)}${st === 'full' ? ', completo' : !ok ? ', cerrado' : ''}`} style={S.cell}>
              <View style={[S.cellIn, sel && { backgroundColor: colors.ink }]}>
                <Text style={[S.cellText, !ok && { color: colors.beige }, st === 'full' && { textDecorationLine: 'line-through', color: colors.faint }, sel && { color: colors.paper }]}>{parseKey(k).d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function TimeSlots({ studio, dateKey, minutes, value, onChange, busyError, onRetry, slots }: {
  studio: Studio; dateKey: string; minutes: number; value: string | null; onChange: (t: string) => void; busyError?: string; onRetry?: () => void;
  slots?: { time: string; busy: boolean }[];
}) {
  const list = slots || studio.slots(dateKey, minutes);
  if (busyError && !studio.busyAt) return <Notice kind="error" title="No pudimos ver la agenda">{busyError}{onRetry ? '' : ''}</Notice>;
  if (!list.length) return <T v="muted">No quedan horas para esta duración ese día. Elige otro día.</T>;
  const free = list.filter((s) => !s.busy);
  if (!free.length) return <T v="muted">Este día ya está lleno. Elige otro día o únete a la lista de espera.</T>;
  const groups = [
    { label: 'Mañana', items: list.filter((s) => Number(s.time.slice(0, 2)) < 12) },
    { label: 'Tarde', items: list.filter((s) => Number(s.time.slice(0, 2)) >= 12) },
  ].filter((g) => g.items.length);
  return (
    <View style={{ gap: space.md }}>
      {groups.map((g) => (
        <View key={g.label}>
          <T v="kicker" style={{ marginBottom: 8 }}>{g.label}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {g.items.map((s) => (
              <Chip key={s.time} testID={`slot-${s.time}`} label={fmtTime12(s.time)} selected={value === s.time} disabled={s.busy} onPress={() => onChange(s.time)} style={{ minWidth: 98 }} />
            ))}
          </View>
        </View>
      ))}
      {!studio.busyAt ? <T v="muted" style={{ fontSize: 13 }}>Revisando las horas ocupadas…</T> : null}
    </View>
  );
}

export function FirstFree({ studio, minutes, onPick }: { studio: Studio; minutes: number; onPick: (k: string, t: string) => void }) {
  const f = studio.busyAt ? studio.firstFree(minutes) : null;
  if (!f) return null;
  return (
    <Button testID="first-free" kind="outline" small icon="clock" title={`Primera hora libre: ${f.i === 0 ? 'hoy' : f.i === 1 ? 'mañana' : weekdayShort(f.key).toLowerCase() + ' ' + parseKey(f.key).d} · ${fmtTime12(f.time)}`} onPress={() => onPick(f.key, f.time)} />
  );
}

const S = StyleSheet.create({
  day: { width: 72, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.lineStrong, gap: 2, backgroundColor: colors.paper },
  daySel: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayFull: { backgroundColor: colors.sand, borderColor: colors.line },
  dayW: { fontFamily: fonts.serif, fontSize: 12.5, color: colors.muted },
  dayD: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink, lineHeight: 30 },
  dayM: { fontFamily: fonts.serif, fontSize: 12, color: colors.muted },
  cal: { borderWidth: 1, borderColor: colors.line, padding: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.serifSemi, fontSize: 12, color: colors.muted, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellIn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  cellText: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
});
void Icon;
