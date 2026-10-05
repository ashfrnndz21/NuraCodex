import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { InlineSourceReaderProps } from './inlineSourceReaderTypes';

export default function InlineSourceReader({ visible, url, title, onClose }: InlineSourceReaderProps) {
  return <Modal visible={visible && Boolean(url)} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={styles.page}>
      <View style={styles.header}><View style={styles.heading}><Text style={styles.eyebrow}>READING IN NURA · ORIGINAL SOURCE</Text><Text numberOfLines={2} style={styles.title}>{title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close article reader" onPress={onClose} style={styles.close}><Text style={styles.closeText}>CLOSE</Text></Pressable></View>
      {url ? <WebView
        source={{ uri: url }}
        style={styles.reader}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('https://')}
      /> : null}
      <Text style={styles.note}>Publisher content is shown as published. Close it to return to your reading.</Text>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 48, paddingHorizontal: 14, paddingBottom: 18, backgroundColor: '#211715' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  heading: { flex: 1 },
  eyebrow: { color: '#E8B18E', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#FFF5EB', fontSize: 15, fontWeight: '600', marginTop: 4 },
  close: { minWidth: 64, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,226,205,.25)', backgroundColor: 'rgba(255,241,225,.08)' },
  closeText: { color: '#F3D7C8', fontSize: 10, fontWeight: '800', letterSpacing: .7 },
  reader: { flex: 1, width: '100%', backgroundColor: '#FFFDF8' },
  note: { color: '#CBB9AD', fontSize: 11, lineHeight: 15, marginTop: 9 },
});
