/* Tipografía de la marca (Source Serif 4, la misma de la web) */
import { useFonts } from 'expo-font';
import { SourceSerif4_400Regular, SourceSerif4_400Regular_Italic, SourceSerif4_600SemiBold } from '@expo-google-fonts/source-serif-4';

export function useBrandFonts() {
  return useFonts({ SourceSerif4_400Regular, SourceSerif4_400Regular_Italic, SourceSerif4_600SemiBold });
}
