import { Platform } from 'react-native';
import { nativeAnimatedDriverFor } from './animatedDriverPolicy.mjs';

export const animatedNativeDriver = nativeAnimatedDriverFor(Platform.OS);
