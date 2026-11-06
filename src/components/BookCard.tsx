import { type Book } from '@/db';
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
  onLongPress: () => void;
};

export default function BookCard({ book, onLongPress }: BookCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: spineColor(book.title) }]}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={0.8}
    >
      <Text numberOfLines={4} style={styles.title}>
        {book.title}
      </Text>
      <View style={styles.footer}>
        <Text style={styles.format}>{book.format.toUpperCase()}</Text>
        {book.fileSize > 0 && (
          <Text style={styles.size}>{formatBytes(book.fileSize)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 100,
    height: 150,
    borderRadius: 2,
    padding: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#FFFFFF',
    lineHeight: 15,
    flex: 1,
  },
  footer: {
    gap: 2,
  },
  format: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 8,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  size: {
    fontFamily: 'Inter-Regular',
    fontSize: 8,
    color: 'rgba(255,255,255,0.35)',
  },
});
