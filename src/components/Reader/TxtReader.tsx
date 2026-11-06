import { type ReaderPrefs, THEMES } from '@/lib/readerPrefs';
import { useCallback, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text } from 'react-native';

type Props = {
  content: string;
  totalWords: number;
  initialWordIndex: number;
  prefs: ReaderPrefs;
  onWordIndex: (index: number) => void;
};

export default function TxtReader({ content, totalWords, initialWordIndex, prefs, onWordIndex }: Props) {
  const theme = THEMES[prefs.theme];
  const hasScrolled = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    contentHeightRef.current = h;
    if (!hasScrolled.current && initialWordIndex > 0 && h > 0) {
      const pct = initialWordIndex / Math.max(1, totalWords);
      const targetY = pct * Math.max(0, h - layoutHeightRef.current);
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
      hasScrolled.current = true;
    }
  }, [initialWordIndex, totalWords]);

  const handleLayout = useCallback((e: any) => {
    layoutHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const maxScroll = contentSize.height - layoutMeasurement.height;
    if (maxScroll <= 0) return;
    const pct = contentOffset.y / maxScroll;
    const idx = Math.round(pct * totalWords);
    onWordIndex(idx);
  }, [totalWords, onWordIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.scroll, { backgroundColor: theme.bg }]}
      onLayout={handleLayout}
      onContentSizeChange={handleContentSizeChange}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.fg,
            fontSize: prefs.fontSize,
            lineHeight: prefs.fontSize * prefs.lineHeight,
          },
        ]}
      >
        {content}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  text: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingBottom: 80,
    fontFamily: 'Inter-Regular',
  },
});
