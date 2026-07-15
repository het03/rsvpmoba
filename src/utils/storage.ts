import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "BOOK_LIBRARY";

export async function saveLibrary(data: unknown): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function loadLibrary(): Promise<any[]> {
    const result = await AsyncStorage.getItem(KEY);

    if (!result) {
        return [];
    }

    return JSON.parse(result);
}