import { type Book } from '@/db';
import { Image } from 'expo-image';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SPINE_COLORS = ['#1E1E1E', '#2D3A2E', '#1A2535', '#3A1A1A', '#1A1A3A'];

function spineColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return SPINE_COLORS[Math.abs(hash) % SPINE_COLORS.length];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type BookCardProps = {
  book: Book;
  cardWidth: number;
  cardHeight: number;
  progress?: number; // 0–1
  onPress: () => void;
  onLongPress: () => void;
};

export default function BookCard({ book, cardWidth, cardHeight, progress = 0, onPress, onLongPress }: BookCardProps) {
  const hasCover = !!book.coverData;

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth, height: cardHeight }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={0.85}
    >
      {hasCover ? (
        <>
          <Image
            source={{ uri: book.coverData! }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <View style={styles.scrim} />
          <View style={styles.coverTextBlock}>
            <Text numberOfLines={2} style={styles.coverTitle}>{book.title}</Text>
            {!!book.author && (
              <Text numberOfLines={1} style={styles.coverAuthor}>{book.author}</Text>
            )}
          </View>
        </>
      ) : (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: spineColor(book.title) }]} />
          <Text numberOfLines={4} style={styles.spineTitle}>{book.title}</Text>
          <View style={styles.spineFooter}>
            {!!book.author && (
              <Text numberOfLines={1} style={styles.spineAuthor}>{book.author}</Text>
            )}
            <Text style={styles.spineFormat}>{book.format.toUpperCase()}</Text>
            {book.fileSize > 0 && (
              <Text style={styles.spineSize}>{formatBytes(book.fileSize)}</Text>
            )}
          </View>
        </>
      )}

      {/* Progress bar — only shown when the book has been opened */}
      {progress > 0.01 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(1, progress) * 100}%` as any }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    overflow: 'hidden',
  } as any,

  // ── Cover variant ──
  scrim: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '55%',
    // A dark gradient scrim built from two overlapping semi-transparent views
    // since RN LinearGradient isn't available without expo-linear-gradient.
    backgroundColor: 'transparent',
    // Shadow from the bottom
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  coverTextBlock: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    padding: 8,
    paddingTop: 24,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  coverTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: '#FFFFFF',
    lineHeight: 14,
  },
  coverAuthor: {
    fontFamily: 'Inter-Regular',
    fontSize: 8,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },

  // ── Spine (no cover) variant ──
  spineTitle: {
    fontFamily: 'Fraunces-Regular',
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 17,
    flex: 1,
    padding: 10,
  },
  spineFooter: {
    padding: 10,
    paddingTop: 0,
    gap: 2,
  },
  spineAuthor: {
    fontFamily: 'Inter-Regular',
    fontSize: 8,
    color: 'rgba(255,255,255,0.55)',
  },
  spineFormat: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 8,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  spineSize: {
    fontFamily: 'Inter-Regular',
    fontSize: 8,
    color: 'rgba(255,255,255,0.35)',
  },

  // ── Progress bar ──
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});
