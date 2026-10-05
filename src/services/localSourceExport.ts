import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { browserAssetId, readBrowserAsset } from '../state/browserAssetStore.mjs';
import { prepareLocalSourceStreams } from './localSourceExport.mjs';

/** Return lazy readers for saved originals so exports can stream rather than retain all bytes. */
export function readSavedSourceFilesForExport(assets: { id: string; uri: string }[]) {
  return prepareLocalSourceStreams(assets, {
    platform: Platform.OS,
    readBrowserFile: async (uri) => {
      const id = browserAssetId(uri);
      return id ? readBrowserAsset(id) : null;
    },
    readDeviceFile: async (uri) => {
      const file = new File(uri);
      return file.exists ? file : null;
    },
  });
}
