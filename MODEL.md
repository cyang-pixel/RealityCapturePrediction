# Prediction Engine — How Estimates Are Generated

Think of it like estimating how long a road trip will take. You can use Google Maps' default speed estimates — or you can use your own past drives on that same road.

---

## The Core Formula

```
Arrival Time  =  Target Finish Time  −  Duration

Duration  =  (Scan Positions × Time per Position) × Floor Factor × Site Friction
```

| Piece | Plain English |
|---|---|
| **Scan Positions** | How many spots you set the scanner down |
| **Time per Position** | How long each position actually takes — scan + move + setup |
| **Floor Factor** | +7% extra time per additional floor (elevators, stairwells) |
| **Site Friction** | Multiplier for escorts (+10%), construction (+15%), etc. |

The result is shown as a **±12.5% window** — e.g. "132–170 mins" — because no two days are identical.

---

## Where "Time per Position" Comes From

This is the most important number, and the model finds it in priority order:

**① Your real logs (best)** — if you've fed in approved logs matching the same scanner + environment + complexity:

```
Time per Position  =  Total hours on site ÷ Total scans completed
```

This captures everything your team actually does: move, level, scan, swap batteries, wait for access.

**② Nearby logs** — if no exact match, the model borrows from similar environments or complexity levels and scales the number proportionally.

**③ Spec sheet fallback (default until logs exist)** — no real data yet, so it uses Leica's published scan times. Fast for BLK360 (~30 sec capture-only), but doesn't account for movement or setup, so estimates can run short.

> **RTC360 exception:** The spec fallback is anchored to a real field estimate — 65–80 scans from 8am to 3pm — giving ~5:48 effective time per position at Medium 6mm until real logs replace it.

---

## How Logs Train the Model

```
Submit log  →  Admin approves  →  Feed to model  →  Estimates improve
```

The app matches your current job against past jobs with the **same scanner, environment, and complexity**. More matches = tighter, more reliable estimates.

| Logs matched | Confidence | What the model uses |
|---|---|---|
| 0 | Low | Leica spec sheet only |
| 1–4 | Low | Real data, but thin — one outlier skews it |
| 5–19 | Med | Reliable average across varied conditions |
| 20+ | High | Fully calibrated to your team's real pace |

---

## What Makes a Log Most Useful

- **Honest times** — arrival and departure are what the formula divides by, accuracy matters most here
- **Right scanner** — BLK360 and RTC360 are tracked separately and never cross-train each other
- **No major delays** — delay logs are excluded so one bad day doesn't inflate future baselines
- **Same environment** — an Airport log directly improves Airport estimates; an Office log won't help a terminal job

---

## Scanner-Specific Notes

| Scanner | Fallback tps | Source |
|---|---|---|
| BLK360 G2 | 30s (Dense 12mm) | Leica spec — capture only |
| RTC360 Medium | ~348s total | Field estimate: 65–80 scans / 8am–3pm |
| RTC360 High | ~399s total | Scaled from Medium + 162s capture |

**Bottom line:** Right now every BLK360 estimate runs on Leica defaults. One good approved BLK360 Airport log fed into the model immediately replaces the spec-sheet math with your team's actual field pace.
