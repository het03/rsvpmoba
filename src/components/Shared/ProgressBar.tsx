import { StyleSheet, View } from 'react-native';

type Props = {
  value: number; // 0–1
  color?: string;
};

export default function ProgressBar({ value, color = '#1E1E1E' }: Props) {
  const pct = Math.min(1, Math.max(0, value)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 1,
  },
});
