import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { CONSULTANTS } from '../../domain/catalog.js';
import { addDays, dateKey, now } from '../../domain/clock.js';
import { badRequest, notFound } from '../../domain/errors.js';
import type { Booking } from '../../domain/types.js';
import { uidOf } from '../auth.js';
import type { Deps } from '../deps.js';
import { parse } from '../errors.js';

const SLOT_HOURS = ['10:00', '13:00', '16:00', '18:30'];
const BOOKING_DAYS = 5;

/** Demo availability: the next few days at fixed IST hours. */
export function slotsFor(today: string): string[] {
  const slots: string[] = [];
  for (let d = 1; d <= BOOKING_DAYS; d++) {
    const day = addDays(today, d);
    for (const h of SLOT_HOURS) slots.push(`${day}T${h}:00+05:30`);
  }
  return slots;
}

const NewBooking = z
  .object({
    consultantId: z.string(),
    slot: z.string(),
    note: z.string().max(500).default(''),
  })
  .strict();

export function supportRoutes(deps: Deps): Router {
  const r = Router();

  r.get('/consultants', (_req, res) => {
    const today = dateKey(now(), deps.timeZone);
    res.json({ consultants: CONSULTANTS.map((c) => ({ ...c, slots: slotsFor(today) })) });
  });

  r.post('/bookings', async (req, res) => {
    const input = parse(NewBooking, req.body);
    const consultant = CONSULTANTS.find((c) => c.id === input.consultantId);
    if (!consultant) throw notFound('Consultant');
    const today = dateKey(now(), deps.timeZone);
    if (!slotsFor(today).includes(input.slot)) throw badRequest('invalid_slot', 'That time is not available');
    const booking: Booking = {
      id: randomUUID(),
      uid: uidOf(req),
      consultantId: consultant.id,
      slot: input.slot,
      note: input.note,
      status: 'requested',
      createdAt: now().toISOString(),
    };
    await deps.store.createBooking(booking);
    res.status(201).json({ booking });
  });

  r.get('/bookings', async (req, res) => {
    res.json({ bookings: await deps.store.listBookings(uidOf(req)) });
  });

  return r;
}
