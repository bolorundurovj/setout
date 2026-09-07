# Roadmap

Designed but not built. Each was worked through in detail before being written down. None has been started. They are listed roughly in priority order.

Nothing here is a commitment. If you want one of these, open an issue. Demand moves items up the list.

## Budget revision history

Setout exists to replace a spreadsheet whose budget figures were entered after the money was spent. `BudgetItem` carries a `set_at` field recording when the amount was last set. Updating a budgeted amount overwrites the previous one, so there is no way to show that a budget was raised to match spending rather than the reverse. Keeping every revision is the highest priority item here.

## Price increase warnings

Setout already knows what everything used to cost: item price history is
computed from the expenses, and the add-expense form shows the last price paid.
It does not warn. Paying 7,650 a bag when the last three were 4,500 is recorded without comment. Catching an overcharge at the point of purchase is more useful than a report a month later. The data is already available; only the warning is missing.

## Settling advances

Advances record money given to somebody before they spend it, and the balance
calculation says where that leaves them: holding your money, or out of pocket
and owed it back. What is missing is the closing move. There is no way to record
cash handed back, so a balance can only be worked down by spending it, never
squared off. The number drifts, and there is nothing to show the person when you
sit down to count.

## Address warning on the land page

Setting a pin on the land form already asks the geocoder what it calls that spot,
and says so when the town, state or country disagrees with what the plot records.
Opening a land record shows nothing: the check runs where the pin is moved, not where it
is read.

The awkward part is that the record does not hold enough to repeat the check. The
address the geocoder gave is stored, but not the town, state and country the
comparison needs, so the land page would have to query again on every view.
That is cheap in practice, because answers are cached per coordinate on the
server, but it means opening a land record makes a request that opening one does not
otherwise make.

The alternative is keeping the town, state and country beside the address, so the
check needs nothing at all. It costs three columns, and they go stale the day somebody corrects a land record's town without moving its pin.

The pin-outside-the-boundary warning already shows in both places, because that
one is arithmetic on what the page has in hand.

## Vendors and people tabs on a project

Vendors and people are install-wide, and the only way to see them today is the
global lists. From inside a project you cannot answer "who have I been paying on
this build, and how much", the question somebody standing on the site actually
asks. The reverse already exists: a vendor's expenses are broken down per project.
This is the transpose, surfaced as two more tabs. Nothing new is stored.

## Project analytics

The project screen answers how much is budgeted, how much is spent, and how far
off you are. It cannot answer why. Where the money is actually going, whether
the rate of spending is sustainable, and which parts of the budget were wrong.
Budget items and expenses already carry a cost type (labour, material, fixed)
and nothing reads it back yet, which makes it the cheapest missing cut.

## Recording expenses offline

The add-expense screen was built for one-handed use on a phone at the
merchant's counter. A building site is exactly where the signal is not, and today
a lost connection means a lost entry: the form posts or it fails. There is no
service worker, nothing is cached or queued, and the app does not open at all
without the server. For an application whose purpose is recording expenses at the
moment it happens, this is the widest gap left.

## A mobile app

The web app is already built for a phone: the add-expense screen works one
handed on a 360px screen, and it is where the app is used, standing at
a counter with a receipt in the other hand. What the browser cannot give it is
the camera one tap away, a share target so a photographed receipt can be sent
straight to a project, a home screen icon that opens instantly, and a push when
somebody holding your cash is running low.

The first step is not a separate codebase. Offline capture above brings a
service worker and a queue, which is most of what makes the web app installable;
adding a manifest and treating it as a progressive web app buys the icon, the
launch and the camera on both Android and iOS for a fraction of the cost. A
native build, sharing the generated SDK, only earns its place if push and
background upload turn out to matter more than that.

Either way the API stays as it is. Setout is self-hosted, so an app store build
would have to ask which server it is talking to before anything else, and that
question is worth designing before writing any of it.

## Signing in through an OpenID Connect provider

Setout authenticates one person with one passphrase. This would let an operator
point it at their own provider (Keycloak, Authentik, Auth0, Google) and let
each external identity become its own account. The second part matters most: it is the groundwork for multi-account support rather than another way into the same single account. It changes the shape of authentication, so it
should not be picked up before the smaller product work above.

## More than one person, with roles

Setout assumes one person: one account, one passphrase, no roles anywhere. A project is rarely run alone. The site manager records expenses, the person holding the cash needs to see their own balance, and whoever is paying wants to see the figures without being able to change the budget.

That means accounts as a real concept rather than a single row, an invitation
flow, and a small set of roles, with the budget as the dividing line: owner sets budgets and manages people, editor records expenses and manages vendors, viewer reads and exports. It also means every list and total depends on who is asking, and that soft deletes and the data export need to record who did what.

This is the largest item here and it touches nearly every endpoint. It shares its
foundation with the OpenID Connect work above: both need identity to stop being
`User.first()`. Whichever is built first should implement that part properly for the other.
