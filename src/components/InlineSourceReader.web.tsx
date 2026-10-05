import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { InlineSourceReaderProps } from './inlineSourceReaderTypes';

export default function InlineSourceReader({ visible, url, title, onClose }: InlineSourceReaderProps) {
  return <Modal visible={visible && Boolean(url)} animationType="fade" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close article reader" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.readerCard}>
        <View style={styles.header}><View style={styles.heading}><Text style={styles.eyebrow}>READING IN NURA · ORIGINAL SOURCE</Text><Text numberOfLines={2} style={styles.title}>{title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close article reader" onPress={onClose} style={styles.close}><Text style={styles.closeText}>CLOSE</Text></Pressable></View>
        <View style={styles.frame}>{url ? React.createElement('iframe', {
          src: url,
          title: `Source article: ${title}`,
          referrerPolicy: 'strict-origin-when-cross-origin',
          style: { width: '100%', height: '100%', border: 0, backgroundColor: '#FFFDF8' },
        }) : null}</View>
        <Text style={styles.note}>Publisher content is shown as published. Close it to return to your reading.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14, backgroundColor: 'rgba(8,6,6,.88)' },
  readerCard: { width: '100%', maxWidth: 900, height: '94%', padding: 14, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,226,205,.30)', backgroundColor: '#2B1E1B' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  heading: { flex: 1 },
  eyebrow: { color: '#E8B18E', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#FFF5EB', fontSize: 15, fontWeight: '600', marginTop: 4 },
  close: { minWidth: 64, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,226,205,.25)', backgroundColor: 'rgba(255,241,225,.08)' },
  closeText: { color: '#F3D7C8', fontSize: 10, fontWeight: '800', letterSpacing: .7 },
  frame: { flex: 1, width: '100%', overflow: 'hidden', borderRadius: 14, backgroundColor: '#FFFDF8' },
  note: { color: '#CBB9AD', fontSize: 11, lineHeight: 15, marginTop: 9 },
});
