import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { InlineYouTubePlayerProps } from './inlineYouTubeTypes';
import { getYouTubeEmbedUrl } from '../services/youtubeVideo.mjs';

export default function InlineYouTubePlayer({ visible, videoId, title, sourceTitle, onClose }: InlineYouTubePlayerProps) {
  const source = videoId ? getYouTubeEmbedUrl(videoId) ?? '' : '';
  return <Modal visible={visible && Boolean(videoId)} animationType="fade" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close video player" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.playerCard}>
        <View style={styles.header}><View style={styles.heading}><Text style={styles.eyebrow}>FOR YOUR HEALTH JOURNEY · VIDEO</Text><Text numberOfLines={3} style={styles.title}>{title}</Text>{sourceTitle && sourceTitle !== title ? <Text numberOfLines={2} style={styles.sourceTitle}>Published as “{sourceTitle}” on YouTube</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="Close video player" onPress={onClose} style={styles.close}><Text style={styles.closeText}>CLOSE</Text></Pressable></View>
        <View style={styles.frame}>
          {videoId ? React.createElement('iframe', {
            src: source,
            title: `YouTube video: ${title}`,
            allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share',
            allowFullScreen: true,
            referrerPolicy: 'strict-origin-when-cross-origin',
            style: { width: '100%', height: '100%', border: 0, backgroundColor: '#090706' },
          }) : null}
        </View>
        <Text style={styles.note}>This video is published by YouTube. Close it to return to your reading.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18, backgroundColor: 'rgba(8,6,6,.88)' },
  playerCard: { width: '100%', maxWidth: 720, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,226,205,.30)', backgroundColor: '#2B1E1B', shadowColor: '#000', shadowOpacity: .34, shadowRadius: 28, shadowOffset: { width: 0, height: 16 } },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  heading: { flex: 1 },
  eyebrow: { color: '#E8B18E', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#FFF5EB', fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -.6, marginTop: 7 },
  sourceTitle: { color: '#CBB9AD', fontSize: 12, lineHeight: 17, marginTop: 6 },
  close: { minWidth: 64, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,226,205,.25)', backgroundColor: 'rgba(255,241,225,.08)' },
  closeText: { color: '#F3D7C8', fontSize: 10, fontWeight: '800', letterSpacing: .7 },
  frame: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: 14, backgroundColor: '#090706' },
  note: { color: '#CBB9AD', fontSize: 11, lineHeight: 15, marginTop: 10 },
});
