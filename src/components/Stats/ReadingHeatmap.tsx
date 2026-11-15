import { ACCENT_RED, useAppTheme } from '@/lib/appTheme';
import { formatDay, HEATMAP_WEEKS, heatmapWeeks, type HeatLevel } from '@/lib/stats';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GAP = 3;
const MAX_CELL = 18;
const RED = ACCENT_RED;
// How strongly the red shows through for each level (0 uses the empty-cell colour instead).
const OPACITY: Record<HeatLevel, number> = { 0: 1, 1: 0.25, 2: 0.45, 3: 0.7, 4: 1 };

/**
 * A calendar of the last few weeks, one square per day, darker for more words read, Monday at the top. Tap a day to
 * see its date and word count; tap it again to clear. `days` is words per local day, `now` is injectable for tests.
 */
export default function ReadingHeatmap({ days, now = Date.now() }: { days: Record<string, number>; now?: number }) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const columns = useMemo(() => heatmapWeeks(days, now), [days, now]);
  const activeDays = useMemo(() => columns.reduce((n, col) => n + col.filter(c => c.words > 0).length, 0), [columns]);

  const cell = Math.max(4, Math.min(MAX_CELL, Math.floor((width - GAP * (HEATMAP_WEEKS - 1)) / HEATMAP_WEEKS)));
  const picked = selected ? columns.flat().find(c => c.key === selected && !c.future) : undefined;

  const caption = picked
    ? `${formatDay(picked.key)} · ${picked.words > 0 ? `${picked.words.toLocaleString()} ${picked.words === 1 ? 'word' : 'words'}` : 'no reading'}`
    : activeDays === 0
      ? `No reading in the last ${HEATMAP_WEEKS} weeks yet`
      : `${activeDays} ${activeDays === 1 ? 'day' : 'days'} read in the last ${HEATMAP_WEEKS} weeks`;

  return (
    <View style={styles.wrap}>
      <View style={styles.grid} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 &&
          columns.map((col, w) => (
            <View key={w} style={styles.column}>
              {col.map(c =>
                c.future ? (
                  <View key={c.key} style={{ width: cell, height: cell }} />
                ) : (
                  <TouchableOpacity
                    key={c.key}
                    activeOpacity={0.6}
                    accessibilityLabel={`${formatDay(c.key)}, ${c.words === 0 ? 'no reading' : `${c.words} words`}`}
                    onPress={() => setSelected(selected === c.key ? null : c.key)}
                    // The ring is on the outer square and the shade on the inner one, so a faint day still shows its ring.
                    style={[styles.cell, { width: cell, height: cell, borderColor: c.key === picked?.key ? theme.text : 'transparent' }]}
                  >
                    <View
                      style={[styles.fill, { backgroundColor: c.level === 0 ? theme.borderSubtle : RED, opacity: OPACITY[c.level] }]}
                    />
                  </TouchableOpacity>
                ),
              )}
            </View>
          ))}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.caption, { color: theme.textSub }]} numberOfLines={1}>{caption}</Text>
        <View style={styles.legend}>
          <Text style={[styles.caption, { color: theme.textSub }]}>Less</Text>
          {([0, 1, 2, 3, 4] as HeatLevel[]).map(l => (
            <View
              key={l}
              style={[styles.legendCell, { backgroundColor: l === 0 ? theme.borderSubtle : RED, opacity: OPACITY[l] }]}
            />
          ))}
          <Text style={[styles.caption, { color: theme.textSub }]}>More</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  grid: { flexDirection: 'row', gap: GAP, justifyContent: 'center', minHeight: 4 * 7 },
  column: { gap: GAP },
  cell: { borderRadius: 4, borderWidth: 1.5 },
  fill: { flex: 1, borderRadius: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
  caption: { fontFamily: 'Inter-Medium', fontSize: 12, flexShrink: 1 },
});
