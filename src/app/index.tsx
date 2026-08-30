import BookPlaceholder from "@/components/addBook";
import GreetingHeader from "@/components/greetings";
import ImportModal from "@/components/ImportModal/ImportModal";
import { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import AddIcon from '../../assets/images/tabIcons/Add.svg';
import SearchIcon from "../../assets/images/tabIcons/Search.svg";

export default function Index() {
  const [isImportOpen, setIsImportOpen] = useState(false);

  const openImportModal = () => setIsImportOpen(true);
  const closeImportModal = () => setIsImportOpen(false);

  const handleAddBook = () => {
    openImportModal();
  };

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
            onPress={openImportModal}
          >
            <AddIcon width={16} height={16} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.bookContainer}>
        <BookPlaceholder onPress={handleAddBook} />
      </View>

      <ImportModal visible={isImportOpen} onClose={closeImportModal} />
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
    alignSelf: 'flex-start',
    paddingHorizontal: '5%',
    paddingTop: 24,
  }
});
