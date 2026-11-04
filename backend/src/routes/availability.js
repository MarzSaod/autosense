import express from "express";
import {
  computeDaySlots,
  formatDateKey,
  isValidDateKey,
} from "../lib/availability.js";
import {
  loadBookingsByDate,
  loadShopSettings,
  parseServiceIds,
  resolveDurationMinutes,
} from "../lib/availabilityData.js";

const router = express.Router();

/**
 * GET /api/availability/month?year=2026&month=11[&serviceIds=1,2]
 *
 * Which days of the month have at least one open slot. A day the shop is
 * closed, a day already fully booked, and a day entirely in the past all come
 * back with is_available = false; is_open distinguishes "closed that weekday"
 * from "open but nothing left", which is what the calendar strikes through.
 */
router.get("/month", async (req, res, next) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      res.status(400).json({ error: "A valid year is required." });
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: "A valid month (1-12) is required." });
      return;
    }

    const serviceIds = parseServiceIds(req.query.serviceIds);
    if (serviceIds === null) {
      res.status(400).json({ error: "serviceIds must be positive integers." });
      return;
    }

    const settings = await loadShopSettings();
    if (!settings) {
      res.status(404).json({ error: "Shop settings have not been set up." });
      return;
    }

    const { durationMinutes, error } = await resolveDurationMinutes(
      serviceIds,
      settings
    );
    if (error) {
      res.status(400).json({ error });
      return;
    }

    // Day 0 of the next month is the last day of this one.
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDateKey = formatDateKey(year, month, 1);
    const lastDateKey = formatDateKey(year, month, daysInMonth);

    const bookingsByDate = await loadBookingsByDate(firstDateKey, lastDateKey);

    const days = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = formatDateKey(year, month, day);
      const slots = computeDaySlots({
        dateKey,
        settings,
        durationMinutes,
        bookings: bookingsByDate.get(dateKey) || [],
      });

      days.push({
        date: dateKey,
        // Empty grid means the shop does not open that weekday at all.
        is_open: slots.length > 0,
        is_available: slots.some((slot) => slot.is_available),
        open_slot_count: slots.filter((slot) => slot.is_available).length,
      });
    }

    res.json({
      year,
      month,
      duration_minutes: durationMinutes,
      days,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/availability/day?date=2026-11-05[&serviceIds=1,2]
 *
 * The time slots for one day, each flagged available or not. Returns the same
 * shape the booking page's time picker already consumes:
 *   [{ date, time, is_available }]
 * An empty array means the shop is closed that day.
 */
router.get("/day", async (req, res, next) => {
  try {
    const dateKey = req.query.date;

    if (!isValidDateKey(dateKey)) {
      res.status(400).json({ error: "A valid date (YYYY-MM-DD) is required." });
      return;
    }

    const serviceIds = parseServiceIds(req.query.serviceIds);
    if (serviceIds === null) {
      res.status(400).json({ error: "serviceIds must be positive integers." });
      return;
    }

    const settings = await loadShopSettings();
    if (!settings) {
      res.status(404).json({ error: "Shop settings have not been set up." });
      return;
    }

    const { durationMinutes, error } = await resolveDurationMinutes(
      serviceIds,
      settings
    );
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const bookingsByDate = await loadBookingsByDate(dateKey, dateKey);

    res.json(
      computeDaySlots({
        dateKey,
        settings,
        durationMinutes,
        bookings: bookingsByDate.get(dateKey) || [],
      })
    );
  } catch (error) {
    next(error);
  }
});

export default router;
