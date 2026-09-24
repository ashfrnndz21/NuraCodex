import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeProfileContext } from './agentContextScope.mjs';

const profile = {
  facts: [{ id: 'lab-a' }, { id: 'lab-b' }, { id: 'unrelated' }],
  topics: [{ id: 'bp' }, { id: 'sleep' }],
  links: [
    { id: 'topic-fact', from: 'topic:bp', to: 'fact:lab-a' },
    { id: 'fact-treatment', from: 'fact:lab-a', to: 'treatment:rx-a' },
    { id: 'topic-visit', from: 'visit:visit-a', to: 'topic:bp' },
    { id: 'unrelated', from: 'topic:sleep', to: 'fact:unrelated' },
  ],
  treatments: [{ id: 'rx-a' }, { id: 'rx-b' }],
  visits: [{ id: 'visit-a' }, { id: 'visit-b' }],
};

test('topic Ask scope contains only the selected topic and explicitly linked records', () => {
  assert.deepEqual(scopeProfileContext(profile, 'topic:bp'), {
    facts: [{ id: 'lab-a' }],
    topics: [{ id: 'bp' }],
    links: [profile.links[0], profile.links[2]],
    treatments: [],
    visits: [{ id: 'visit-a' }],
  });
});

test('record Ask scope follows explicit links but does not include every treatment or visit', () => {
  const scoped = scopeProfileContext(profile, 'fact:lab-a');
  assert.deepEqual(scoped.facts, [{ id: 'lab-a' }]);
  assert.deepEqual(scoped.topics, [{ id: 'bp' }]);
  assert.deepEqual(scoped.treatments, [{ id: 'rx-a' }]);
  assert.deepEqual(scoped.visits, []);
  assert.equal(scoped.links.length, 2);
});

test('asset Ask scope does not inherit unrelated personal records', () => {
  assert.deepEqual(scopeProfileContext(profile, 'asset:paper-a'), {
    facts: [], topics: [], links: [], treatments: [], visits: [],
  });
});

test('general Ask may use the profile selected in the consent sheet', () => {
  assert.equal(scopeProfileContext(profile, null), profile);
});
