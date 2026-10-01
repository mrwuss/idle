# Territory — branches, regions and states

> Design v0.1. The game already shows the territory map and the four regions on
> the **Company** tab (`REGIONS` and `STATES` in `src/data.js`). The mechanics
> below come later.

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

Grandpa's tire shop becomes the Cedar Rapids headquarters. The player grows
the company outward: north first, then west, then south to the Gulf.

| Era | Territory beat | Opens (first pass) |
|---|---|---|
| I–III | One shop in Iowa covering Iowa and Illinois | start |
| IV · Heavy Civil | **North branch**, Minneapolis | $10M earned |
| IV · Heavy Civil | **West branch**, Kansas City | $100M earned |
| V · Megaprojects | **South branch**, Houston, and the Gulf offshore jobs | $1B earned or first Overhaul |

*Optional flavor:* the logbook's calendar starts in **1972**, and each era is
roughly a decade, ending in the present day.

## How branches fit the Departments system

Branches are where the Order Line meets geography. **Working assumption (please
correct it):** each branch runs its own customer-facing departments, and HQ runs
the shared ones.

| Runs at every branch | Shared from HQ |
|---|---|
| Outside Sales, Inside Sales, Warehouse, Production (service & repair shop) | Engineering, Accounting, IT, Management, Purchasing, Quality, Safety |

So:

- A branch adds a **parallel Order Line front end**: its own leads, quotes,
  stock and shop. The branches' output then merges into HQ's shared back half
  (Quality, Accounting). Branches add capacity. They don't add new bottlenecks
  to the shared departments, but they **do** push more volume through them.
  Grow branches and you'll need to grow HQ.
- **Engineering stays at HQ,** so every Valve-Pak, Base-Pak and Sys-Pak comes
  from Cedar Rapids. Branches *sell* Paks into their regional markets, and
  Sys-Pak projects are tagged with a region (for example, "Gulf platform HPU",
  "Iron Range crusher system", "Wichita test-stand").

## Regional twists

Each region has one mechanical twist, the way each department does.

| Region | Twist | Mechanic (first pass) |
|---|---|---|
| **HQ** | Home of the shared departments | Shared-department capacity +10% per open branch (economies of scale) |
| **North** | Cold climate | Branch shop ambient **60°F**, so cooling goes further. Winter **cold-start** events: for 60 s after one, pump efficiency drops 5% unless the branch has reservoir heaters. |
| **West** | Crossroads distribution hub | Warehouse capacity ×1.5 company-wide while West is open; Rush Ship lasts longer |
| **South** | Hot, salty, high-stakes | Branch shop ambient **95°F**, so it needs more cooling. **Offshore** jobs pay ×3 but need a minimum Safety level, and their incidents cost twice as much. |

The ambient temperatures plug straight into the existing heat formula
(`T_eq = ambient + heat / k`), so a branch shop in Houston really does run hotter
than one in Minneapolis.

## States: coverage within a region

When a region opens, its branch's home state is covered. Outside Sales then
**expands coverage** state by state:

- Covering a state is a one-time purchase (`300 s × production at the time`, ×2
  for each state already covered in that region).
- Each covered state adds **+10% leads** in its region and opens that state's
  **signature market** for Outside Sales:

| State | Signature market | State | Signature market |
|---|---|---|---|
| IA | Ag equipment | KS | Aerospace |
| IL | Heavy equipment manufacturing | NE | Irrigation & agriculture |
| MN | Mining (Iron Range) | MO | General manufacturing |
| WI | Paper mills & foundries | OK | Oil & gas |
| ND | Oil fields (Bakken) | AR | Food processing & trucking |
| SD | Agriculture | TX | Oil & gas, petrochemical |
| GULF | Offshore platforms | LA | Petrochemical, ports & marine |

On the map, covered states fill with the region's color, and uncovered states
in an open region are outlined.

## Implementation phases

1. **Placeholder (done).** Territory map and region cards on the Company tab,
   driven by `REGIONS`/`STATES`, opening on the conditions above with no effect
   on income.
2. **Branches as Order Line front ends.** Opening a branch adds a parallel
   Outside Sales → Inside Sales → Warehouse feed into the shared back half.
   State coverage. Regional market multipliers. This depends on Departments v0.2.
3. **Branch shops.** Each branch gets its own small hydraulic shop floor using
   the region's ambient temperature, switched with a location picker on the
   System panel. Repair & refurbishing jobs live here as a **service bench**:
   customers bring in worn cylinders and pumps, you rebuild them for cash, and
   that's a light active loop.
4. **Offshore.** Gulf jobs: high pay, need Safety, punishing incidents.

## Open questions

- Is the "branch-local vs HQ-shared" split above how the business really works?
  For example, does each location have its own Purchasing or Warehouse? Does
  Production at a branch mean repair and service, manufacturing, or both?
- Should branches survive an Overhaul (for example, kept at level 1 as a Patent
  perk), or reset like everything else?
- Should the map stay a tidy tile grid, or switch to a real (stylized)
  geographic map later?
