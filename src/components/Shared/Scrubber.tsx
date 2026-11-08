import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

type Props = {
  value: number;       // 0–1, current reading position
  color: string;       // track fill / thumb / bubble background
  contrast: string;    // text color on the bubble
  disabled?: boolean;
  onSeek: (fraction: number) => void;
};

const REST_OPACITY = 0.4; // how faint the line is when not in use
const THUMB = 18;         // the ball and percentage bubble only appear while dragging
const BUBBLE_W = 48;
const HOLD_MS = 900;      // keep showing the released value until the reader reports its new position
const GLIDE_MS = 220;     // how long the line takes to glide to a newly reported position

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export default function Scrubber({ value, color, contrast, disabled, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const widthRef = useRef(0);
  widthRef.current = width;

  // Everything moves from one animated 0–1 value, driven on the native side so it stays smooth even
  // while the page is busy scrolling.
  const p = useRef(new Animated.Value(clamp(value))).current;
  const isDragging = drag !== null;

  // The line is faint at rest and brightens while it's being dragged.
  const fade = useRef(new Animated.Value(REST_OPACITY)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: isDragging ? 1 : REST_OPACITY,
      duration: isDragging ? 120 : 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isDragging, fade]);

  // Reading position updates arrive in small jumps; glide between them instead of snapping.
  useEffect(() => {
    if (isDragging) return;
    Animated.timing(p, {
      toValue: clamp(held ?? value),
      duration: GLIDE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [value, held, isDragging, p]);

  useEffect(() => {
    if (held === null) return;
    const t = setTimeout(() => setHeld(null), HOLD_MS);
    return () => clearTimeout(t);
  }, [held]);

  const toFraction = (x: number) => (widthRef.current > 0 ? clamp(x / widthRef.current) : 0);
  const follow = (f: number) => {
    p.stopAnimation();
    p.setValue(f); // while dragging the line tracks the finger exactly, with no glide
    setDrag(f);
  };

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .runOnJS(true)
    .onBegin(e => { setHeld(null); follow(toFraction(e.x)); })
    .onUpdate(e => follow(toFraction(e.x)))
    .onEnd(e => {
      const f = toFraction(e.x);
      setHeld(f);
      onSeek(f);
    })
    .onFinalize(() => setDrag(null));

  const shown = clamp(drag ?? held ?? value);
  const trackW = Math.max(0, width);
  const thumbX = p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, trackW - THUMB)] });
  const bubbleX = p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, trackW - BUBBLE_W)] });
  const fillX = p.interpolate({ inputRange: [0, 1], outputRange: [-trackW, 0] });

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.hit} onLayout={e => setWidth(e.nativeEvent.layout.width)} collapsable={false}>
        <Animated.View style={[styles.track, { backgroundColor: `${color}22`, opacity: fade }]}>
          <Animated.View
            style={[styles.fill, { width: trackW, backgroundColor: color, transform: [{ translateX: fillX }] }]}
          />
        </Animated.View>
        {isDragging && (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.thumb,
                { width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: color, top: 16 - THUMB / 2 },
                { transform: [{ translateX: thumbX }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.bubble, { backgroundColor: color }, { transform: [{ translateX: bubbleX }] }]}
            >
              <Text style={[styles.bubbleText, { color: contrast }]}>{Math.round(shown * 100)}%</Text>
            </Animated.View>
          </>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: 32, justifyContent: 'center', overflow: 'visible' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3 },
  thumb: { position: 'absolute', left: 0 },
  bubble: {
    position: 'absolute', left: 0, top: 32, width: BUBBLE_W, paddingVertical: 4,
    borderRadius: 10, alignItems: 'center',
  },
  bubbleText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
});
