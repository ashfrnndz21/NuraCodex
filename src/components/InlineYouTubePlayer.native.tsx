import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { InlineYouTubePlayerProps } from './inlineYouTubeTypes';
import { getYouTubeEmbedUrl } from '../services/youtubeVideo.mjs';

export default function InlineYouTubePlayer({ visible, videoId, title, sourceTitle, onClose }: InlineYouTubePlayerProps) {
  const source = videoId ? getYouTubeEmbedUrl(videoId) ?? '' : '';
  return <Modal visible={visible && Boolean(videoId)} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={styles.page}>
      <View style={styles.header}><View style={styles.heading}><Text style={styles.eyebrow}>FOR YOUR HEALTH JOURNEY · VIDEO</Text><Text numberOfLines={3} style={styles.title}>{title}</Text>{sourceTitle && sourceTitle !== title ? <Text numberOfLines={2} style={styles.sourceTitle}>Published as “{sourceTitle}” on YouTube</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="Close video player" onPress={onClose} style={styles.close}><Text style={styles.closeText}>CLOSE</Text></Pressable></View>
      {videoId ? <WebView
        source={{ uri: source }}
        style={styles.player}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        startInLoadingState
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('https://')}
      /> : null}
      <Text style={styles.note}>This video is published by YouTube. Close it to return to your reading.</Text>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 48, paddingHorizontal: 14, paddingBottom: 20, backgroundColor: '#211715' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  heading: { flex: 1 },
  eyebrow: { color: '#E8B18E', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#FFF5EB', fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -.6, marginTop: 7 },
  sourceTitle: { color: '#CBB9AD', fontSize: 12, lineHeight: 17, marginTop: 6 },
  close: { minWidth: 64, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,226,205,.25)', backgroundColor: 'rgba(255,241,225,.08)' },
  closeText: { color: '#F3D7C8', fontSize: 10, fontWeight: '800', letterSpacing: .7 },
  player: { flex: 1, width: '100%', backgroundColor: '#090706' },
  note: { color: '#CBB9AD', fontSize: 11, lineHeight: 15, marginTop: 10 },
});
