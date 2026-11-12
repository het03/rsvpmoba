import { useAppTheme } from '@/lib/appTheme';
import { chartPoints, linePath } from '@/lib/stats';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const HEIGHT = 120;
const PAD_X = 10;
const PAD_Y = 14;
const ORP_COLOR = '#C94040'; // the same red the reader uses for the focus letter

/** Average WPM of recent sessions as a line, with the latest session marked. Drawn with plain SVG, no chart library. */
export default function WpmChart({ values }: { values: number[] }) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(0);

  const points = width > 0 ? chartPoints(values, { width, height: HEIGHT, padX: PAD_X, padY: PAD_Y }) : [];
  const last = points[points.length - 1];

  return (
    <View>
      <View style={{ height: HEIGHT }} onLayout={e => setWidth(Math.floor(e.nativeEvent.layout.width))}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {/* Faint horizontal guides at the top, middle and bottom of the plotted range */}
            {[PAD_Y, HEIGHT / 2, HEIGHT - PAD_Y].map(y => (
              <Line key={y} x1={0} x2={width} y1={y} y2={y} stroke={theme.borderSubtle} strokeWidth={1} />
            ))}
            {points.length > 1 && (
              <Path d={linePath(points)} stroke={theme.text} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            )}
            {last && <Circle cx={last.x} cy={last.y} r={4.5} fill={ORP_COLOR} />}
          </Svg>
        )}
      </View>
      {values.length > 0 && (
        <View style={styles.axis}>
          <Text style={[styles.axisText, { color: theme.textSub }]}>low {Math.round(Math.min(...values))}</Text>
          <Text style={[styles.axisText, { color: theme.textSub }]}>
            {values.length} {values.length === 1 ? 'session' : 'sessions'}
          </Text>
          <Text style={[styles.axisText, { color: theme.textSub }]}>high {Math.round(Math.max(...values))}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
