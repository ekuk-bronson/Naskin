import React from 'react';
import { TouchableOpacity, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface ImageUploaderProps {
  onSelect: (uri: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function ImageUploader({ onSelect, style }: ImageUploaderProps) {
  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]?.uri) {
      onSelect(result.assets[0].uri);
    }
  };

  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={pick} activeOpacity={0.72}>
      <Text style={styles.icon}>🖼</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#EDE9E3',
    shadowColor: '#1C1A18',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  icon: { fontSize: 20 },
});
