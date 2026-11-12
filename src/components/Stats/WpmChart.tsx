import { useAppTheme } from '@/lib/appTheme';
import { chartPoints, linePath, nearestPointIndex } from '@/lib/stats';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const HEIGHT = 120;
const PAD_X = 10;
const PAD_Y = 14;
const ORP_COLOR = '#C94040'; // the same red the reader uses for the focus letter

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Average WPM of recent sessions as a line. The latest session is marked by default; drag a finger along the chart
 * (or tap a point) to read the speed and date of any session, and tap the selected point again to go back to the latest.
 * Drawn with plain SVG, no chart library.
 */
export default function WpmChart({ values, times }: { values: number[]; times: number[] }) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const points = width > 0 ? chartPoints(values, { width, height: HEIGHT, padX: PAD_X, padY: PAD_Y }) : [];
  // A reload can shrink the list under an old selection; fall back to the latest rather than point past the end.
  const picked = selected !== null && selected < values.length ? selected : null;
  const shownIndex = picked ?? values.length - 1;
  const shown = points[shownIndex];

  const drag = Gesture.Pan()
    // Only take over once the finger moves sideways, so a vertical swipe still scrolls the page.
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .runOnJS(true)
    .onUpdate(e => {
      const i = nearestPointIndex(points, e.x);
      if (i !== null) setSelected(i);
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(e => {
      const i = nearestPointIndex(points, e.x);
      if (i !== null) setSelected(prev => (prev === i ? null : i));
    });

  const gesture = Gesture.Exclusive(drag, tap);

  return (
    <View>
      {values.length > 0 && (
        <View style={styles.readout}>
          <Text style={[styles.readoutValue, { color: theme.text }]}>
            {Math.round(values[shownIndex])} <Text style={[styles.readoutUnit, { color: theme.textSub }]}>WPM</Text>
          </Text>
          <Text style={[styles.readoutWhen, { color: theme.textSub }]} numberOfLines={1}>
            {picked === null ? 'Latest · ' : ''}
            {times[shownIndex] !== undefined ? formatWhen(times[shownIndex]) : ''}
          </Text>
        </View>
      )}
      <GestureDetector gesture={gesture}>
        <View style={{ height: HEIGHT }} onLayout={e => setWidth(Math.floor(e.nativeEvent.layout.width))} collapsable={false}>
          {width > 0 && (
            <Svg width={width} height={HEIGHT}>
              {/* Faint horizontal guides at the top, middle and bottom of the plotted range */}
              {[PAD_Y, HEIGHT / 2, HEIGHT - PAD_Y].map(y => (
                <Line key={y} x1={0} x2={width} y1={y} y2={y} stroke={theme.borderSubtle} strokeWidth={1} />
              ))}
              {points.length > 1 && (
                <Path d={linePath(points)} stroke={theme.text} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {shown && picked !== null && (
                <Line x1={shown.x} x2={shown.x} y1={0} y2={HEIGHT} stroke={theme.textSub} strokeWidth={1} strokeDasharray="3 3" />
              )}
              {shown && <Circle cx={shown.x} cy={shown.y} r={picked !== null ? 5.5 : 4.5} fill={ORP_COLOR} />}
            </Svg>
          )}
        </View>
      </GestureDetector>
      {values.length > 0 && (
        <View style={styles.axis}>
          <Text style={[styles.axisText, { color: theme.textSub }]}>low {Math.round(Math.min(...values))}</Text>
          <Text style={[styles.axisText, { color: theme.textSub }]}>
            {values.length} {values.length === 1 ? 'session' : 'sessions'}
            {picked !== null ? ` · #${picked + 1}` : ''}
          </Text>
          <Text style={[styles.axisText, { color: theme.textSub }]}>high {Math.round(Math.max(...values))}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    height: 28,
    marginBottom: 4,
  },
  readoutValue: {
    fontFamily: 'Fraunces-Regular',
    fontSize: 22,
  },
  readoutUnit: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
  },
  readoutWhen: {
    flexShrink: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    marginLeft: 8,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
  },
});
