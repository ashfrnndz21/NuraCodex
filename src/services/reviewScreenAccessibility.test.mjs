import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routeSource = await readFile(new URL('../../app/review.tsx', import.meta.url), 'utf8');

test('saving staged review decisions leaves unresolved suggestions pending', () => {
  assert.match(routeSource, /function isPendingReviewClaim\(claim: CandidateClaim\)\s*\{\s*return claim\.evidenceState === 'needs_review' \|\| claim\.evidenceState === 'candidate';\s*\}/);
  assert.match(routeSource, /const operations = \[\s*\.\.\.Object\.entries\(reviewDecisions\)\.map/);
  assert.match(routeSource, /const stagedClaimIds = new Set\(operations\.filter\(\(item\) => item\.type === 'claim'\)\.map\(\(item\) => item\.claimId\)\);\s*const leftPending = allClaims\.filter\(\(claim\) => isPendingReviewClaim\(claim\) && !stagedClaimIds\.has\(claim\.id\)\)\.length;/);
  assert.match(routeSource, /other suggestion\$\{leftPending === 1 \? ' remains' : 's remain'\} pending and was not added\./);
});

test('review decisions expose accessible names, states, edited-field labels and announcements', () => {
  assert.match(routeSource, /accessibilityRole="button" accessibilityLabel=\{`\$\{stagedDecision\?\.decision === 'accept' \? 'Included in save' : purpose === 'insurance' \? 'Include policy term' : 'Include'\}: \$\{claim\.label\}`\} accessibilityHint=/);
  assert.match(routeSource, /accessibilityRole="button" accessibilityLabel=\{`\$\{editingId === claim\.id \? 'Finish editing' : 'Edit'\} \$\{claim\.label\}`\} accessibilityHint=/);
  assert.match(routeSource, /accessibilityRole="button" accessibilityLabel=\{`Dismiss \$\{claim\.label\}`\} accessibilityHint=/);
  assert.match(routeSource, /accessibilityState=\{\{ disabled: busy, selected: stagedDecision\?\.decision === 'accept', busy \}\}/);
  assert.match(routeSource, /accessibilityLabel=\{`\$\{purpose === 'insurance' \? 'Policy term name' : 'Health detail name'\} for \$\{claim\.label\}`\}/);
  assert.match(routeSource, /accessibilityLabel=\{`Value for \$\{claim\.label\}`\}/);
  assert.match(routeSource, /accessibilityLabel=\{`Result date for \$\{claim\.label\} in year-month-day format`\}/);
  assert.match(routeSource, /AccessibilityInfo\.announceForAccessibility\(`File review update\. \$\{latest\.label\}`\)/);
  assert.match(routeSource, /AccessibilityInfo\.announceForAccessibility\(announcement\)/);
  assert.match(routeSource, /accessibilityLiveRegion="polite" aria-live="polite" style=\{styles\.noticeBody\}/);
  assert.match(routeSource, /accessibilityLiveRegion="assertive" aria-live="assertive" style=\{styles\.noticeBody\}/);
});
