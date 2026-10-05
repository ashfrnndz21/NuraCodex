/**
 * Describe the data locations and controls available in the local Nura preview.
 * This is explicit about provider and cloud boundaries: the app cannot claim
 * that locally clearing data erases an external copy.
 * @param {string} platform
 */
export function privacyStorageMap(platform) {
  const browser = platform === 'web';
  return [
    {
      id: 'app-copy',
      title: browser ? 'This browser' : 'This device',
      status: 'Saved here',
      detail: browser
        ? 'Your profile, saved details, Ask history and choices stay in this browser.'
        : 'Your profile, saved details, Ask history and choices stay in Nura on this device.',
      control: 'Clear Nura data from this device',
    },
    {
      id: 'original-files',
      title: 'Original files',
      status: 'Saved separately',
      detail: browser
        ? 'Files you keep are stored separately from the details Nura reads from them.'
        : 'File copies you keep are stored separately from the details Nura reads from them.',
      control: 'Remove a saved source',
    },
    {
      id: 'review-service',
      title: 'Nura preview review service',
      status: 'Local preview',
      detail: 'Document review details are also held by the local preview service until you remove the source or clear its review data.',
      control: 'Remove a source or clear review data',
    },
    {
      id: 'outside-provider',
      title: 'AI and search services',
      status: 'After approval',
      detail: 'A question, selected details or file is sent only after you approve that run. Nura cannot erase a copy already received by an outside provider.',
      control: 'Check the provider’s own data controls',
    },
    {
      id: 'cloud-sync',
      title: 'Nura cloud sync',
      status: 'Not connected',
      detail: 'This preview does not sync your Nura profile across devices. Check your browser or device settings for any separate backups.',
      control: 'No Nura cloud copy to remove in this preview',
    },
  ];
}
