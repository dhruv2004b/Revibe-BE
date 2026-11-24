import { randomInt } from 'node:crypto';

const ADJECTIVES = ['Calm', 'Brave', 'Gentle', 'Bright', 'Quiet', 'Kind', 'Steady', 'Sunny', 'Mellow', 'Bold', 'Soft', 'Wise'];
const ANIMALS = ['Otter', 'Panda', 'Fox', 'Owl', 'Koala', 'Dolphin', 'Sparrow', 'Tiger', 'Turtle', 'Deer', 'Lotus', 'Robin'];

/** Anonymous community name like "CalmOtter42". */
export function randomHandle(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]}${ANIMALS[randomInt(ANIMALS.length)]}${randomInt(10, 100)}`;
}
