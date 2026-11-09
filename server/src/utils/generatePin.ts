import prisma from "../config/prisma";
import { getSession as getLiveQodSession } from "../socket/liveQod";

function randomSixDigitPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function generateUniquePin(): Promise<string> {
  let pin = randomSixDigitPin();
  // Scoped to live sessions only — an ENDED session's PIN is free to reuse (see
  // the partial unique index added in scope_gamepin_uniqueness_to_live_sessions).
  // Checking the whole table here would recreate the exact bug that migration fixes.
  let existing = await prisma.quizSession.findFirst({
    where: { gamePin: pin, status: { not: "ENDED" } },
  });

  while (existing) {
    pin = randomSixDigitPin();
    existing = await prisma.quizSession.findFirst({
      where: { gamePin: pin, status: { not: "ENDED" } },
    });
  }

  return pin;
}

// Regular QOD shares the same PIN space students see as Live QOD (one "QOD PIN" button,
// auto-detected on join), so this also avoids colliding with any currently-running
// in-memory Live QOD session, on top of the usual DB uniqueness check.
export async function generateUniqueQodPin(): Promise<string> {
  let pin = randomSixDigitPin();
  let existing = await prisma.qodSession.findFirst({
    where: { gamePin: pin, status: { not: "ENDED" } },
  });

  while (existing || getLiveQodSession(pin)) {
    pin = randomSixDigitPin();
    existing = await prisma.qodSession.findFirst({
      where: { gamePin: pin, status: { not: "ENDED" } },
    });
  }

  return pin;
}