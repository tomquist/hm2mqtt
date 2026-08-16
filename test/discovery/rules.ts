import { DiscoveryBaseline } from './baseline.js';

/**
 * Rules that compare what a release published against what the working tree
 * publishes. They encode the failure modes that only show up on an existing
 * installation, where Home Assistant applies the new discovery message to an
 * entity that already exists.
 */

export interface StateTopicRemoval {
  deviceType: string;
  topic: string;
}

function stateTopicOf(config: unknown): string | undefined {
  if (config === null || typeof config !== 'object') {
    return undefined;
  }
  const value = (config as Record<string, unknown>)['state_topic'];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Find entities that keep existing but lose their state topic.
 *
 * Home Assistant does not reconcile subscriptions when a discovery update
 * leaves an entity subscribed to nothing: it keeps the old subscription, drops
 * the value template that belonged with it, and hands the entity the whole
 * payload as its state. Every installation that already had the entity then
 * logs an error per message until Home Assistant is restarted (issue #418).
 *
 * Adding a state topic is fine, and so is removing the entity outright — only
 * the in-place removal of a state topic is caught here.
 */
export function findStateTopicRemovals(
  released: DiscoveryBaseline[],
  current: DiscoveryBaseline[],
): StateTopicRemoval[] {
  const currentByType = new Map(current.map(baseline => [baseline.deviceType, baseline]));
  const removals: StateTopicRemoval[] = [];

  for (const before of released) {
    const after = currentByType.get(before.deviceType);
    if (!after) {
      // The device type is gone entirely; that is not this rule's business.
      continue;
    }
    for (const [topic, config] of Object.entries(before.components)) {
      if (stateTopicOf(config) === undefined) {
        continue;
      }
      if (!(topic in after.components)) {
        continue;
      }
      const updated = after.components[topic];
      if (updated !== null && stateTopicOf(updated) === undefined) {
        removals.push({ deviceType: before.deviceType, topic });
      }
    }
  }
  return removals;
}

export function describeStateTopicRemovals(removals: StateTopicRemoval[]): string {
  return removals.map(removal => `${removal.deviceType}: ${removal.topic}`).join('\n');
}
