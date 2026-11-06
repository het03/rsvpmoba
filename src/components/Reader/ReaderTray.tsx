import { type ReaderPrefs, type Theme, THEMES, savePrefs } from '@/lib/readerPrefs';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  prefs: ReaderPrefs;
  onChange: (prefs: ReaderPrefs) => void;
  onClose: () => void;
};

const THEMES_ORDER: Theme[] = ['light', 'dark', 'sepia'];
const TRAY_HEIGHT = 290;

// ─── Custom Slider ────────────────────────────────────────────────────────────

type SliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  displayValue: string;
  fg: string;
  onChange: (v: number) => void;
};

function ReaderSlider({ value, min, max, step, label, displayValue, fg, onChange }: SliderProps) {
  const [trackWidth, setTrackWidth] = useState(1);
  const viewRef = useRef<View>(null);
  const viewLeft = useRef(0);
  const THUMB = 20;

  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const thumbLeft = pct * (trackWidth - THUMB);

  // Use pageX (absolute screen coords) minus the view's measured left edge.
  // locationX is relative to the responder target and jumps when the responder
  // transfers between nested views, causing erratic slider movement.
  const compute = (pageX: number) => {
    const x = Math.max(0, pageX - viewLeft.current);
    const p = Math.min(1, x / Math.max(1, trackWidth));
    const raw = min + p * (max - min);
    const snapped = Math.round(raw / step) * step;
    return parseFloat(Math.max(min, Math.min(max, snapped)).toFixed(10));
  };

  return (
    <View style={styles.sliderRow}>
      <Text style={[styles.sliderLabel, { color: fg + 'AA' }]}>{label}</Text>

      <View
        ref={viewRef}
        style={styles.trackHitArea}
        onLayout={() => {
          viewRef.current?.measure((_x, _y, w, _h, pageX) => {
            viewLeft.current = pageX;
            setTrackWidth(w);
          });
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={e => onChange(compute(e.nativeEvent.pageX))}
        onResponderMove={e => onChange(compute(e.nativeEvent.pageX))}
      >
        <View style={[styles.track, { backgroundColor: fg + '20' }]} />
        <View style={[styles.trackFill, { width: pct * trackWidth, backgroundColor: fg }]} />
        <View style={[styles.thumb, { left: thumbLeft, backgroundColor: fg, shadowColor: fg }]} />
      </View>

      <Text style={[styles.sliderValue, { color: fg }]}>{displayValue}</Text>
    </View>
  );
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

export default function ReaderTray({ visible, prefs, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(TRAY_HEIGHT + insets.bottom);
  const startY = useSharedValue(0);
  const theme = THEMES[prefs.theme];
  const fg = theme.fg;
  const bg = theme.bg;
  // Sepia has a warm light background — light slider elements become invisible on it.
  // Mirror dark-mode: give sliders a dark pill background + light fg so they look
  // exactly like they do in dark mode regardless of the page tint.
  const isSepia = prefs.theme === 'sepia';
  const sliderFg = isSepia ? THEMES['dark'].fg : fg;

  const closedY = TRAY_HEIGHT + insets.bottom;

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else {
      translateY.value = withTiming(closedY, { duration: 240, easing: Easing.in(Easing.cubic) });
    }
  }, [visible, insets.bottom]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const panGesture = Gesture.Pan()
    .onBegin(() => { startY.value = translateY.value; })
    .onUpdate(e => {
      // Only allow dragging downward
      translateY.value = Math.max(0, startY.value + e.translationY);
    })
    .onEnd(e => {
      const shouldClose = e.translationY > 60 || e.velocityY > 500;
      if (shouldClose) {
        translateY.value = withTiming(closedY, { duration: 240, easing: Easing.in(Easing.cubic) });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }
    });

  const update = (patch: Partial<ReaderPrefs>) => {
    const next = { ...prefs, ...patch };
    onChange(next);
    savePrefs(next);
  };

  return (
    <>
      {visible && (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      )}
      <Animated.View
        style={[
          styles.tray,
          {
            backgroundColor: isSepia ? THEMES['dark'].bg : bg,
            borderColor: (isSepia ? THEMES['dark'].fg : fg) + '18',
            paddingBottom: 20 + insets.bottom,
            height: TRAY_HEIGHT + insets.bottom,
            shadowColor: isSepia ? THEMES['dark'].fg : fg,
          },
          animStyle,
        ]}
      >
        {/* Handle — drag down to close */}
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleHitArea}>
            <View style={[styles.handle, { backgroundColor: (isSepia ? THEMES['dark'].fg : fg) + '40' }]} />
          </View>
        </GestureDetector>

        <View style={styles.slidersBlock}>
          <ReaderSlider
            label="Size"
            value={prefs.fontSize}
            min={14}
            max={26}
            step={1}
            displayValue={`${prefs.fontSize}`}
            fg={sliderFg}
            onChange={v => update({ fontSize: Math.round(v) })}
          />
          <ReaderSlider
            label="Spacing"
            value={prefs.lineHeight}
            min={1.2}
            max={2.2}
            step={0.1}
            displayValue={`${prefs.lineHeight.toFixed(1)}×`}
            fg={sliderFg}
            onChange={v => update({ lineHeight: parseFloat(v.toFixed(1)) })}
          />
          <ReaderSlider
            label="Bright"
            value={prefs.brightness ?? 1}
            min={0.2}
            max={1.0}
            step={0.05}
            displayValue={`${Math.round((prefs.brightness ?? 1) * 100)}%`}
            fg={sliderFg}
            onChange={v => update({ brightness: parseFloat(v.toFixed(2)) })}
          />
        </View>

        {/* Theme chips */}
        <View style={styles.themeRow}>
          {THEMES_ORDER.map(t => {
            const active = prefs.theme === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => update({ theme: t })}
                style={[
                  styles.themeChip,
                  {
                    backgroundColor: THEMES[t].bg,
                    borderColor: active ? THEMES[t].fg : THEMES[t].fg + '40',
                    borderWidth: active ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.themeText, { color: THEMES[t].fg }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  tray: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 20,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  handleHitArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  // ── Sliders block ──
  slidersBlock: {
    gap: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sliderLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    width: 52,
    letterSpacing: 0.3,
  },
  trackHitArea: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    top: 8,  // (36 - 20) / 2
  },
  sliderValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  // ── Themes ──
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  themeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
  },
});
