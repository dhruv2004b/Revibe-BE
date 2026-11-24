import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { HELPLINES } from '../../domain/catalog.js';
import { now } from '../../domain/clock.js';
import { HttpError, notFound } from '../../domain/errors.js';
import type { Comment, Post } from '../../domain/types.js';
import { moderate, REPORT_HIDE_THRESHOLD } from '../../services/moderation.js';
import { uidOf } from '../auth.js';
import type { Deps } from '../deps.js';
import { parse } from '../errors.js';

export const TOPICS = ['general', 'stress', 'study', 'work', 'sleep', 'motivation', 'wins'] as const;

const NewPost = z.object({ text: z.string().trim().min(3).max(1000), topic: z.enum(TOPICS).default('general') }).strict();
const NewComment = z.object({ text: z.string().trim().min(1).max(500) }).strict();
const Page = z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });

/** Never send author uids to other users: anonymity is the point. */
function publicPost(p: Post, me: string, liked: boolean) {
  const { uid, reportCount: _r, ...rest } = p;
  return { ...rest, mine: uid === me, likedByMe: liked };
}

function publicComment(c: Comment, me: string) {
  const { uid, ...rest } = c;
  return { ...rest, mine: uid === me };
}

function blocked(reason: string, supportNeeded: boolean): HttpError {
  return new HttpError(422, 'post_blocked', reason, { supportNeeded, helplines: supportNeeded ? HELPLINES : [] });
}

export function communityRoutes(deps: Deps): Router {
  const r = Router();

  r.get('/community/topics', (_req, res) => {
    res.json({ topics: TOPICS });
  });

  r.get('/community/posts', async (req, res) => {
    const { before, limit } = parse(Page, req.query);
    const me = uidOf(req);
    const page = await deps.store.listPosts(limit, before ?? null);
    const liked = await deps.store.likedBy(me, page.posts.map((p) => p.id));
    res.json({ posts: page.posts.map((p) => publicPost(p, me, liked.has(p.id))), nextBefore: page.nextBefore });
  });

  r.post('/community/posts', async (req, res) => {
    const input = parse(NewPost, req.body);
    const uid = uidOf(req);
    const verdict = moderate(input.text);
    if (verdict.verdict === 'block') throw blocked(verdict.reason!, verdict.supportNeeded);
    const user = await deps.store.getUser(uid);
    if (!user) throw notFound('User');
    const post: Post = {
      id: randomUUID(),
      uid,
      anonHandle: user.anonHandle,
      text: input.text,
      topic: input.topic,
      status: 'visible',
      likeCount: 0,
      commentCount: 0,
      reportCount: 0,
      createdAt: now().toISOString(),
    };
    await deps.store.createPost(post);
    res.status(201).json({
      post: publicPost(post, uid, false),
      supportNeeded: verdict.supportNeeded,
      helplines: verdict.supportNeeded ? HELPLINES : [],
    });
  });

  r.post('/community/posts/:id/like', async (req, res) => {
    res.json(await deps.store.toggleLike(req.params.id, uidOf(req)));
  });

  r.post('/community/posts/:id/report', async (req, res) => {
    const post = await deps.store.reportPost(req.params.id, uidOf(req), REPORT_HIDE_THRESHOLD);
    res.json({ reported: true, hidden: post.status !== 'visible' });
  });

  r.get('/community/posts/:id/comments', async (req, res) => {
    const me = uidOf(req);
    const post = await deps.store.getPost(req.params.id);
    if (!post || post.status !== 'visible') throw notFound('Post');
    const comments = await deps.store.listComments(post.id);
    res.json({ comments: comments.map((c) => publicComment(c, me)) });
  });

  r.post('/community/posts/:id/comments', async (req, res) => {
    const input = parse(NewComment, req.body);
    const uid = uidOf(req);
    const verdict = moderate(input.text);
    if (verdict.verdict === 'block') throw blocked(verdict.reason!, verdict.supportNeeded);
    const user = await deps.store.getUser(uid);
    if (!user) throw notFound('User');
    const comment: Comment = {
      id: randomUUID(),
      postId: req.params.id,
      uid,
      anonHandle: user.anonHandle,
      text: input.text,
      createdAt: now().toISOString(),
    };
    await deps.store.addComment(comment);
    res.status(201).json({ comment: publicComment(comment, uid), supportNeeded: verdict.supportNeeded, helplines: verdict.supportNeeded ? HELPLINES : [] });
  });

  return r;
}
