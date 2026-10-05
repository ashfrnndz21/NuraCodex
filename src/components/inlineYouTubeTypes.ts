export type InlineYouTubePlayerProps = {
  visible: boolean;
  videoId: string | null;
  title: string;
  sourceTitle?: string;
  onClose: () => void;
};
