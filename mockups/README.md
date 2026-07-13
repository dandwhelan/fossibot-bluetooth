# Dashboard redesign mockups

Concept pitch for reorganising the Control-tab dashboard around the two loads
that matter most in day-to-day use: **the fridge** and **the garage**.

Open [`dashboard-redesign.html`](./dashboard-redesign.html) in any browser to see
all three side by side (light/dark toggle in the top right). These are static
mockups — illustrative numbers only, nothing writes to a device.

## The idea

The current dashboard shows one battery, one input figure, one output figure —
every watt is treated the same. But the two real jobs are **keeping the fridge
cold** and **running the garage**, so the redesign gives each its own identity:

- **Fridge** → a protected, *runtime-first* load. The question is "how long until
  it's at risk?", answered with a single cooling-time number and a reserve floor.
- **Garage** → a live, *hands-on* console. Current draw plus per-output switches
  and charge-in, right under your thumb.

All three share the app's existing palette (green = charge in, blue = output,
amber = attention) and run against one F2400 scenario: 74% · +410 W in · 722 W out.

## The three directions

| # | Name | One-liner |
| - | ---- | --------- |
| 01 | **Priority Zones** | Two stacked cards ranked by worry: fridge runtime on top, garage controls below, everything else in one quiet strip. |
| 02 | **Split Rail** | One battery drawn as two rails — a thin protected fridge rail and a fat busy garage rail — with a reserve line the garage can't cross. |
| 03 | **Glance Board** | Big colour-coded tiles for a phone propped up across the room: is the fridge green, how hard is the garage pulling. |

### 01 · Priority Zones — the everyday view
Leads with the fridge because that's why you open the app. A reassuring
cooling-time number sits above a battery bar with a marked reserve floor, so
"safe" is a visible state rather than a percentage to interpret. The garage card
is control-first (live draw + output switches). Total flow, SOC ring and today's
kWh collapse into one strip at the bottom.

### 02 · Split Rail — the mental model
Same single station, drawn the way you think about it: the pack feeds two
separate rails, each owning its own runtime. A reserve line makes the safety
margin literal — garage loads shed before they eat into the fridge's hours — so
a raw net-watts number becomes a decision: keep working, or ease off.

### 03 · Glance Board — the across-the-room view
Built for distance. Two oversized hero tiles carry the fridge and garage; four
supporting tiles fill in battery, solar, today's energy and alerts. State is
encoded as colour (green fridge = safe, amber garage = working) so it reads
before you focus on a digit, and each tile doubles as a tap target.

## If we build one

The zone concept implies a small amount of real app state that doesn't exist
yet:

- A way to **label an output group** as "Fridge" vs "Garage" (or map specific
  outputs — DC → fridge, AC/USB → garage).
- A **reserve-floor setting** and the auto-shed behaviour behind it (would need
  care around the existing register guards; no new writes to Reg 68).
- Per-zone runtime = zone watts ÷ available Wh, reusing the numbers already
  computed for the remaining-time widget.

None of that is wired up here — these files are design only.
