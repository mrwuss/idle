# Territory — locations and customer base

> Design v0.3. **Every location is an extension of HQ:** the same departments,
> the same processes, but a bigger customer base. In the game today, the
> company is **IFP MSI**, and locations **unlock in order as you grow, Iowa →
> North → West → South**, each with a "New location!" announcement. The Company
> tab shows the map and each location's customer-base potential. Customer base
> starts affecting income once Departments ship.

## Real-world basis

The game's map follows how the business actually runs:

- **Founded 1972**, family-owned, headquartered in **Cedar Rapids, Iowa**.
- **Four locations** serve **13 states** plus the **Gulf Coast offshore** region.
- The work mixes **manufacturing, repair & refurbishing, design engineering and
  component distribution**.

| Region | Branch | States | Signature industries (game flavor) |
|---|---|---|---|
| **Headquarters** | Cedar Rapids, IA | Iowa, Illinois | Ag equipment OEMs, industrial manufacturing |
| **North** | Minneapolis, MN | Minnesota, North Dakota, South Dakota, Wisconsin | Mining, forestry & paper, food processing |
| **West** | Kansas City (Olathe, KS) | Kansas, Nebraska, Missouri, Oklahoma, Arkansas | Aerospace, agriculture, oil & gas, rail & trucking |
| **South** | Houston, TX | Texas, Louisiana, + Gulf offshore | Oil & gas, petrochemical, offshore, ports & marine |

The industry flavor is broad and generic on purpose: no customer or supplier
brand names, and no real employees.

## Story fit

The player is **IFP MSI**. The first shop *is* the Cedar Rapids headquarters,
and as the company grows it unlocks new locations in a fixed order:
**Iowa → North → West → South**.

| Era | Territory beat | Opens (first pass) |
|---|---|---|
| I–III | One shop in Iowa covering Iowa and Illinois | start |
| IV · Heavy Civil | **North branch**, Minneapolis | $10M earned |
| IV · Heavy Civil | **West branch**, Kansas City | $100M earned |
| V · Megaprojects | **South branch**, Houston, and the Gulf offshore jobs | $1B earned |

### Unlock rules (implemented)

- **Fixed order:** each location needs the one before it, so the company
  always grows Iowa → North → West → South.
- **Growth means lifetime earnings:** the $ earned ever, which never resets.
- **Locations are permanent.** An Overhaul rebuilds the shop, but the company
  keeps its locations. (This settles the earlier open question.)
- **Announced once:** a toast names the new branch city and its states, and the
  header switches from "Cedar Rapids, Iowa" to "N locations".

*Optional flavor:* the logbook's calendar starts in **1972**, and each era is
roughly a decade, ending in the present day.

## Every location is an extension of HQ

A new location doesn't bring new rules. It runs the **same eleven departments
and the same processes** as Cedar Rapids, and it sells the same products,
Valve-Paks, Base-Paks and Sys-Paks included. What it adds is **more customers to
sell to**.

That keeps the game easy to read. The player learns one company, and every
location makes that company bigger.

## Customer base: the demand ceiling

Each state has a **customer-base potential**. A location adds all of its states
when it opens:

| Location | States (potential) | Customer base | vs HQ |
|---|---|---:|---:|
| **HQ** · Cedar Rapids | IA 40, IL 60 | 100 | 1× |
| **North** · Minneapolis | MN 60, WI 50, ND 25, SD 15 | 150 | 1.5× |
| **West** · Kansas City | MO 60, OK 60, KS 50, NE 40, AR 40 | 250 | 2.5× |
| **South** · Houston | TX 300, LA 100, Gulf offshore 100 | 500 | 5× |
| **Total** | 13 states + Gulf | **1,000** | |

The numbers are relative and easy to change (`STATES[].customers` in
`src/data.js`). If you have a better sense of the real relative sizes, swap them in.

**How it plays (with Departments):** customers set the most the company can
sell, however much the shop can produce.

```
demand ceiling ($/s) = customer base of open locations × market penetration × $ per customer point
realized income      = min(Order Line throughput, demand ceiling)
```

- **Locations widen the market.** Each unlock is a big step: total customer base
  goes 100 → 250 → 500 → 1,000, so the ceiling rises ×2.5, ×2 and ×2.
- **Outside Sales digs deeper into it.** *Market penetration* grows with
  Outside Sales headcount and the industry markets they open (ag equipment,
  mining, aerospace, oil & gas…). That's the steady growth between unlocks.
- When the shop out-produces its customers, the alert says so: *"Customers are
  maxed out: 30% of production unsold. Grow Outside Sales or open the next
  location."* Opening a new location is the big release.

**Implemented so far:** each Outside Sales rep's reach is multiplied by
`√(customer base ÷ HQ's)`, so opening locations makes Outside Sales easier to
keep covered. Markets and the hard demand ceiling are still to come.

## Industries by state (flavor for markets and projects)

| State | Signature industry | State | Signature industry |
|---|---|---|---|
| IA | Ag equipment | KS | Aerospace |
| IL | Heavy equipment manufacturing | NE | Irrigation & agriculture |
| MN | Mining (Iron Range) | MO | General manufacturing |
| WI | Paper mills & foundries | OK | Oil & gas |
| ND | Oil fields (Bakken) | AR | Food processing & trucking |
| SD | Agriculture | TX | Oil & gas, petrochemical |
| GULF | Offshore platforms | LA | Petrochemical, ports & marine |

These name the Outside Sales markets, and they tag Sys-Pak projects with a place
(for example, "Gulf platform HPU", "Iron Range crusher system", "Wichita test
stand"). Projects from a location only show up once it's open.

## Implementation phases

1. **Done.** Territory map, unlock order with announcements, locations kept
   through Overhaul, customer base shown per location and in total.
2. **With Departments.** Demand ceiling = customer base × market penetration;
   Outside Sales drives penetration; the "customers maxed out" alert.
3. **Projects and markets.** Location-tagged Sys-Pak projects and per-state
   industry markets.

## Open questions

- Do the relative customer-base sizes (South biggest, then West, North, HQ) feel
  right for the business?
- Should the map stay a tidy tile grid, or switch to a real (stylized)
  geographic map later?
