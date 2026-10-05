const THEMES = Object.freeze({
  cholesterol: Object.freeze({ id: 'cholesterol', colors: ['#183D38', '#2E6458', '#76563E'], accent: '#B8E7D7', symbol: '◉' }),
  glucose: Object.freeze({ id: 'glucose', colors: ['#292B50', '#514B7B', '#86577C'], accent: '#D6D1FF', symbol: '◇' }),
  heart: Object.freeze({ id: 'heart', colors: ['#48242D', '#783C49', '#A86061'], accent: '#FFC4B8', symbol: '♥' }),
  nutrition: Object.freeze({ id: 'nutrition', colors: ['#273C31', '#46654A', '#85885B'], accent: '#D8E7A8', symbol: '❧' }),
  sleep: Object.freeze({ id: 'sleep', colors: ['#24283F', '#414667', '#6F668D'], accent: '#D9D3FF', symbol: '☾' }),
  movement: Object.freeze({ id: 'movement', colors: ['#203642', '#345D6C', '#658A83'], accent: '#B9E5E9', symbol: '↗' }),
  general: Object.freeze({ id: 'general', colors: ['#38231F', '#704838', '#9A684E'], accent: '#F2BD9D', symbol: '✦' }),
});

/** Pick an illustration palette from the selected health topic without inferring anything about the viewer. */
export function getVideoArtworkTheme(topic) {
  const normalized = typeof topic === 'string' ? topic.trim().toLowerCase() : '';
  if (/cholesterol|lipid/.test(normalized)) return THEMES.cholesterol;
  if (/blood\s*sugar|glucose|diabet/.test(normalized)) return THEMES.glucose;
  if (/heart|cardiovascular/.test(normalized)) return THEMES.heart;
  if (/nutrition|diet|food/.test(normalized)) return THEMES.nutrition;
  if (/sleep|insomnia/.test(normalized)) return THEMES.sleep;
  if (/exercise|movement|physical\s*activity|fitness/.test(normalized)) return THEMES.movement;
  return THEMES.general;
}
