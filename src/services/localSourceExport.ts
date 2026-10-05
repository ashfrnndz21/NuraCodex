import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { browserAssetId, readBrowserAsset } from '../state/browserAssetStore.mjs';
import { collectLocalSourceFiles } from './localSourceExport.mjs';

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function readSavedSourceFilesForExport(assets: { id: string; uri: string }[]) {
  return collectLocalSourceFiles(assets, {
    platform: Platform.OS,
    readBrowserFile: async (uri) => {
      const id = browserAssetId(uri);
      if (!id) return null;
      const blob = await readBrowserAsset(id);
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    },
    readDeviceFile: async (uri) => decodeBase64(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })),
  });
}
