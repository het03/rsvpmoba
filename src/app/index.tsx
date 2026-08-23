import { Text, View, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import SearchIcon from "../../assets/images/tabIcons/Search.svg";
import AddIcon from '../../assets/images/tabIcons/Add.svg';
import BookPlaceholder from "@/components/addBook";
import GreetingHeader from "@/components/greetings";

export default function Index() {
  const handleAddBook = () => {
    console.log('Add book from cmp');
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <GreetingHeader title="Your shelf" />

        <View style={styles.iconContainer}>
          <TouchableOpacity
            style={styles.iconBorderContainer}
            onPress={() => console.log('Search Clicked')}
          >
            <SearchIcon width={16} height={16} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBorderContainer}
            onPress={() => console.log('Add Clicked')}
          >
            <AddIcon width={16} height={16} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.bookContainer}>
        <BookPlaceholder onPress={handleAddBook} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  textGroup: {
    gap: 0,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBorderContainer: {
    width: 32,
    height: 32,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  bookContainer: {
    paddingHorizontal: '5%',
    paddingTop: 24,
  }
});
